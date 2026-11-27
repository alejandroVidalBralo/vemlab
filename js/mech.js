/* =====================================================================
   VEMLAB · Mecánica común
   - Dinamómetro de cuatro cuadrantes acoplado al eje de la máquina en
     ensayo: modo PAR (freno pasivo, se opone al giro) y modo VELOCIDAD
     (accionamiento con regulador PI y limitación de par: arrastra la
     máquina como generador o la frena como motor).
   - Integración del eje con rozamiento estático (la máquina puede no
     arrancar) y medida del par en el acoplamiento.
   Todas las piezas son independientes de la máquina para poder
   reutilizarlas en cualquier banco y en el modo libre.
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};
    var RPM = Math.PI / 30;

    /* ---------------- Dinamómetro ---------------- */
    function Dyno(o) {
        o = o || {};
        this.mode = o.mode === 'n' ? 'n' : 'T';  /* 'T' par · 'n' velocidad */
        this.Tset = +o.Tset || 0;                /* consigna de par (N·m): > 0 frena; < 0 arrastra en el sentido elegido */
        this.nset = +o.nset || 0;                /* consigna de velocidad (min⁻¹, ≥ 0) */
        this.dir = o.dir === -1 ? -1 : 1;        /* sentido en modo velocidad: +1 horario */
        this.Tmax = 10;                          /* par máximo del accionamiento (N·m) */
        this.nmax = 3000;                        /* velocidad máxima de consigna (min⁻¹) */
        this.ramp = 600;                         /* rampa de velocidad (min⁻¹/s) */
        this.J = 0.01;                           /* inercia del dinamómetro (kg·m²) */
        this.wref = 0; this.int = 0; this.Tdrive = 0;
    }
    /* Par máximo del accionamiento redondeado para que la escala del mando sea simétrica y legible */
    Dyno.prototype.setTmax = function (T) {
        var M = T > 50 ? 20 : T > 16 ? 10 : 5;
        this.Tmax = Math.ceil(T / M) * M; this.Tmajor = M;
        this.Tset = Math.max(-this.Tmax, Math.min(this.Tset, this.Tmax));
    };
    Dyno.prototype.state = function () { return { mode: this.mode, Tset: this.Tset, nset: this.nset, dir: this.dir }; };
    Dyno.prototype.setMode = function (m, w) {
        /* paso de VELOCIDAD a PAR sin tirón: la consigna de par toma el par que daba el regulador */
        if (this.mode === 'n' && m === 'T' && Math.abs(w || 0) > 1) {
            var T = this.Tdrive * Math.sign(w);
            this.Tset = Math.max(-this.Tmax, Math.min(this.Tmax, Math.round(-T * 20) / 20));
            if (this.Tset < 0) this.dir = w < 0 ? -1 : 1;
        }
        this.mode = m;
        /* al pasar a velocidad, el regulador parte de la velocidad actual (sin tirón) */
        this.wref = w || 0; this.int = m === 'n' && Math.abs(w || 0) > 1 ? this.Tdrive : 0;
        if (m === 'T') this.Tdrive = 0;
    };
    /* Par activo del accionamiento (con signo, en el sentido +ω) y par de freno pasivo (módulo) */
    Dyno.prototype.update = function (w, h, Jtot) {
        if (this.mode !== 'n') {
            this.wref = w; this.int = 0;
            if (this.Tset >= 0) { this.Tdrive = 0; return { drive: 0, brake: this.Tset }; }
            /* consigna negativa: el dinamómetro actúa como motor en el sentido elegido */
            this.Tdrive = -this.Tset * this.dir;
            return { drive: this.Tdrive, brake: 0 };
        }
        var wt = this.dir * Math.min(this.nset, this.nmax) * RPM, dw = this.ramp * RPM * h;
        this.wref += Math.max(-dw, Math.min(dw, wt - this.wref));
        /* PI ajustado a la inercia total: ancho de banda ≈ 25 rad/s */
        var Kp = Jtot * 25, Ki = Kp * 6, e = this.wref - w;
        var T = Kp * e + this.int + Ki * e * h;
        if (T > this.Tmax) T = this.Tmax; else if (T < -this.Tmax) T = -this.Tmax;
        else this.int += Ki * e * h;             /* antisaturación: integra solo sin limitar */
        this.int = Math.max(-this.Tmax, Math.min(this.Tmax, this.int));
        this.Tdrive = T;
        return { drive: T, brake: 0 };
    };

    /* ---------------- Eje ----------------
       o: { w, J, Tem, Tloss(w) (par de pérdidas, módulo, ≥ 0), drive (con signo), brake (módulo), locked, h }
       Devuelve la nueva ω y el par en el acoplamiento visto por la máquina (positivo = la máquina entrega par). */
    function shaftStep(o) {
        var w = o.w, h = o.h, act = o.Tem + (o.drive || 0);
        var Tl = o.Tloss(w), Tres = Tl + (o.brake || 0), wn;
        if (o.locked) wn = 0;
        else if (Math.abs(w) < 1e-3) {
            wn = Math.abs(act) > Tres ? w + (act - Math.sign(act) * Tres) / o.J * h : 0;
        } else {
            var sg = Math.sign(w);
            wn = w + (act - sg * Tres) / o.J * h;
            if (Math.sign(wn) !== sg && Math.abs(act) <= Tres) wn = 0;
        }
        return wn;
    }

    /* Par medido por la célula de carga del dinamómetro con convenio de potencia:
       positivo cuando la máquina en ensayo entrega potencia mecánica (motor),
       negativo cuando la absorbe (generador arrastrado). */
    function shaftTorque(dyno, w, Tem, Tloss, locked) {
        var sg = Math.abs(w) > 1e-3 ? Math.sign(w) : 0;
        if (dyno.mode === 'n') {
            if (sg === 0) return locked ? Math.abs(Tem) : -dyno.Tdrive * (dyno.dir || 1);
            return -dyno.Tdrive * sg;
        }
        if (locked) return Math.abs(Tem);
        if (dyno.Tset < 0) return sg !== 0 ? -dyno.Tdrive * sg : -dyno.Tdrive * dyno.dir;
        if (sg !== 0) return dyno.Tset;
        return Math.min(dyno.Tset, Math.max(0, Math.abs(Tem) - Tloss));
    }

    VEM.Dyno = Dyno;
    VEM.Mech = { shaftStep: shaftStep, shaftTorque: shaftTorque, RPM: RPM };
    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
