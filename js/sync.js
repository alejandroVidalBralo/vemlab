/* =====================================================================
   VEMLAB · Máquina síncrona trifásica
   - Estátor con los seis extremos accesibles (U1–U2, V1–V2, W1–W2) y
     devanado de excitación F1–F2 alimentado por una fuente de c.c.
   - Modelo de rotor liso: f.e.m. E proporcional a la velocidad y a la
     curva de vacío saturada (con magnetismo remanente), reactancia
     síncrona proporcional a la frecuencia, reactancias inversa y
     homopolar propias, y devanado amortiguador (par proporcional al
     deslizamiento respecto a la red).
   - Dos frecuencias a la vez: la red (50 Hz) y el alternador (p·n/60).
     Se resuelve la red por superposición a cada frecuencia y se
     combinan los fasores con el ángulo relativo θ(t): así salen las
     pulsaciones de las lámparas de sincronización, el sincronoscopio,
     el golpe al acoplar fuera de fase y el par sincronizante.
   - Banco: fuente trifásica (red), vatímetros, amperímetro, voltímetro,
     fuente de excitación, panel de sincronización con el interruptor de
     acoplamiento Q2, carga R–L–C y dinamómetro de cuatro cuadrantes.
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};
    var Cx = VEM.Cx, C = Cx.C, Circuit = VEM.Circuit, Mech = VEM.Mech, Dyno = VEM.Dyno, RPM = Math.PI / 30;
    var W50 = 2 * Math.PI * 50;

    /* ---------------- Catálogo ----------------
       Valores por bobina. xs, x2, x0, xpp: reactancias síncrona, inversa, homopolar y subtransitoria (p.u.);
       ra resistencia (p.u.); If0 corriente de excitación de vacío a tensión y velocidad asignadas. */
    var CATALOG = [
        { id: 'S1', name: 'Máquina síncrona A', Sn: 3000, Vwn: 230, f: 50, p: 2, xs: 1.2, ra: 0.05, x2: 0.18, x0: 0.08, xpp: 0.14,
          If0: 1.2, Rf: 55, Lf: 12, J: 0.05, Pm: 60, Pfe: 70, code: 'SG-100', ip: 'IP23' },
        { id: 'S2', name: 'Máquina síncrona B', Sn: 5000, Vwn: 230, f: 50, p: 3, xs: 1.0, ra: 0.04, x2: 0.16, x0: 0.07, xpp: 0.12,
          If0: 1.6, Rf: 40, Lf: 10, J: 0.12, Pm: 80, Pfe: 100, code: 'SG-132', ip: 'IP23' }
    ];

    /* curva de vacío normalizada: E/Ev = g(If/If0), g(1) = 1, con saturación progresiva */
    var BETA = 2.5, RHO = 0.02;
    function gS(x) { return (1 + BETA) * x / (BETA + Math.abs(x)); }
    function gInv(y) { return BETA * y / (1 + BETA - y); }

    var J_DYNO = 0.02;
    function prepare(m) {
        var P = Object.assign({}, m);
        P.ns = 60 * P.f / P.p; P.wn = P.ns * RPM;
        P.Zb = P.Vwn * P.Vwn / (P.Sn / 3);
        P.Xs = P.xs * P.Zb; P.Ra = P.ra * P.Zb; P.X2 = P.x2 * P.Zb; P.X0 = P.x0 * P.Zb; P.Xpp = P.xpp * P.Zb;
        P.In = P.Sn / 3 / P.Vwn;
        /* excitación asignada: cos φ = 0,8 inductivo a tensión e intensidad asignadas */
        var I = Cx.polar(P.In, -36.87), E = Cx.add(C(P.Vwn), Cx.mul(C(P.Ra, P.Xs), I));
        P.Ifn = P.If0 * gInv(Cx.abs(E) / P.Vwn);
        P.Tn = 0.8 * P.Sn / P.wn;
        /* amortiguador: ≈ 30 % del amortiguamiento crítico de la oscilación electromecánica */
        var Ks = P.p * 3 * P.Vwn * P.Vwn / (P.Xs * P.wn);
        P.Kd = 0.6 * Math.sqrt(Ks * (P.J + J_DYNO));
        P.Tdmax = 1.2 * P.Tn;
        P.plate = { Sn: P.Sn, Uy: Math.round(P.Vwn * Math.sqrt(3) / 10) * 10, Ud: P.Vwn, Iy: P.In, Id: P.In * Math.sqrt(3), n: P.ns, f: P.f, cos: 0.8, Ifn: P.Ifn, Ufn: P.Ifn * P.Rf, If0: P.If0 };
        P.nmax = Math.round(1.25 * P.ns);
        return P;
    }

    /* ---------------- Bornes ---------------- */
    var M_T = ['m.U1', 'm.V1', 'm.W1', 'm.U2', 'm.V2', 'm.W2', 'm.F1', 'm.F2'];
    var SY_T = ['sy.L1', 'sy.L2', 'sy.L3', 'sy.G1', 'sy.G2', 'sy.G3'];
    var EX_T = ['ex.+', 'ex.-'];
    var LD_T = ['ld.L1', 'ld.L2', 'ld.L3', 'ld.N'];
    var TERMINALS = Circuit.BASE_TERMINALS.concat(M_T, SY_T, EX_T, LD_T);
    var BRIDGES = Object.assign({}, Circuit.BRIDGES, { Q2a: ['sy.L1', 'sy.G1'], Q2b: ['sy.L2', 'sy.G2'], Q2c: ['sy.L3', 'sy.G3'] });
    var PORTS = [['m.U1', 'm.U2'], ['m.V1', 'm.V2'], ['m.W1', 'm.W2']];
    var Y_AMM = Circuit.Y_AMM, Y_VOLT = Circuit.Y_VOLT, ZS = C(0.12, 0.22);
    var LOAD = { U: 400, R: 300, L: 300, C: 300, steps: 10 };
    var EXC = { Umax: 250, Ith: 5, Imag: 15 };
    var U_MAX = 440, I_MAG = 100, I_SRC = 16, H = 0.004;

    /* Admitancia por fase de la carga a la frecuencia f */
    function loadY(ld, f) {
        if (!ld.on || f < 0.5) return C(0, 0);
        var V2 = Math.pow(LOAD.U / Math.sqrt(3), 2), k = f / 50;
        var G = ld.R * LOAD.R / 3 / V2, BL = ld.L * LOAD.L / 3 / V2 / k, BC = ld.C * LOAD.C / 3 / V2 * k;
        var yl = BL > 0 ? Cx.inv(C(0.05 / (BL * k), 1 / BL)) : C(0, 0);
        return Cx.add(C(G, BC), yl);
    }
    /* Matriz de admitancias del estátor a la frecuencia f */
    function statorY(P, f) {
        var k = Math.max(f, 0.5) / P.f;
        return Circuit.mat3(Cx.inv(C(P.Ra, P.X0 * k)), Cx.inv(C(P.Ra, P.Xs * k)), Cx.inv(C(P.Ra, P.X2 * k)));
    }
    function mulV(Y, V) { return [0, 1, 2].map(function (i) { var s = C(0, 0); for (var j = 0; j < 3; j++) s = Cx.add(s, Cx.mul(Y[i][j], V[j])); return s; }); }

    function SyncLab(model) {
        this.kind = 'sync';
        this.terminals = TERMINALS;
        this.cables = []; this.bridges = {};
        this.on = false; this.variac = 0;
        this.q2 = false;                         /* interruptor de acoplamiento */
        this.lampMode = 'dark';                  /* 'dark' lámparas apagadas · 'rot' lámparas giratorias */
        this.ex = { U: 0, on: false };           /* fuente de excitación */
        this.load = { R: 0, L: 0, C: 0, on: false };
        this.dyno = new Dyno();
        this.w = 0; this.locked = false; this.If = 0; this.sigma = 1;
        this.theta = 0;                          /* ángulo eléctrico del alternador respecto a la red */
        this.th = 0; this.thSrc = 0; this.thEx = 0; this.oos = 0;
        this.trip = null; this.r = null; this.events = []; this.trace = null;
        this.setModel(model);
        this.rewire();
    }
    SyncLab.prototype.setModel = function (m) {
        this.P = prepare(m);
        this.J = this.P.J + J_DYNO;
        this.dyno.setTmax(2 * this.P.Tn);
        this.dyno.nmax = this.P.nmax;
        this.dyno.Tset = Math.max(-this.dyno.Tmax, Math.min(this.dyno.Tset, this.dyno.Tmax));
        this.dyno.nset = Math.min(this.dyno.nset, this.dyno.nmax);
        this.w = 0; this.th = 0; this.If = 0; this.theta = 0;
    };
    SyncLab.prototype.rewire = function () {
        var br = Object.assign({}, this.bridges);
        if (this.q2) { br.Q2a = 1; br.Q2b = 1; br.Q2c = 1; }
        this.topo = Circuit.topology(this.cables, br, TERMINALS, BRIDGES);
        /* circuito de excitación: polaridad de la conexión fuente → F1–F2 */
        var R = this.topo.root;
        var a = R('ex.+'), b = R('ex.-'), f1 = R('m.F1'), f2 = R('m.F2');
        this.exShort = a === b;
        this.exPol = (a === f1 && b === f2 && a !== b) ? 1 : (a === f2 && b === f1 && a !== b) ? -1 : 0;
        this.fieldShort = f1 === f2;
    };
    SyncLab.prototype.emit = function (type, msg) { this.events.push({ type: type, msg: msg }); };
    SyncLab.prototype.Eph = function () { return this.variac * U_MAX / Math.sqrt(3); };
    SyncLab.prototype.switchOn = function () {
        if (this.on) return true;
        if (this.th > 100) { this.emit('error', 'La protección térmica de la máquina sigue activada. Espera a que se enfríen los devanados.'); return false; }
        this.on = true; this.trip = null;
        return true;
    };
    SyncLab.prototype.switchOff = function () { this.on = false; };
    SyncLab.prototype.stopDrive = function () {
        if (this.dyno.mode === 'n' || this.dyno.Tset < 0) { this.dyno.setMode('T', this.w); this.dyno.Tset = Math.max(0, this.dyno.Tset); this.emit('dyno', 'T'); }
    };
    SyncLab.prototype.tripOut = function (msg, keepSource) {
        if (!keepSource) this.on = false;
        this.trip = msg;
        if (this.q2) { this.q2 = false; this.rewire(); }
        if (!keepSource) this.stopDrive();
        this.emit('trip', msg);
    };

    /* f.e.m. por fase (eficaz) y frecuencia eléctrica del alternador */
    SyncLab.prototype.emf = function () {
        var P = this.P, x = this.If / P.If0;
        if (x > 0.25) this.sigma = 1; else if (x < -0.25) this.sigma = -1;
        var E = P.Vwn * gS(Math.abs(x + RHO * this.sigma)) * Math.abs(this.w) / P.wn;
        return { E: E, f: P.p * Math.abs(this.w) / (2 * Math.PI), sg: this.w < 0 ? -1 : 1 };
    };

    /* Resuelve la red a la frecuencia f. withGrid: fuente activa; Em: f.e.m. del alternador (o null). */
    SyncLab.prototype.solveAt = function (f, withGrid, Em, sg) {
        var topo = this.topo, nd = topo.node, P = this.P, net = new Circuit.Net(topo.n), k = f / 50;
        function N(t) { return nd[t]; }
        net.adm(N('w1.Ia'), N('w1.Ib'), C(Y_AMM)); net.adm(N('w1.Ua'), N('w1.Ub'), C(Y_VOLT));
        net.adm(N('w2.Ia'), N('w2.Ib'), C(Y_AMM)); net.adm(N('w2.Ua'), N('w2.Ub'), C(Y_VOLT));
        net.adm(N('am.a'), N('am.b'), C(Y_AMM)); net.adm(N('vm.a'), N('vm.b'), C(Y_VOLT));
        var YS = Cx.inv(C(ZS.re, ZS.im * k)), Es = [Cx.polar(this.Eph(), 0), Cx.polar(this.Eph(), -120), Cx.polar(this.Eph(), 120)];
        if (this.on) ['src.L1', 'src.L2', 'src.L3'].forEach(function (t, i) {
            net.adm(N(t), -1, YS);
            if (withGrid) net.inj(N(t), Cx.mul(Es[i], YS));
        });
        var Y = statorY(P, f), ports = PORTS.map(function (p) { return [N(p[0]), N(p[1])]; });
        net.ports(ports, Y);
        var Ev = [C(0), C(0), C(0)];
        if (Em) {
            Ev = [Cx.polar(Em, 0), Cx.polar(Em, -120 * sg), Cx.polar(Em, 120 * sg)];
            var J = mulV(Y, Ev);
            ports.forEach(function (p, i) { net.inj(p[0], J[i]); net.inj(p[1], Cx.scale(J[i], -1)); });
        }
        var yl = loadY(this.load, f);
        ['ld.L1', 'ld.L2', 'ld.L3'].forEach(function (t) { net.adm(N(t), N('ld.N'), yl); });
        var x = net.solve();
        function V(t) { var i = nd[t]; return i === undefined || i < 0 ? C(0, 0) : C(x.re[i], x.im[i]); }
        var Vp = PORTS.map(function (p) { return Cx.sub(V(p[0]), V(p[1])); });
        /* corriente que sale del estátor por el principio de cada bobina (convenio generador) */
        var Iout = mulV(Y, Ev.map(function (e, i) { return Cx.sub(e, Vp[i]); }));
        var src = ['src.L1', 'src.L2', 'src.L3'].map(function (t, i) {
            return this.on ? Cx.mul(Cx.sub(withGrid ? Es[i] : C(0), V(t)), YS) : C(0);
        }, this);
        return { V: V, Vp: Vp, Iout: Iout, Ev: Ev, src: src, yl: yl };
    };

    SyncLab.prototype.solve = function () {
        var e = this.emf(), A = this.solveAt(50, true, null, 1), B = null;
        if (e.f > 0.5 && e.E > 0.05) B = this.solveAt(e.f, false, e.E, e.sg);
        return { A: A, B: B, e: e };
    };

    /* Combina los fasores de las dos frecuencias en el marco de la red */
    SyncLab.prototype.combine = function (s) {
        var rot = Cx.polar(1, this.theta * 180 / Math.PI), B = s.B, A = s.A;
        var fast = B && Math.abs(s.e.f - 50) > 2.5;
        function at(fa, fb) { return B ? Cx.add(fa, Cx.mul(fb, rot)) : fa; }
        return {
            fast: fast,
            V: function (t) { return at(A.V(t), B ? B.V(t) : C(0)); },
            Vd: function (a, b) { return Cx.sub(this.V(a), this.V(b)); },
            /* lectura eficaz: con mucho deslizamiento el aparato ve la suma cuadrática */
            mag: function (a, b) {
                var va = Cx.sub(A.V(a), A.V(b));
                if (!B) return Cx.abs(va);
                var vb = Cx.sub(B.V(a), B.V(b));
                return fast ? Math.sqrt(Cx.abs2(va) + Cx.abs2(vb)) : Cx.abs(Cx.add(va, Cx.mul(vb, rot)));
            },
            power: function (ua, ub, ia, ib) {
                function p(S) {
                    var U = Cx.sub(S.V(ua), S.V(ub)), I = Cx.scale(Cx.sub(S.V(ia), S.V(ib)), Y_AMM);
                    return { U: U, I: I };
                }
                var a = p(A);
                if (!B) return { P: a.U.re * a.I.re + a.U.im * a.I.im, Q: a.U.im * a.I.re - a.U.re * a.I.im, U: Cx.abs(a.U), I: Cx.abs(a.I) };
                var b = p(B);
                if (fast) return {
                    P: a.U.re * a.I.re + a.U.im * a.I.im + b.U.re * b.I.re + b.U.im * b.I.im,
                    Q: a.U.im * a.I.re - a.U.re * a.I.im + b.U.im * b.I.re - b.U.re * b.I.im,
                    U: Math.sqrt(Cx.abs2(a.U) + Cx.abs2(b.U)), I: Math.sqrt(Cx.abs2(a.I) + Cx.abs2(b.I))
                };
                var U = Cx.add(a.U, Cx.mul(b.U, rot)), I = Cx.add(a.I, Cx.mul(b.I, rot));
                return { P: U.re * I.re + U.im * I.im, Q: U.im * I.re - U.re * I.im, U: Cx.abs(U), I: Cx.abs(I) };
            }
        };
    };

    /* Tensiones entre los contactos L_i y G_perm(i), sin componente homopolar */
    function poleV(c, perm) {
        var L = ['sy.L1', 'sy.L2', 'sy.L3'], G = ['sy.G1', 'sy.G2', 'sy.G3'];
        var d = perm.map(function (j, i) { return c.Vd(L[i], G[j]); });
        var m = Cx.scale(Cx.add(Cx.add(d[0], d[1]), d[2]), 1 / 3);
        return d.map(function (v) { return Cx.abs(Cx.sub(v, m)); });
    }
    SyncLab.prototype.lossTorque = function (w, E) {
        var P = this.P, s = 0.3 + 0.7 * Math.abs(w) / P.wn, fe = (E || 0) / P.Vwn;
        return (P.Pm + P.Pfe * fe * fe) / P.wn * s;
    };

    SyncLab.prototype.closeQ2 = function () {
        if (this.q2) return true;
        var s = this.solve(), c = this.combine(s), P = this.P;
        var uL = Cx.abs(c.Vd('sy.L1', 'sy.L2')), uG = Cx.abs(c.Vd('sy.G1', 'sy.G2'));
        /* tensión entre los contactos de cada polo de Q2 justo antes de cerrar (sin la componente homopolar
           del neutro flotante del alternador, que no hace circular corriente) */
        var dV = Math.max.apply(null, poleV(c, [0, 1, 2]));
        this.q2 = true; this.rewire();
        if (uL > 20 && uG > 20) {
            /* corriente subtransitoria del cierre: diferencia de tensión entre los polos / X″ */
            var Ipk = Math.SQRT2 * dV / (P.Xpp + Cx.abs(ZS)), df = Math.abs(s.e.f - 50);
            if (Ipk > I_MAG || (df > 1 && Ipk > 0.5 * I_MAG)) {
                this.tripOut('Disparo magnético de Q1 al cerrar el acoplamiento fuera de sincronismo: pico de corriente de unos ' + Math.round(Ipk) + ' A (ΔU = ' + Math.round(dV) + ' V entre los contactos de Q2, Δf = ' + VEM.fmtN(df, 2) + ' Hz).');
                return false;
            }
            if (Ipk > 2 * P.In || df > 0.3) {
                /* golpe de par en el eje */
                this.emit('warn', 'Acoplamiento brusco: ΔU ≈ ' + Math.round(dV) + ' V entre los contactos de Q2 y Δf = ' + VEM.fmtN(df, 2) + ' Hz. La máquina ha recibido un golpe de par; en una máquina real esto daña el eje y los devanados.');
            }
        }
        return true;
    };
    SyncLab.prototype.openQ2 = function () { if (this.q2) { this.q2 = false; this.rewire(); } };

    SyncLab.prototype.step = function (dt) {
        dt = Math.min(dt, 0.1);
        var P = this.P, n = Math.max(1, Math.ceil(dt / H)), self = this, s = null, c = null;
        for (var k = 0; k < n; k++) {
            /* -------- excitación (circuito R–L) -------- */
            var Uex = this.on && this.ex.on && !this.exShort ? this.ex.U * this.exPol : 0;
            if (this.exPol === 0 || !this.on || !this.ex.on) {
                /* sin fuente: la corriente se extingue por el diodo de libre circulación (o al abrir el circuito) */
                var tau = this.exPol === 0 && !this.fieldShort ? 0.03 : P.Lf / P.Rf;
                this.If *= Math.exp(-H / tau);
            } else this.If += (Uex - (P.Rf + 1) * this.If) / P.Lf * H;
            s = this.solve(); c = this.combine(s);
            /* -------- par electromagnético (motor) -------- */
            var e = s.e, Pe = 0, rot = Cx.polar(1, this.theta * 180 / Math.PI), Iw = [0, 0, 0];
            if (s.B) {
                for (var i = 0; i < 3; i++) {
                    var Eg = s.B.Ev[i], IB = s.B.Iout[i], IA = s.A.Iout[i];
                    Pe += Eg.re * IB.re + Eg.im * IB.im;
                    var Er = Cx.mul(Eg, rot);
                    Pe += Er.re * IA.re + Er.im * IA.im;
                    Iw[i] = e.f > 0 && Math.abs(e.f - 50) <= 2.5 ? Cx.abs(Cx.add(IA, Cx.mul(IB, rot))) : Math.sqrt(Cx.abs2(IA) + Cx.abs2(IB));
                }
            } else for (i = 0; i < 3; i++) Iw[i] = Cx.abs(s.A.Iout[i]);
            var Tem = Math.abs(this.w) > 1e-3 ? -Pe / this.w : 0;
            /* amortiguador: par de tipo asíncrono respecto a la red a la que está conectado */
            var Va = Cx.abs(s.A.Vp[0]) / P.Vwn, wsm = W50 / P.p, Td = 0;
            if (Va > 0.05) {
                var ws = this.w >= 0 ? wsm : -wsm;
                Td = Math.max(-P.Tdmax, Math.min(P.Tdmax, P.Kd * (ws - this.w))) * Va * Va;
            }
            Tem += Td;
            /* -------- mecánica -------- */
            /* pérdidas en el hierro con el flujo del entrehierro (≈ tensión en bornes) */
            var Vt = s.B ? Cx.abs(Cx.add(s.A.Vp[0], Cx.mul(s.B.Vp[0], rot))) : Cx.abs(s.A.Vp[0]);
            var dy = this.dyno.update(this.w, H, this.J), Eabs = Math.min(Vt, 1.3 * P.Vwn);
            this.w = Mech.shaftStep({ w: this.w, J: this.J, Tem: Tem, drive: dy.drive, brake: dy.brake, locked: false, h: H,
                Tloss: function (w) { return self.lossTorque(w, Eabs); } });
            this.theta += (P.p * Math.abs(this.w) - W50) * H;
            this.theta = Math.atan2(Math.sin(this.theta), Math.cos(this.theta));
            this.Tem = Tem; this.Iw = Iw; this.E = e.E;
            /* -------- protecciones -------- */
            var lines = s.A.src.map(function (ia, q) { return s.B ? (c.fast ? Math.sqrt(Cx.abs2(ia) + Cx.abs2(s.B.src[q])) : Cx.abs(Cx.add(ia, Cx.mul(s.B.src[q], rot)))) : Cx.abs(ia); });
            this.lines = lines;
            var Il = Math.max.apply(null, lines), trip = null;
            if (this.on) {
                if (Il > I_MAG) trip = 'Disparo magnético del interruptor de la red: corriente de ' + Math.round(Il) + ' A. ¿Cortocircuito en el montaje o alternador acoplado fuera de fase?';
                var xs = Il / I_SRC;
                if (xs > 1) this.thSrc += (xs * xs - 1) * H; else this.thSrc *= Math.exp(-H / 30);
                if (!trip && this.thSrc > 60) { this.thSrc = 0; trip = 'Disparo térmico del interruptor de la red: sobrecarga mantenida por encima de ' + I_SRC + ' A.'; }
            } else this.thSrc *= Math.exp(-H / 30);
            var Iex = Math.abs(this.If);
            if (this.on && this.ex.on && this.exShort && this.ex.U > 2) trip = trip || 'Disparo de la fuente de excitación: cortocircuito entre sus bornes + y −.';
            var xe = Iex / EXC.Ith;
            if (xe > 1) this.thEx += (xe * xe - 1) * H; else this.thEx *= Math.exp(-H / 20);
            if (!trip && this.thEx > 20) { this.thEx = 0; trip = 'Disparo térmico de la fuente de excitación: más de ' + EXC.Ith + ' A en el devanado de excitación.'; }
            var xm = Math.max(Iw[0], Iw[1], Iw[2]) / P.In;
            xm = Math.max(xm, Iex / (1.3 * P.Ifn));
            if (xm > 1.05) this.th += (xm * xm - 1.1) * H; else this.th *= Math.exp(-H / 20);
            if (!trip && this.th > 150) trip = 'Disparo de la protección térmica (sondas PTC) de la máquina: la corriente en los devanados ha superado la asignada durante demasiado tiempo.';
            if (!trip && Math.abs(this.w) > 1.1 * P.nmax * RPM) {
                trip = 'Disparo por sobrevelocidad: ' + Math.round(Math.abs(this.w) / RPM) + ' min⁻¹ (máx. ' + P.nmax + ').';
                this.dyno.Tset = Math.max(this.dyno.Tset, Math.round(0.5 * P.Tn));
            }
            /* relé de pérdida de sincronismo: acoplado a la red y deslizando */
            if (this.q2 && this.on && Va > 0.3) {
                var slip = Math.abs(P.p * Math.abs(this.w) - W50) / W50;
                this.oos = slip > 0.02 ? this.oos + H : Math.max(0, this.oos - H);
                if (!trip && this.oos > 1.2) {
                    this.oos = 0;
                    this.tripOut('Relé de pérdida de sincronismo: la máquina desliza respecto a la red. Se abre el acoplamiento Q2. (¿Excitación insuficiente para el par aplicado o acoplamiento a una velocidad muy distinta de la de sincronismo?)', true);
                    continue;
                }
            } else this.oos = 0;
            if (trip && (this.on || this.dyno.mode === 'n' || this.dyno.Tset < 0 || this.q2)) {
                this.tripOut(trip);
                s = this.solve(); c = this.combine(s);
            }
        }
        this.s = s; this.c = c;
        return s;
    };

    SyncLab.prototype.readings = function () {
        if (!this.s) this.step(H);
        var s = this.s, c = this.c, P = this.P, self = this;
        var w1 = c.power('w1.Ua', 'w1.Ub', 'w1.Ia', 'w1.Ib'), w2 = c.power('w2.Ua', 'w2.Ub', 'w2.Ia', 'w2.Ib');
        var amC = Cx.scale(c.Vd('am.a', 'am.b'), Y_AMM), vmC = c.Vd('vm.a', 'vm.b');
        var uL = c.mag('sy.L1', 'sy.L2'), uG = c.mag('sy.G1', 'sy.G2');
        var fL = this.on && uL > 5 ? 50 : 0, fG = uG > 5 ? (this.q2 && fL ? 50 : s.e.f) : 0;
        /* sincronoscopio: ángulo de la tensión del alternador respecto a la de la red (fase 1) */
        var vL = c.V('sy.L1'), vG = c.V('sy.G1'), phi = Math.atan2(vG.im, vG.re) - Math.atan2(vL.im, vL.re);
        phi = Math.atan2(Math.sin(phi), Math.cos(phi));
        var perm = this.lampMode === 'rot' ? [0, 2, 1] : [0, 1, 2], L = ['sy.L1', 'sy.L2', 'sy.L3'], G = ['sy.G1', 'sy.G2', 'sy.G3'];
        var lamps = poleV(c, perm).map(function (v) { return Math.min(1.2, v / (2 * P.Vwn)); });
        var T = Mech.shaftTorque(this.dyno, this.w, this.Tem || 0, this.lossTorque(0, 0), false);
        return {
            on: this.on, Uout: this.on ? c.mag('src.L1', 'src.L2') : 0,
            w1: w1, w2: w2, am: c.fast ? c.mag('am.a', 'am.b') * Y_AMM : Cx.abs(amC), vm: c.mag('vm.a', 'vm.b'),
            amC: amC, vmC: vmC, fw: this.q2 || !s.B ? 50 : s.e.f,
            n: this.w / RPM, T: T, Pm: T * Math.abs(this.w),
            If: this.If, Uex: this.on && this.ex.on ? this.ex.U : 0, E: this.E, Iw: this.Iw || [0, 0, 0],
            uL: uL, uG: uG, fL: fL, fG: fG, phi: phi, sync: !!(fL && uG > 5 && !this.q2), lamps: lamps, q2: this.q2,
            lines: this.lines || [0, 0, 0], Iline: Math.max.apply(null, this.lines || [0]),
            thermal: Math.min(1, this.th / 150), mm: { R: Infinity }
        };
    };

    SyncLab.U_MAX = U_MAX;
    VEM.Sync = { catalog: CATALOG, prepare: prepare, TERMINALS: TERMINALS, LOAD: LOAD, EXC: EXC, gS: gS };
    VEM.SyncLab = SyncLab;
    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
