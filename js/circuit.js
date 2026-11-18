/* =====================================================================
   VEMLAB · Circuito del banco de ensayos
   Análisis nodal (fasores, 50 Hz) del montaje que hace el alumno:
   fuente trifásica regulable, cables, puentes de la caja de bornes,
   vatímetros, amperímetro, voltímetro, polímetro y motor.
   Cualquier conexión es válida: si el alumno se equivoca, el circuito
   se comporta como lo haría el real (cortocircuitos, lecturas negativas,
   falta de fase, sobretensión en la bobina…).
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};
    var Cx = VEM.Cx, C = Cx.C, M = VEM.Motor;

    /* Bornes del banco */
    var TERMINALS = [
        'src.L1', 'src.L2', 'src.L3', 'src.N',
        'w1.Ia', 'w1.Ib', 'w1.Ua', 'w1.Ub',
        'w2.Ia', 'w2.Ib', 'w2.Ua', 'w2.Ub',
        'am.a', 'am.b', 'vm.a', 'vm.b', 'mm.a', 'mm.b',
        'm.U1', 'm.V1', 'm.W1', 'm.U2', 'm.V2', 'm.W2'
    ];
    /* Puentes posibles en la caja de bornes */
    var BRIDGES = {
        'W2-U2': ['m.W2', 'm.U2'], 'U2-V2': ['m.U2', 'm.V2'],
        'U1-W2': ['m.U1', 'm.W2'], 'V1-U2': ['m.V1', 'm.U2'], 'W1-V2': ['m.W1', 'm.V2']
    };

    var Y_AMM = 100;        /* amperímetro / bobina amperimétrica: 10 mΩ */
    var Y_VOLT = 1e-6;      /* voltímetro / bobina voltimétrica: 1 MΩ */
    var Y_MM = 1e-7;        /* polímetro: 10 MΩ */
    var Y_LEAK = 1e-9;      /* fuga a tierra para fijar nodos flotantes */
    var ZS = C(0.12, 0.22); /* impedancia interna de la fuente (autotransformador + línea) */
    var YS = Cx.inv(ZS);

    /* a = 1∠120° */
    var A = C(-0.5, Math.sqrt(3) / 2), A2 = C(-0.5, -Math.sqrt(3) / 2), ONE = C(1, 0);
    /* Vabc = T·V012 ; V012 = Ti·Vabc */
    var T = [[ONE, ONE, ONE], [ONE, A2, A], [ONE, A, A2]];
    var Ti = [[ONE, ONE, ONE], [ONE, A, A2], [ONE, A2, A]].map(function (r) { return r.map(function (z) { return Cx.scale(z, 1 / 3); }); });

    /* ---------------- Topología ---------------- */
    function topology(cables, bridges) {
        var parent = {};
        TERMINALS.forEach(function (t) { parent[t] = t; });
        function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
        function join(a, b) { if (parent[a] === undefined || parent[b] === undefined) return; a = find(a); b = find(b); if (a !== b) parent[a] = b; }
        cables.forEach(function (c) { join(c.a, c.b); });
        Object.keys(bridges).forEach(function (k) { if (bridges[k] && BRIDGES[k]) join(BRIDGES[k][0], BRIDGES[k][1]); });
        var gnd = find('src.N'), idx = {}, n = 0, node = {};
        TERMINALS.forEach(function (t) {
            var r = find(t);
            if (r === gnd) { node[t] = -1; return; }
            if (idx[r] === undefined) idx[r] = n++;
            node[t] = idx[r];
        });
        return { node: node, n: n, root: find };
    }

    /* Tipo de conexión del motor según puentes y cables (cortocircuitos directos) */
    function motorConnection(topo) {
        var nd = topo.node;
        function same(a, b) { return nd[a] === nd[b]; }
        var star = same('m.U2', 'm.V2') && same('m.V2', 'm.W2') && !same('m.U1', 'm.V1') && !same('m.V1', 'm.W1') && !same('m.U1', 'm.W1');
        var delta = same('m.U1', 'm.W2') && same('m.V1', 'm.U2') && same('m.W1', 'm.V2') && !same('m.U1', 'm.V1') && !same('m.V1', 'm.W1') && !same('m.U1', 'm.W1');
        return star ? 'Y' : delta ? 'D' : null;
    }

    /* ---------------- Matrices ---------------- */
    function Net(n) {
        this.n = n;
        this.Ar = new Float64Array(n * n); this.Ai = new Float64Array(n * n);
        this.br = new Float64Array(n); this.bi = new Float64Array(n);
        for (var i = 0; i < n; i++) this.Ar[i * n + i] = Y_LEAK;
    }
    Net.prototype.add = function (i, j, y) {
        if (i < 0 || j < 0) return;
        this.Ar[i * this.n + j] += y.re; this.Ai[i * this.n + j] += y.im;
    };
    /* admitancia y entre nodos a y b */
    Net.prototype.adm = function (a, b, y) {
        this.add(a, a, y); this.add(b, b, y);
        var m = C(-y.re, -y.im);
        this.add(a, b, m); this.add(b, a, m);
    };
    /* corriente inyectada en el nodo a */
    Net.prototype.inj = function (a, j) { if (a < 0) return; this.br[a] += j.re; this.bi[a] += j.im; };
    Net.prototype.solve = function () {
        if (this.n === 0) return { re: new Float64Array(0), im: new Float64Array(0) };
        return VEM.solveComplex(this.n, this.Ar, this.Ai, this.br, this.bi);
    };

    function mat3(Y0, Y1, Y2) {
        var D = [Y0, Y1, Y2], Y = [];
        for (var i = 0; i < 3; i++) {
            Y.push([]);
            for (var j = 0; j < 3; j++) {
                var s = C(0, 0);
                for (var k = 0; k < 3; k++) s = Cx.add(s, Cx.mul(Cx.mul(T[i][k], D[k]), Ti[k][j]));
                Y[i].push(s);
            }
        }
        return Y;
    }

    var PORTS = [['m.U1', 'm.U2'], ['m.V1', 'm.V2'], ['m.W1', 'm.W2']];

    /* ---------------- Régimen permanente senoidal ----------------
       o: { topo, P (motor preparado), s, Esat, on (interruptor), Eph (tensión de fase en vacío de la fuente) } */
    function solveAC(o) {
        var topo = o.topo, nd = topo.node, P = o.P, net = new Net(topo.n);
        /* instrumentos */
        net.adm(nd['w1.Ia'], nd['w1.Ib'], C(Y_AMM)); net.adm(nd['w1.Ua'], nd['w1.Ub'], C(Y_VOLT));
        net.adm(nd['w2.Ia'], nd['w2.Ib'], C(Y_AMM)); net.adm(nd['w2.Ua'], nd['w2.Ub'], C(Y_VOLT));
        net.adm(nd['am.a'], nd['am.b'], C(Y_AMM));
        net.adm(nd['vm.a'], nd['vm.b'], C(Y_VOLT));
        net.adm(nd['mm.a'], nd['mm.b'], C(Y_MM));
        /* fuente (equivalente de Norton por fase, neutro = referencia) */
        var E = [Cx.polar(o.Eph, 0), Cx.polar(o.Eph, -120), Cx.polar(o.Eph, 120)];
        var L = ['src.L1', 'src.L2', 'src.L3'];
        if (o.on) for (var k = 0; k < 3; k++) { net.adm(nd[L[k]], -1, YS); net.inj(nd[L[k]], Cx.mul(E[k], YS)); }
        /* motor: tripuerta acoplado por componentes simétricas */
        var Ym = M.magY(P, o.Esat);
        var Ypos = Cx.inv(M.seqZ(P, o.s, Ym)), Yneg = Cx.inv(M.seqZ(P, 2 - o.s, Ym)), Yzero = Cx.inv(M.z0(P));
        var Y = mat3(Yzero, Ypos, Yneg), i, j;
        for (i = 0; i < 3; i++) for (j = 0; j < 3; j++) {
            var pi = nd[PORTS[i][0]], qi = nd[PORTS[i][1]], pj = nd[PORTS[j][0]], qj = nd[PORTS[j][1]], y = Y[i][j];
            var m = C(-y.re, -y.im);
            net.add(pi, pj, y); net.add(qi, qj, y); net.add(pi, qj, m); net.add(qi, pj, m);
        }
        var x = net.solve();
        function V(t) { var i = nd[t]; return i < 0 ? C(0, 0) : C(x.re[i], x.im[i]); }
        function Vd(a, b) { return Cx.sub(V(a), V(b)); }

        /* motor */
        var Vw = PORTS.map(function (p) { return Vd(p[0], p[1]); });
        var Iw = [0, 1, 2].map(function (i) {
            var s = C(0, 0);
            for (var j = 0; j < 3; j++) s = Cx.add(s, Cx.mul(Y[i][j], Vw[j]));
            return s;
        });
        var V012 = [0, 1, 2].map(function (i) {
            var s = C(0, 0);
            for (var j = 0; j < 3; j++) s = Cx.add(s, Cx.mul(Ti[i][j], Vw[j]));
            return s;
        });
        var Z1 = C(P.R1, P.X1);
        var Ip = Cx.mul(Ypos, V012[1]), In = Cx.mul(Yneg, V012[2]);
        var Ep = Cx.sub(V012[1], Cx.mul(Ip, Z1)), En = Cx.sub(V012[2], Cx.mul(In, Z1));
        function rho(s) { return s * P.R2 / (P.R2 * P.R2 + s * s * P.X2 * P.X2); }
        var w1 = M.ws(P);
        var Tem = 3 * (Cx.abs2(Ep) * rho(o.s) - Cx.abs2(En) * rho(2 - o.s)) / w1;
        var Pin = 0;
        for (i = 0; i < 3; i++) Pin += Vw[i].re * Iw[i].re + Vw[i].im * Iw[i].im;

        /* instrumentos */
        function wat(id) {
            var I = Cx.scale(Vd(id + '.Ia', id + '.Ib'), Y_AMM), U = Vd(id + '.Ua', id + '.Ub');
            return { P: U.re * I.re + U.im * I.im, I: Cx.abs(I), U: Cx.abs(U) };
        }
        var lines = L.map(function (t, k) { return o.on ? Cx.abs(Cx.mul(Cx.sub(E[k], V(t)), YS)) : 0; });
        return {
            Vw: Vw.map(Cx.abs), Iw: Iw.map(Cx.abs), Vpos: Cx.abs(V012[1]), Vneg: Cx.abs(V012[2]),
            Epos: Cx.abs(Ep), Emag: Math.sqrt(Cx.abs2(Ep) + Cx.abs2(En)), Tem: Tem, Pin: Pin,
            w1: wat('w1'), w2: wat('w2'),
            am: Cx.abs(Cx.scale(Vd('am.a', 'am.b'), Y_AMM)),
            vm: Cx.abs(Vd('vm.a', 'vm.b')),
            amC: Cx.scale(Vd('am.a', 'am.b'), Y_AMM), vmC: Vd('vm.a', 'vm.b'),
            mmV: Cx.abs(Vd('mm.a', 'mm.b')),
            Uout: Cx.abs(Vd('src.L1', 'src.L2')),
            lines: lines, Iline: Math.max.apply(null, lines)
        };
    }

    /* ---------------- Polímetro en corriente continua (óhmetro) ---------------- */
    function ohmmeter(topo, P, on) {
        var nd = topo.node, n = topo.n, a = nd['mm.a'], b = nd['mm.b'];
        if (a === b) return 0;
        var Ar = new Float64Array(n * n), Ai = new Float64Array(n * n), br = new Float64Array(n), bi = new Float64Array(n);
        function adm(p, q, g) {
            if (p >= 0) Ar[p * n + p] += g;
            if (q >= 0) Ar[q * n + q] += g;
            if (p >= 0 && q >= 0) { Ar[p * n + q] -= g; Ar[q * n + p] -= g; }
        }
        for (var i = 0; i < n; i++) Ar[i * n + i] = Y_LEAK;
        adm(nd['w1.Ia'], nd['w1.Ib'], Y_AMM); adm(nd['w1.Ua'], nd['w1.Ub'], Y_VOLT);
        adm(nd['w2.Ia'], nd['w2.Ib'], Y_AMM); adm(nd['w2.Ua'], nd['w2.Ub'], Y_VOLT);
        adm(nd['am.a'], nd['am.b'], Y_AMM); adm(nd['vm.a'], nd['vm.b'], Y_VOLT);
        PORTS.forEach(function (p) { adm(nd[p[0]], nd[p[1]], 1 / P.R1); });
        if (on) ['src.L1', 'src.L2', 'src.L3'].forEach(function (t) { adm(nd[t], -1, 1 / ZS.re); });
        var I = 1e-3;
        if (a >= 0) br[a] += I;
        if (b >= 0) br[b] -= I;
        if (n === 0) return Infinity;
        var x = VEM.solveComplex(n, Ar, Ai, br, bi);
        var va = a >= 0 ? x.re[a] : 0, vb = b >= 0 ? x.re[b] : 0;
        return (va - vb) / I;
    }

    VEM.Circuit = {
        TERMINALS: TERMINALS, BRIDGES: BRIDGES, topology: topology, motorConnection: motorConnection,
        solveAC: solveAC, ohmmeter: ohmmeter
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
