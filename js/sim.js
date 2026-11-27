/* =====================================================================
   VEMLAB · Simulación del banco en tiempo real
   - Régimen eléctrico cuasiestacionario (fasores) resuelto en cada paso.
   - Dinámica mecánica: J·dω/dt = Tem − Tpérdidas − Tfreno, con
     rozamiento estático (el motor puede no arrancar).
   - Protecciones: magnetotérmico de la fuente (cortocircuitos y
     sobrecargas) y sondas térmicas (PTC) en los devanados del motor.
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};
    var Circuit = VEM.Circuit, Motor = VEM.Motor;

    var U_MAX = 440;              /* tensión de línea máxima de la fuente (V) */
    var I_MAG = 100;              /* disparo magnético de la fuente (A) */
    var I_SRC = 16;               /* calibre térmico de la fuente (A) */
    var J_BRAKE = 0.008;          /* inercia del freno y acoplamiento (kg·m²) */
    var H = 0.002;                /* paso de integración (s) */

    function Lab(motor) {
        this.kind = 'motor';
        this.terminals = Circuit.TERMINALS;
        this.setMotor(motor);
        this.cables = [];
        this.bridges = {};
        this.on = false;
        this.variac = 0;            /* 0…1 */
        this.brake = 0;             /* consigna de par del freno (N·m) */
        this.locked = false;
        this.w = 0;                 /* velocidad angular (rad/s) */
        this.Esat = 0;
        this.thMotor = 0;           /* integral térmica del motor */
        this.thSrc = 0;             /* integral térmica de la fuente */
        this.trip = null;           /* motivo del último disparo */
        this.r = null;
        this.events = [];
        this.trace = [];
        this.rewire();
    }

    Lab.prototype.setMotor = function (m) {
        this.P = Motor.prepare(m);
        this.J = this.P.J + J_BRAKE;
        this.w = 0; this.Esat = 0; this.thMotor = 0;
    };

    Lab.prototype.setModel = Lab.prototype.setMotor;

    Lab.prototype.rewire = function () {
        this.topo = Circuit.topology(this.cables, this.bridges);
        this.conn = Circuit.motorConnection(this.topo);
    };

    Lab.prototype.emit = function (type, msg) { this.events.push({ type: type, msg: msg }); };

    Lab.prototype.Eph = function () { return this.variac * U_MAX / Math.sqrt(3); };

    Lab.prototype.switchOn = function () {
        if (this.on) return true;
        if (this.thMotor > 100) {
            this.emit('error', 'La protección térmica del motor sigue activada. Espera a que se enfríen los devanados.');
            return false;
        }
        this.on = true; this.trip = null;
        return true;
    };
    Lab.prototype.switchOff = function () { this.on = false; };

    Lab.prototype.tripOut = function (msg) {
        this.on = false; this.trip = msg;
        this.emit('trip', msg);
    };

    Lab.prototype.solve = function () {
        var ws = Motor.ws(this.P);
        var s = 1 - this.w / ws;
        if (Math.abs(s) < 1e-7) s = 1e-7;
        return Circuit.solveAC({ topo: this.topo, P: this.P, s: s, Esat: this.Esat, on: this.on, Eph: this.Eph() });
    };

    /* Avanza la simulación dt segundos */
    Lab.prototype.step = function (dt) {
        dt = Math.min(dt, 0.1);
        var P = this.P, n = Math.max(1, Math.ceil(dt / H)), h = dt / n, r = null;
        for (var k = 0; k < n; k++) {
            r = this.solve();
            this.Esat += (r.Emag - this.Esat) * 0.5;
            /* -------- mecánica -------- */
            var Tf = Motor.frictionTorque(P, this.w), Tb = this.brake, Tres = Tf + Tb;
            if (this.locked) {
                this.w = 0;
            } else if (Math.abs(this.w) < 1e-3) {
                if (Math.abs(r.Tem) > Tres) this.w += (r.Tem - Math.sign(r.Tem) * Tres) / this.J * h;
                else this.w = 0;
            } else {
                var sg = Math.sign(this.w);
                var wn = this.w + (r.Tem - sg * Tres) / this.J * h;
                this.w = (Math.sign(wn) !== sg && Math.abs(r.Tem) <= Tres) ? 0 : wn;
            }
            /* traza fina (cada subpaso) para el modo X–Y del osciloscopio */
            if (this.trace && !this.locked && Math.abs(this.w) > 1e-3 && this.trace.length < 30000)
                this.trace.push(this.w * 30 / Math.PI, (this.w < 0 ? -r.Tem : r.Tem) - Motor.frictionTorque(P, this.w));
            /* -------- protecciones -------- */
            if (this.on) {
                if (r.Iline > I_MAG) {
                    this.tripOut('Disparo magnético del interruptor de la fuente: corriente de ' + Math.round(r.Iline) + ' A. Hay un cortocircuito en el montaje (¿amperímetro o bobina amperimétrica en paralelo? ¿dos fases unidas?).');
                    r = this.solve();
                    break;
                }
                var xs = r.Iline / I_SRC;
                if (xs > 1) this.thSrc += (xs * xs - 1) * h; else this.thSrc *= Math.exp(-h / 30);
                if (this.thSrc > 60) {
                    this.thSrc = 0;
                    this.tripOut('Disparo térmico del interruptor de la fuente: sobrecarga mantenida por encima de ' + I_SRC + ' A.');
                    r = this.solve();
                    break;
                }
            } else this.thSrc *= Math.exp(-h / 30);
            var xm = Math.max(r.Iw[0], r.Iw[1], r.Iw[2]) / P.Iwn;
            if (xm > 1.05) this.thMotor += (xm * xm - 1.1) * h; else this.thMotor *= Math.exp(-h / 20);
            if (this.thMotor > 150 && this.on) {
                this.tripOut('Disparo de la protección térmica (sondas PTC) del motor: la corriente en los devanados ha superado la nominal durante demasiado tiempo.');
                r = this.solve();
                break;
            }
        }
        this.r = r;
        return r;
    };

    /* Lecturas (sin ruido) de todo el banco */
    Lab.prototype.readings = function () {
        var r = this.r || this.solve(), P = this.P;
        var mm;
        if (this.on && r.mmV > 0.5) mm = { live: true, V: r.mmV };
        else mm = { R: Circuit.ohmmeter(this.topo, P, this.on) };
        var Tshaft;
        if (this.locked) Tshaft = Math.abs(r.Tem);
        else if (Math.abs(this.w) > 1e-3) Tshaft = this.brake;
        else Tshaft = Math.min(this.brake, Math.max(0, Math.abs(r.Tem) - Motor.frictionTorque(P, 0)));
        return {
            on: this.on,
            Uout: this.on ? r.Uout : 0,
            w1: r.w1, w2: r.w2, am: r.am, vm: r.vm, mm: mm,
            n: this.w * 30 / Math.PI, T: Tshaft,
            /* par motor por el método de aceleración: Tm = J·dω/dt + T freno (= Tem − T pérdidas mecánicas) */
            Tm: (this.locked || Math.abs(this.w) < 1e-3) ? Tshaft : (this.w < 0 ? -r.Tem : r.Tem) - Motor.frictionTorque(P, this.w),
            amC: r.amC, vmC: r.vmC, ws: Motor.ws(P),
            Pin: r.Pin, Tem: r.Tem, Iw: r.Iw, Vw: r.Vw, Vneg: r.Vneg, Vpos: r.Vpos,
            thermal: Math.min(1, this.thMotor / 150), Iline: r.Iline, lines: r.lines
        };
    };

    Lab.U_MAX = U_MAX;
    VEM.Lab = Lab;
    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
