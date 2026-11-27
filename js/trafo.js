/* =====================================================================
   VEMLAB · Transformador trifásico de tres columnas
   - Cada columna lleva el devanado de alta tensión (AT) y el de baja
     (BT) partido en dos mitades; todos los extremos salen a bornes, de
     modo que con cables se monta cualquier conexión (Yy, Yd, Dy, Dd,
     Yz, Dz…) y cualquier índice horario.
   - Modelo: circuito equivalente de varios devanados por columna
     (impedancias de dispersión referidas a AT + rama magnetizante),
     con saturación y con la impedancia magnetizante homopolar baja
     propia del núcleo de tres columnas (el flujo homopolar se cierra
     por el aire y la cuba).
   - Banco de cargas trifásico R–L–C en estrella con neutro accesible.
   - Simulación en tiempo real con las mismas protecciones del banco.
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};
    var Cx = VEM.Cx, C = Cx.C, Circuit = VEM.Circuit;

    var PH = ['U', 'V', 'W'];
    /* Bornes del transformador: AT 1U1–1U2…, BT 2U1–2U2 (1.ª mitad) y 2U3–2U4 (2.ª mitad) */
    var T_TERMINALS = [];
    PH.forEach(function (p) { T_TERMINALS.push('t.1' + p + '1', 't.1' + p + '2'); });
    PH.forEach(function (p) { T_TERMINALS.push('t.2' + p + '1', 't.2' + p + '2', 't.2' + p + '3', 't.2' + p + '4'); });
    var LOAD_TERMINALS = ['ld.L1', 'ld.L2', 'ld.L3', 'ld.N'];
    var TERMINALS = Circuit.BASE_TERMINALS.concat(T_TERMINALS, LOAD_TERMINALS);

    /* Devanados de cada columna: [principio, final] (el principio es el borne marcado con •) */
    function windings(c) {
        var p = PH[c];
        return [['t.1' + p + '1', 't.1' + p + '2'], ['t.2' + p + '1', 't.2' + p + '2'], ['t.2' + p + '3', 't.2' + p + '4']];
    }

    /* ---------------- Catálogo ----------------
       U1: tensión asignada de cada devanado de AT; U2h: de cada mitad de BT.
       ucc, pcc: tensión y pérdidas de cortocircuito (p.u.); i0, p0: corriente y pérdidas de vacío (p.u.). */
    var CATALOG = [
        { id: 'TA', name: 'Transformador A', Sn: 5000, U1: 230, U2h: 66.5, f: 50, ucc: 0.045, pcc: 0.018, i0: 0.03, p0: 0.009, code: 'TT-5', year: 2019 },
        { id: 'TB', name: 'Transformador B', Sn: 3000, U1: 400, U2h: 63.5, f: 50, ucc: 0.055, pcc: 0.022, i0: 0.04, p0: 0.011, code: 'TT-3', year: 2021 }
    ];

    var SAT_C = 0.12, SAT_M = 9;
    function satG(x) { return (1 + SAT_C * Math.pow(Math.max(x, 0), SAT_M)) / (1 + SAT_C); }

    function prepare(m) {
        var P = Object.assign({}, m), Sc = P.Sn / 3;
        P.I1n = Sc / P.U1;                       /* corriente asignada de un devanado de AT */
        P.I2n = Sc / (2 * P.U2h);                /* corriente asignada de una mitad de BT */
        P.a = P.U1 / P.U2h;                      /* relación de espiras AT / mitad de BT */
        var Zb = P.U1 * P.U1 / Sc;
        var Zcc = P.ucc * Zb, Rcc = P.pcc * Zb, Xcc = Math.sqrt(Zcc * Zcc - Rcc * Rcc);
        P.R1 = Rcc / 2; P.X1 = Xcc / 2;          /* devanado de AT */
        /* BT completa (dos mitades en serie) referida a AT = Zcc/2  ⇒  cada mitad referida = 2·(Zcc/2) */
        P.Rh_ref = Rcc; P.Xh_ref = Xcc;
        P.Rh = P.Rh_ref / (P.a * P.a);           /* resistencia real de cada mitad de BT */
        var Y0 = P.i0 * P.I1n / P.U1, G = P.p0 * Sc / (P.U1 * P.U1);
        P.Rfe = 1 / G; P.Xmu = 1 / Math.sqrt(Y0 * Y0 - G * G);
        /* rama magnetizante homopolar (núcleo de 3 columnas): ≈ 0,6 p.u. con pérdidas en la cuba */
        P.B0 = 1 / (0.6 * Zb); P.G0 = P.B0 / 6;
        P.Zb = Zb;
        P.plate = { Sn: P.Sn, U1: P.U1, U2h: P.U2h, I1n: P.I1n, I2n: P.I2n, ucc: P.ucc * 100, f: P.f };
        return P;
    }

    /* Admitancia magnetizante de secuencia directa con saturación */
    function magY(P, E) { return C(1 / P.Rfe, -satG(E / P.U1) / P.Xmu); }

    /* Inversa de una matriz compleja 3×3 */
    function inv3(Mx) {
        var out = [[], [], []];
        for (var col = 0; col < 3; col++) {
            var Ar = new Float64Array(9), Ai = new Float64Array(9), br = new Float64Array(3), bi = new Float64Array(3);
            for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { Ar[i * 3 + j] = Mx[i][j].re; Ai[i * 3 + j] = Mx[i][j].im; }
            br[col] = 1;
            var x = VEM.solveComplex(3, Ar, Ai, br, bi);
            for (i = 0; i < 3; i++) out[i][col] = C(x.re[i], x.im[i]);
        }
        return out;
    }

    /* Matriz de admitancias de las 9 puertas (3 devanados × 3 columnas).
       Puerta k = j·3 + c (devanado j, columna c). Corriente entrante por el principio del devanado.
       I_j = a_j·Y_j·(a_j·V_j − E),  Σ_j Y_j·(a_j·V_j − E) = Ymag·E  (magnitudes referidas a AT). */
    function portMatrix(P, Esat) {
        var a = [1, P.a, P.a];
        var Yw = [Cx.inv(C(P.R1, P.X1)), Cx.inv(C(P.Rh_ref, P.Xh_ref)), Cx.inv(C(P.Rh_ref, P.Xh_ref))];
        var Ym = magY(P, Esat), Ym0 = C(P.G0, -P.B0);
        var Ymag = Circuit.mat3(Ym0, Ym, Ym), sumY = Cx.add(Cx.add(Yw[0], Yw[1]), Yw[2]);
        var Mm = inv3(Ymag.map(function (r, i) { return r.map(function (y, j) { return i === j ? Cx.add(y, sumY) : y; }); }));
        var Y = [], j, k, c, d;
        for (j = 0; j < 3; j++) for (c = 0; c < 3; c++) {
            var rowY = [];
            for (k = 0; k < 3; k++) for (d = 0; d < 3; d++) {
                var v = Cx.scale(Cx.mul(Cx.mul(Yw[j], Yw[k]), Mm[c][d]), -a[j] * a[k]);
                if (j === k && c === d) v = Cx.add(v, Cx.scale(Yw[j], a[j] * a[j]));
                rowY.push(v);
            }
            Y.push(rowY);
        }
        return { Y: Y, M: Mm, Yw: Yw, a: a };
    }

    /* ---------------- Banco de cargas ----------------
       Escalones por fase (estrella, 230 V entre fases): R 0,5 kW, L 0,5 kvar, C 0,25 kvar por escalón (trifásicos). */
    var LOAD = { U: 230, R: 500, L: 500, C: 250, steps: 10 };
    function loadY(ld) {
        var V2 = Math.pow(LOAD.U / Math.sqrt(3), 2);
        if (!ld.on) return C(0, 0);
        var G = ld.R * LOAD.R / 3 / V2, BL = ld.L * LOAD.L / 3 / V2, BC = ld.C * LOAD.C / 3 / V2;
        /* las bobinas de la carga inductiva tienen algo de resistencia (Q ≈ 20) */
        var yl = BL > 0 ? Cx.inv(C(0.05 / BL, 1 / BL)) : C(0, 0);
        return Cx.add(C(G, BC), yl);
    }

    /* ---------------- Régimen permanente ---------------- */
    function solveAC(o) {
        var topo = o.topo, nd = topo.node, P = o.P, net = new Circuit.Net(topo.n);
        var E = Circuit.stampBench(net, nd, o);
        var pm = portMatrix(P, o.Esat), ports = [], j, c;
        for (j = 0; j < 3; j++) for (c = 0; c < 3; c++) { var w = windings(c)[j]; ports.push([nd[w[0]], nd[w[1]]]); }
        net.ports(ports, pm.Y);
        var yl = loadY(o.load);
        ['ld.L1', 'ld.L2', 'ld.L3'].forEach(function (t) { net.adm(nd[t], nd['ld.N'], yl); });
        var rb = Circuit.readBench(net, nd, o, E), Vd = rb.Vd;
        /* tensiones y corrientes de devanado */
        var Vw = [], Iw = [], k;
        for (j = 0; j < 3; j++) for (c = 0; c < 3; c++) { var ww = windings(c)[j]; Vw.push(Vd(ww[0], ww[1])); }
        for (k = 0; k < 9; k++) {
            var s = C(0, 0);
            for (var l = 0; l < 9; l++) s = Cx.add(s, Cx.mul(pm.Y[k][l], Vw[l]));
            Iw.push(s);
        }
        /* f.e.m. de cada columna (referida a AT) para la saturación */
        var Emag = 0;
        for (c = 0; c < 3; c++) {
            var acc = C(0, 0);
            for (var d = 0; d < 3; d++) for (j = 0; j < 3; j++) acc = Cx.add(acc, Cx.mul(pm.M[c][d], Cx.scale(Cx.mul(pm.Yw[j], Vw[j * 3 + d]), pm.a[j])));
            Emag = Math.max(Emag, Cx.abs(acc));
        }
        var Pin = 0, Pload = 0;
        for (k = 0; k < 9; k++) Pin += Vw[k].re * Iw[k].re + Vw[k].im * Iw[k].im;
        ['ld.L1', 'ld.L2', 'ld.L3'].forEach(function (t) { var v = Vd(t, 'ld.N'), i = Cx.mul(yl, v); Pload += v.re * i.re + v.im * i.im; });
        return Object.assign(rb.out, {
            Vw: Vw.map(Cx.abs), Iw: Iw.map(Cx.abs), Emag: Emag, Pin: Pin, Pload: Pload,
            V: rb.V   /* tensiones de nodo (para pruebas) */
        });
    }

    /* Resistencias en c.c. (polímetro): devanados y carga */
    function resistors(P, ld) {
        var r = [];
        for (var c = 0; c < 3; c++) {
            var w = windings(c);
            r.push([w[0][0], w[0][1], P.R1], [w[1][0], w[1][1], P.Rh], [w[2][0], w[2][1], P.Rh]);
        }
        if (ld.on) {
            var V2 = Math.pow(LOAD.U / Math.sqrt(3), 2), g = ld.R * LOAD.R / 3 / V2, BL = ld.L * LOAD.L / 3 / V2;
            var gdc = g + (BL > 0 ? BL / 0.05 : 0);
            if (gdc > 0) ['ld.L1', 'ld.L2', 'ld.L3'].forEach(function (t) { r.push([t, 'ld.N', 1 / gdc]); });
        }
        return r;
    }

    /* ================= Simulación ================= */
    var U_MAX = 440, I_MAG = 100, I_SRC = 16, H = 0.004;

    function TrafoLab(model) {
        this.kind = 'trafo';
        this.terminals = TERMINALS;
        this.cables = [];
        this.bridges = {};
        this.on = false;
        this.variac = 0;
        this.load = { R: 0, L: 0, C: 0, on: false };
        this.Esat = 0;
        this.th = 0; this.thSrc = 0;
        this.trip = null; this.r = null;
        this.events = [];
        this.w = 0; this.locked = false; this.brake = 0;
        this.setModel(model);
        this.rewire();
    }
    TrafoLab.prototype.setModel = function (m) { this.P = prepare(m); this.Esat = 0; this.th = 0; };
    TrafoLab.prototype.rewire = function () { this.topo = Circuit.topology(this.cables, {}, TERMINALS, {}); };
    TrafoLab.prototype.emit = function (type, msg) { this.events.push({ type: type, msg: msg }); };
    TrafoLab.prototype.Eph = function () { return this.variac * U_MAX / Math.sqrt(3); };
    TrafoLab.prototype.switchOn = function () {
        if (this.on) return true;
        if (this.th > 120) { this.emit('error', 'La protección térmica del transformador sigue activada. Espera a que se enfríen los devanados.'); return false; }
        this.on = true; this.trip = null;
        return true;
    };
    TrafoLab.prototype.switchOff = function () { this.on = false; };
    TrafoLab.prototype.tripOut = function (msg) { this.on = false; this.trip = msg; this.emit('trip', msg); };
    TrafoLab.prototype.solve = function () {
        return solveAC({ topo: this.topo, P: this.P, Esat: this.Esat, on: this.on, Eph: this.Eph(), load: this.load });
    };
    TrafoLab.prototype.step = function (dt) {
        dt = Math.min(dt, 0.1);
        var P = this.P, n = Math.max(1, Math.ceil(dt / H)), h = dt / n, r = null;
        for (var k = 0; k < n; k++) {
            r = this.solve();
            this.Esat += (r.Emag - this.Esat) * 0.6;
            if (this.on) {
                if (r.Iline > I_MAG) {
                    this.tripOut('Disparo magnético del interruptor de la fuente: corriente de ' + Math.round(r.Iline) + ' A. Hay un cortocircuito en el montaje (¿amperímetro en paralelo? ¿dos fases unidas? ¿cortocircuito en BT a tensión nominal?).');
                    r = this.solve(); break;
                }
                var xs = r.Iline / I_SRC;
                if (xs > 1) this.thSrc += (xs * xs - 1) * h; else this.thSrc *= Math.exp(-h / 30);
                if (this.thSrc > 60) {
                    this.thSrc = 0;
                    this.tripOut('Disparo térmico del interruptor de la fuente: sobrecarga mantenida por encima de ' + I_SRC + ' A.');
                    r = this.solve(); break;
                }
            } else this.thSrc *= Math.exp(-h / 30);
            /* sondas térmicas de los devanados */
            var x = 0;
            for (var i = 0; i < 9; i++) x = Math.max(x, r.Iw[i] / (i < 3 ? P.I1n : P.I2n));
            if (x > 1.05) this.th += (x * x - 1.1) * h; else this.th *= Math.exp(-h / 25);
            if (this.th > 180 && this.on) {
                this.tripOut('Disparo de la protección térmica del transformador: la corriente en los devanados ha superado la asignada durante demasiado tiempo.');
                r = this.solve(); break;
            }
        }
        this.r = r;
        return r;
    };
    TrafoLab.prototype.readings = function () {
        var r = this.r || this.solve(), mm;
        if (this.on && r.mmV > 0.5) mm = { live: true, V: r.mmV };
        else mm = { R: Circuit.ohmmeterDC(this.topo, resistors(this.P, this.load), this.on) };
        return {
            on: this.on, Uout: this.on ? r.Uout : 0,
            w1: r.w1, w2: r.w2, am: r.am, vm: r.vm, mm: mm,
            n: 0, T: 0, Tm: 0, amC: r.amC, vmC: r.vmC,
            Pin: r.Pin, Pload: r.Pload, Iw: r.Iw, Vw: r.Vw,
            thermal: Math.min(1, this.th / 180), Iline: r.Iline, lines: r.lines
        };
    };
    TrafoLab.U_MAX = U_MAX;

    VEM.Trafo = { catalog: CATALOG, prepare: prepare, TERMINALS: TERMINALS, T_TERMINALS: T_TERMINALS, windings: windings, LOAD: LOAD, solveAC: solveAC, portMatrix: portMatrix };
    VEM.TrafoLab = TrafoLab;
    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
