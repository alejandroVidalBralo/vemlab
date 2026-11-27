/* =====================================================================
   VEMLAB · Máquina de corriente continua
   - Inducido (A1–A2), devanado de excitación serie (D1–D2) y devanado
     de excitación derivación / independiente (E1–E2) accesibles en la
     caja de bornes: con cables se monta excitación independiente,
     derivación, serie o compuesta (aditiva o diferencial), como motor
     o como generador.
   - Modelo: circuitos R–L de cada devanado integrados en el tiempo
     (Euler implícito) dentro del análisis nodal del montaje, f.e.m.
     E = kΦ·ω con curva de magnetización saturada, magnetismo remanente
     con memoria de polaridad (el generador autoexcitado solo ceba si
     la conexión y el sentido de giro son los correctos) y reacción de
     inducido.
   - Banco: fuente doble de c.c. regulable (inducido y excitación),
     reóstatos de arranque y de campo, carga resistiva y dinamómetro de
     cuatro cuadrantes.
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};
    var Mech = VEM.Mech, Dyno = VEM.Dyno, RPM = Math.PI / 30;

    /* ---------------- Resolución de sistemas reales ---------------- */
    function solveReal(n, A, b) {
        var i, j, k;
        for (k = 0; k < n; k++) {
            var piv = k, best = Math.abs(A[k * n + k]);
            for (i = k + 1; i < n; i++) { var m = Math.abs(A[i * n + k]); if (m > best) { best = m; piv = i; } }
            if (best === 0) continue;
            if (piv !== k) {
                for (j = 0; j < n; j++) { var t = A[k * n + j]; A[k * n + j] = A[piv * n + j]; A[piv * n + j] = t; }
                var tb = b[k]; b[k] = b[piv]; b[piv] = tb;
            }
            var p = A[k * n + k];
            for (i = k + 1; i < n; i++) {
                var f = A[i * n + k] / p;
                if (f === 0) continue;
                for (j = k; j < n; j++) A[i * n + j] -= f * A[k * n + j];
                b[i] -= f * b[k];
            }
        }
        var x = new Float64Array(n);
        for (i = n - 1; i >= 0; i--) {
            var s = b[i];
            for (j = i + 1; j < n; j++) s -= A[i * n + j] * x[j];
            x[i] = A[i * n + i] === 0 ? 0 : s / A[i * n + i];
        }
        return x;
    }
    VEM.solveReal = solveReal;

    /* Red resistiva (c.c.) para el análisis nodal */
    function RNet(n) {
        this.n = n; this.A = new Float64Array(n * n); this.b = new Float64Array(n);
        for (var i = 0; i < n; i++) this.A[i * n + i] = 1e-9;
    }
    RNet.prototype.g = function (a, b, g) {
        var n = this.n, A = this.A;
        if (a >= 0) A[a * n + a] += g;
        if (b >= 0) A[b * n + b] += g;
        if (a >= 0 && b >= 0) { A[a * n + b] -= g; A[b * n + a] -= g; }
    };
    /* fuente de corriente J que circula de a hacia b por fuera de la red (entra en b) */
    RNet.prototype.j = function (a, b, J) { if (a >= 0) this.b[a] -= J; if (b >= 0) this.b[b] += J; };
    RNet.prototype.solve = function () { return this.n ? solveReal(this.n, this.A, this.b) : new Float64Array(0); };

    /* ---------------- Curva de magnetización ---------------- */
    var SAT_A = 1.2, RHO = 0.035, AR = 0.04;
    /* kΦ relativo a la f.m.m. relativa x (1 ⇒ kΦ nominal) */
    function gMag(x) { return Math.tanh(SAT_A * x) / Math.tanh(SAT_A); }

    /* ---------------- Catálogo ----------------
       Pn potencia útil, Un tensión de inducido, nn velocidad, Ifn corriente de excitación nominal (E1–E2).
       Ra inducido (con polos auxiliares y escobillas), La inductancia de inducido.
       Rsh, Lsh devanado derivación. Rs, Ls devanado serie; ser = f.m.m. serie a la intensidad nominal / f.m.m. nominal.
       Pm pérdidas mecánicas y Pfe pérdidas en el hierro a velocidad y flujo nominales. exc: excitación de la placa. */
    var CATALOG = [
        { id: 'CA', name: 'Máquina C.C. A', Pn: 2200, Un: 220, nn: 1500, Ifn: 0.60, Ra: 1.20, La: 0.020, Rsh: 280, Lsh: 100,
          Rs: 0.12, Ls: 0.004, ser: 0.08, Pm: 50, Pfe: 60, J: 0.040, exc: 'shunt', nmax: 2000, code: 'DC-112', ip: 'IP23', cls: 'F' },
        { id: 'CB', name: 'Máquina C.C. B', Pn: 1100, Un: 220, nn: 3000, Ifn: 0.42, Ra: 2.60, La: 0.025, Rsh: 420, Lsh: 70,
          Rs: 0.25, Ls: 0.005, ser: 0.06, Pm: 40, Pfe: 35, J: 0.012, exc: 'shunt', nmax: 3600, code: 'DC-90', ip: 'IP23', cls: 'F' },
        { id: 'CC', name: 'Motor serie C', Pn: 1500, Un: 220, nn: 1500, Ifn: 0.55, Ra: 1.00, La: 0.022, Rsh: 300, Lsh: 90,
          Rs: 0.60, Ls: 0.030, ser: 1.00, Pm: 45, Pfe: 50, J: 0.030, exc: 'series', nmax: 2500, code: 'DC-100S', ip: 'IP23', cls: 'F' }
    ];

    function prepare(m) {
        var P = Object.assign({}, m);
        P.wn = P.nn * RPM;
        /* resistencia del circuito de inducido en la conexión de placa */
        var Rarm = P.Ra + (P.exc === 'series' ? P.Rs : 0);
        var T = (P.Pn + P.Pm + P.Pfe) / P.wn;
        /* kΦ·ωn = Un − Rarm·T/kΦ  ⇒  ωn·kΦ² − Un·kΦ + Rarm·T = 0 */
        P.kPhi = (P.Un + Math.sqrt(P.Un * P.Un - 4 * P.wn * Rarm * T)) / (2 * P.wn);
        P.In = T / P.kPhi;
        /* f.m.m. serie referida al devanado derivación (amperios equivalentes por amperio) */
        P.kSer = P.ser * P.Ifn / P.In;
        P.Tn = P.Pn / P.wn;
        var Pin = P.Un * P.In + (P.exc === 'series' ? 0 : P.Un * P.Ifn);
        P.eta = P.Pn / Pin;
        P.plate = { Pn: P.Pn, Un: P.Un, In: P.In, nn: P.nn, Ifn: P.Ifn, Uf: P.Un, exc: P.exc, eta: P.eta, Tn: P.Tn, nmax: P.nmax };
        return P;
    }

    /* ---------------- Bornes del banco ---------------- */
    var TERMINALS = [
        'ps.A+', 'ps.A-', 'ps.F+', 'ps.F-',
        'a1.a', 'a1.b', 'v1.a', 'v1.b', 'a2.a', 'a2.b', 'v2.a', 'v2.b', 'mm.a', 'mm.b',
        'd.A1', 'd.A2', 'd.D1', 'd.D2', 'd.E1', 'd.E2',
        'ra.1', 'ra.2', 'rf.1', 'rf.2', 'ld.+', 'ld.-'
    ];
    var Y_AMM = 100, Y_VOLT = 1e-6, Y_MM = 1e-7;
    var SRC = {
        A: { p: 'ps.A+', n: 'ps.A-', Umax: 250, R: 0.15, Ith: 25, Imag: 80, name: 'inducido' },
        F: { p: 'ps.F+', n: 'ps.F-', Umax: 250, R: 1.0, Ith: 3, Imag: 10, name: 'excitación' }
    };
    var RH = { A: { max: 40, I: 15 }, F: { max: 1000, I: 1.5 } };       /* reóstatos de arranque y de campo */
    var LOAD = { U: 220, P: 250, steps: 10 };                            /* carga: 10 escalones de 250 W a 220 V */
    var H = 0.001, J_DYNO = 0.02;

    function DCLab(model) {
        this.kind = 'dc';
        this.terminals = TERMINALS;
        this.cables = []; this.bridges = {};
        this.on = false; this.variac = 0;
        this.out = { A: false, F: false };                   /* contactores de salida de la fuente */
        this.U = { A: 0, F: 0 };                             /* consignas de tensión (V) */
        this.rh = { A: RH.A.max, F: 0 };                     /* reóstatos (Ω) */
        this.load = { n: 0, on: false };
        this.dyno = new Dyno();
        this.w = 0; this.locked = false;
        this.th = 0; this.thSrc = { A: 0, F: 0 };
        this.trip = null; this.r = null; this.events = []; this.trace = null;
        this.setModel(model);
        this.rewire();
    }

    DCLab.prototype.setModel = function (m) {
        this.P = prepare(m);
        this.J = this.P.J + J_DYNO;
        this.dyno.setTmax(2.5 * this.P.Tn);
        this.dyno.nmax = this.P.nmax;
        this.dyno.J = J_DYNO;
        this.dyno.Tset = Math.max(-this.dyno.Tmax, Math.min(this.dyno.Tset, this.dyno.Tmax));
        this.dyno.nset = Math.min(this.dyno.nset, this.dyno.nmax);
        this.w = 0; this.th = 0;
        this.resetCurrents();
        this.sigma = 1;                                      /* polaridad del magnetismo remanente */
    };
    DCLab.prototype.resetCurrents = function () { this.i = { a: 0, e: 0, d: 0 }; };
    DCLab.prototype.rewire = function () {
        this.topo = VEM.Circuit.topology(this.cables, {}, TERMINALS, {}, 'ps.A-');
        this.resetCurrents();
    };
    DCLab.prototype.emit = function (type, msg) { this.events.push({ type: type, msg: msg }); };
    DCLab.prototype.switchOn = function () {
        if (this.on) return true;
        if (this.th > 100) { this.emit('error', 'La protección térmica de la máquina sigue activada. Espera a que se enfríen los devanados.'); return false; }
        this.on = true; this.trip = null;
        return true;
    };
    DCLab.prototype.switchOff = function () { this.on = false; };
    DCLab.prototype.tripOut = function (msg) {
        this.on = false; this.trip = msg;
        /* el accionamiento del dinamómetro deja de arrastrar */
        if (this.dyno.mode === 'n' || this.dyno.Tset < 0) { this.dyno.setMode('T', this.w); this.dyno.Tset = Math.max(0, this.dyno.Tset); this.emit('dyno', 'T'); }
        this.emit('trip', msg);
    };

    /* flujo (kΦ) a partir de las corrientes de excitación y de inducido */
    DCLab.prototype.kPhi = function (i) {
        var P = this.P, u = (i.e + P.kSer * i.d) / P.Ifn, ia = i.a / P.In;
        if (u > 0.25) this.sigma = 1; else if (u < -0.25) this.sigma = -1;
        var x = u * (1 - AR * Math.min(4, ia * ia)) + RHO * this.sigma;
        return P.kPhi * gMag(x);
    };
    DCLab.prototype.lossTorque = function (w, kphi) {
        var P = this.P, s = 0.3 + 0.7 * Math.abs(w) / P.wn, f = kphi / P.kPhi;
        return (P.Pm + P.Pfe * f * f) / P.wn * s;
    };

    /* Monta la red y la resuelve.
       mode 'run': devanados como R–L (Euler implícito) con f.e.m.; diodos de libre circulación de la fuente.
       mode 'ohm': red resistiva sin fuentes con 1 mA inyectado por el polímetro. */
    DCLab.prototype.network = function (mode, kphi, diodes) {
        var nd = this.topo.node, P = this.P, net = new RNet(this.topo.n), i = this.i, self = this;
        function N(t) { return nd[t]; }
        net.g(N('a1.a'), N('a1.b'), Y_AMM); net.g(N('a2.a'), N('a2.b'), Y_AMM);
        net.g(N('v1.a'), N('v1.b'), Y_VOLT); net.g(N('v2.a'), N('v2.b'), Y_VOLT);
        if (mode !== 'ohm') net.g(N('mm.a'), N('mm.b'), Y_MM);
        net.g(N('ra.1'), N('ra.2'), 1 / Math.max(0.01, this.rh.A));
        net.g(N('rf.1'), N('rf.2'), 1 / Math.max(0.05, this.rh.F));
        if (this.load.on && this.load.n > 0) net.g(N('ld.+'), N('ld.-'), this.load.n * LOAD.P / (LOAD.U * LOAD.U));
        var br = [['d.A1', 'd.A2', P.Ra, P.La, 'a'], ['d.E1', 'd.E2', P.Rsh, P.Lsh, 'e'], ['d.D1', 'd.D2', P.Rs, P.Ls, 'd']], out = {};
        br.forEach(function (b) {
            if (mode === 'ohm') { net.g(N(b[0]), N(b[1]), 1 / b[2]); return; }
            var Lh = b[3] / H, G = 1 / (b[2] + Lh), e = b[4] === 'a' ? kphi * self.w : 0;
            var J = G * (Lh * i[b[4]] - e);
            net.g(N(b[0]), N(b[1]), G); net.j(N(b[0]), N(b[1]), J);
            out[b[4]] = { G: G, J: J, a: b[0], b: b[1] };
        });
        ['A', 'F'].forEach(function (k) {
            var s = SRC[k], p = N(s.p), q = N(s.n);
            if (mode === 'ohm') { if (self.on && self.out[k]) net.g(p, q, 1 / s.R); return; }
            if (self.on && self.out[k]) { net.g(p, q, 1 / s.R); net.j(q, p, self.U[k] / s.R); }
            /* diodo de libre circulación en antiparalelo con la salida */
            net.g(p, q, diodes[k] ? 200 : 1e-7);
        });
        if (mode === 'ohm') net.j(N('mm.b'), N('mm.a'), 1e-3);
        var x = net.solve();
        function V(t) { var k = nd[t]; return k === undefined || k < 0 ? 0 : x[k]; }
        return { V: V, br: out };
    };

    DCLab.prototype.solve = function (kphi) {
        var diodes = this.diodes || { A: false, F: false }, r, it;
        for (it = 0; it < 4; it++) {
            r = this.network('run', kphi, diodes);
            var ch = false, self = this;
            ['A', 'F'].forEach(function (k) {
                var u = r.V(SRC[k].p) - r.V(SRC[k].n), d = diodes[k];
                var nd = d ? (u < 0.05) : (u < -0.7);
                /* si conduce, comprueba que la corriente va en sentido directo */
                if (nd !== d) { diodes[k] = nd; ch = true; }
            });
            if (!ch) break;
        }
        this.diodes = diodes;
        return r;
    };

    DCLab.prototype.step = function (dt) {
        dt = Math.min(dt, 0.1);
        var P = this.P, n = Math.max(1, Math.ceil(dt / H)), self = this, r = null, k, kphi = 0;
        for (var s = 0; s < n; s++) {
            kphi = this.kPhi(this.i);
            r = this.solve(kphi);
            /* corrientes nuevas de los devanados */
            var ni = {};
            ['a', 'e', 'd'].forEach(function (b) { var q = r.br[b]; ni[b] = q.G * (r.V(q.a) - r.V(q.b)) + q.J; });
            this.i = ni;
            var Tem = kphi * ni.a;
            /* -------- mecánica -------- */
            var dy = this.dyno.update(this.w, H, this.J);
            this.w = Mech.shaftStep({ w: this.w, J: this.J, Tem: Tem, drive: dy.drive, brake: dy.brake, locked: this.locked, h: H,
                Tloss: function (w) { return self.lossTorque(w, kphi); } });
            this.Tem = Tem; this.kphiNow = kphi;
            /* -------- protecciones -------- */
            var Iout = {};
            ['A', 'F'].forEach(function (q) {
                var sc = SRC[q];
                Iout[q] = self.on && self.out[q] ? (self.U[q] - (r.V(sc.p) - r.V(sc.n))) / sc.R : 0;
            });
            this.Iout = Iout;
            var trip = null;
            ['A', 'F'].forEach(function (q) {
                var sc = SRC[q], I = Math.abs(Iout[q]);
                if (!trip && self.on && I > sc.Imag) trip = 'Disparo magnético del interruptor Q1: ' + Math.round(I) + ' A en la salida de ' + sc.name + '. ' +
                    (q === 'A' ? '¿Arranque sin reóstato o con el inducido parado a plena tensión? ¿Cortocircuito en el montaje?' : '¿Cortocircuito en el circuito de excitación?');
                var x = I / sc.Ith;
                if (x > 1) self.thSrc[q] += (x * x - 1) * H; else self.thSrc[q] *= Math.exp(-H / 30);
                if (!trip && self.thSrc[q] > 40) { self.thSrc[q] = 0; trip = 'Disparo térmico del interruptor Q1: sobrecarga mantenida en la salida de ' + sc.name + ' (más de ' + sc.Ith + ' A).'; }
            });
            var xm = Math.max(Math.abs(ni.a) / P.In, Math.abs(ni.d) / P.In, Math.abs(ni.e) / (1.4 * P.Ifn));
            if (xm > 1.05) this.th += (xm * xm - 1.1) * H; else this.th *= Math.exp(-H / 20);
            if (!trip && this.th > 150) trip = 'Disparo de la protección térmica (sondas PTC) de la máquina: la corriente en los devanados ha superado la nominal durante demasiado tiempo.';
            if (!trip && Math.abs(this.w) > 1.1 * P.nmax * RPM)
                trip = 'Disparo por sobrevelocidad: ' + Math.round(Math.abs(this.w) / RPM) + ' min⁻¹ (máx. ' + P.nmax + '). ' +
                    (P.exc === 'series' || Math.abs(ni.d) > 0.2 * P.In ? '¿Motor serie en vacío?' : '¿Se ha abierto o debilitado demasiado el circuito de excitación?');
            if (trip && (this.on || this.dyno.mode === 'n' || this.dyno.Tset < 0)) {
                this.tripOut(trip);
                /* tras una sobrevelocidad el dinamómetro frena la máquina hasta pararla */
                if (/sobrevelocidad/.test(trip)) { this.dyno.Tset = Math.max(this.dyno.Tset, Math.round(0.5 * P.Tn)); this.emit('dyno', 'T'); }
            }
        }
        this.r = r;
        return r;
    };

    DCLab.prototype.ohmmeter = function () {
        if (this.topo.node['mm.a'] === this.topo.node['mm.b']) return 0;
        var r = this.network('ohm', 0, {});
        return (r.V('mm.a') - r.V('mm.b')) / 1e-3;
    };

    DCLab.prototype.readings = function () {
        if (!this.r) this.step(H);
        var r = this.r, V = r.V, P = this.P;
        function d(a, b) { return V(a) - V(b); }
        var mmV = Math.abs(d('mm.a', 'mm.b')), mm;
        mm = mmV > 0.5 ? { live: true, V: mmV } : { R: this.ohmmeter() };
        var T = Mech.shaftTorque(this.dyno, this.w, this.Tem || 0, this.lossTorque(0, this.kphiNow || 0), this.locked);
        return {
            on: this.on,
            a1: d('a1.a', 'a1.b') * Y_AMM, a2: d('a2.a', 'a2.b') * Y_AMM,
            v1: d('v1.a', 'v1.b'), v2: d('v2.a', 'v2.b'), mm: mm,
            uA: this.on && this.out.A ? d(SRC.A.p, SRC.A.n) : 0, uF: this.on && this.out.F ? d(SRC.F.p, SRC.F.n) : 0,
            iA: this.Iout ? this.Iout.A : 0, iF: this.Iout ? this.Iout.F : 0,
            n: this.w / RPM, T: T, Pm: T * Math.abs(this.w),
            ia: this.i.a, ie: this.i.e, id: this.i.d, E: (this.kphiNow || 0) * this.w, kphi: this.kphiNow || 0,
            Iline: Math.max(Math.abs(this.Iout ? this.Iout.A : 0), 0),
            thermal: Math.min(1, this.th / 150), w1: { P: 0 }, w2: { P: 0 }, am: 0, vm: 0
        };
    };

    DCLab.SRC = SRC; DCLab.RH = RH; DCLab.LOAD = LOAD; DCLab.H = H;
    VEM.DC = { catalog: CATALOG, prepare: prepare, TERMINALS: TERMINALS, gMag: gMag, SRC: SRC, RH: RH, LOAD: LOAD };
    VEM.DCLab = DCLab;
    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
