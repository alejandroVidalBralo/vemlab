/* =====================================================================
   VEMLAB · Motor asíncrono trifásico
   Circuito equivalente exacto por fase (estrella equivalente).
   La carga mecánica es la resistencia R′c = R′2·(1−s)/s.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, Cx = VEM.Cx, C = Cx.C, S = VEM.svg, fmt = VEM.fmt;
    var SQ3 = Math.sqrt(3);

    var params = [
        { k: 'Un', label: 'Tensión de fase V<sub>1n</sub>', unit: 'V', def: 230, group: 'Placa' },
        { k: 'In', label: 'Corriente nominal I<sub>n</sub>', unit: 'A', def: 7.6, group: 'Placa' },
        { k: 'f', label: 'Frecuencia f', unit: 'Hz', def: 50, group: 'Placa' },
        { k: 'p', label: 'Pares de polos p', unit: '', def: 2, group: 'Placa', int: true },
        { k: 'R1', label: 'R<sub>1</sub> (ensayo en c.c.)', unit: 'Ω', def: 1.5, group: 'Ensayo en c.c.' },
        { k: 'Rfe', label: 'R<sub>Fe</sub>', unit: 'Ω', def: 1400, group: 'Ensayo de vacío' },
        { k: 'Xmu', label: 'X<sub>μ</sub>', unit: 'Ω', def: 75, group: 'Ensayo de vacío' },
        { k: 'Pm', label: 'Pérdidas mecánicas P<sub>m</sub>', unit: 'W', def: 70, group: 'Ensayo de vacío' },
        { k: 'R2', label: 'R′<sub>2</sub>', unit: 'Ω', def: 1.3, group: 'Ensayo de rotor bloqueado' },
        { k: 'X1', label: 'X<sub>1</sub>', unit: 'Ω', def: 2.4, group: 'Ensayo de rotor bloqueado' },
        { k: 'X2', label: 'X′<sub>2</sub>', unit: 'Ω', def: 2.4, group: 'Ensayo de rotor bloqueado' }
    ];

    function n1(P) { return 60 * P.f / P.p; }
    function w1(P) { return 2 * Math.PI * P.f / P.p; }

    function circuit(P, s, U) {
        var V = U;                      /* tensión de fase */
        var Zm = Cx.par(C(P.Rfe), C(0, P.Xmu));
        var Z2 = C(P.R2 / s, P.X2);
        var Zp = Cx.par(Zm, Z2);
        var I1 = Cx.div(C(V), Cx.add(C(P.R1, P.X1), Zp));
        var E = Cx.mul(I1, Zp);
        var I2 = Cx.abs(E) / Cx.abs(Z2);
        var I0 = Cx.abs(Cx.div(E, Zm));
        var i1 = Cx.abs(I1);
        var P1 = 3 * V * I1.re;
        var Pa = 3 * I2 * I2 * P.R2 / s;
        var Pmi = Pa * (1 - s);
        var Pmec = P.Pm * Math.pow(1 - s, 2);
        var Pu = Pmi - Pmec;
        var w = w1(P) * (1 - s);
        return {
            s: s, U: U, V: V, I1: i1, I0: I0, I2: I2, P1: P1, cos: i1 > 0 ? I1.re / i1 : 0,
            Pa: Pa, Pu: Pu, Tem: Pa / w1(P), Tu: w > 1e-6 ? Pu / w : Pa / w1(P),
            n: n1(P) * (1 - s), eta: P1 > 0 && Pu > 0 ? Pu / P1 * 100 : NaN,
            Rc: P.R2 * (1 - s) / s
        };
    }

    /* Vacío: velocidad a la que el par motor iguala las pérdidas mecánicas */
    function noLoad(P, U) {
        var ws = w1(P);
        function f(s) { return circuit(P, s, U).Tem - P.Pm * (1 - s) / ws; }
        if (P.Pm <= 0) return circuit(P, 1e-6, U);
        var prev = f(1e-6);
        for (var i = 1; i <= 400; i++) {
            var s = Math.pow(10, -6 + 6 * i / 400), cur = f(s);
            if (prev < 0 && cur >= 0) {
                var a = Math.pow(10, -6 + 6 * (i - 1) / 400), b = s;
                for (var k = 0; k < 60; k++) { var mid = (a + b) / 2; if (f(mid) < 0) a = mid; else b = mid; }
                return circuit(P, (a + b) / 2, U);
            }
            prev = cur;
        }
        var r = circuit(P, 1, U); r.stalled = true; return r;
    }

    function solve(P, mode, U, L) {
        if (mode === 'bloqueado') return circuit(P, 1, U);
        if (mode === 'vacio') return noLoad(P, U);
        var s = VEM.clamp((n1(P) - L.n) / n1(P), 1e-5, 1);
        return circuit(P, s, U);
    }

    function readings(mode, r) {
        var cos = { k: 'cos', label: 'Factor de potencia cos φ', unit: '', v: r.cos, dec: 3 };
        if (mode === 'vacio') return [
            { k: 'U', label: 'Tensión de fase V<sub>1</sub>', unit: 'V', v: r.U, dec: 1 },
            { k: 'I0', label: 'Corriente de vacío I<sub>0</sub>', unit: 'A', v: r.I1, dec: 3 },
            { k: 'P0', label: 'Potencia de vacío P<sub>0</sub> (total)', unit: 'W', v: r.P1, dec: 1 },
            { k: 'n', label: 'Velocidad n', unit: 'rpm', v: r.n, dec: 0 },
            cos
        ];
        if (mode === 'bloqueado') return [
            { k: 'U', label: 'Tensión de fase V<sub>1cc</sub>', unit: 'V', v: r.U, dec: 1 },
            { k: 'I', label: 'Corriente I<sub>cc</sub>', unit: 'A', v: r.I1, dec: 2 },
            { k: 'P', label: 'Potencia de cortocircuito P<sub>cc</sub> (total)', unit: 'W', v: r.P1, dec: 1 },
            cos,
            { k: 'T', label: 'Par de arranque', unit: 'N·m', v: r.Tem, dec: 2 }
        ];
        return [
            { k: 'U', label: 'Tensión de fase V<sub>1</sub>', unit: 'V', v: r.U, dec: 1 },
            { k: 'I', label: 'Corriente I', unit: 'A', v: r.I1, dec: 2 },
            { k: 'P1', label: 'Potencia absorbida P<sub>1</sub> (total)', unit: 'W', v: r.P1, dec: 0 },
            cos,
            { k: 'T', label: 'Par útil T (en el freno)', unit: 'N·m', v: r.Tu, dec: 2 },
            { k: 'Pu', label: 'Potencia útil P<sub>u</sub>', unit: 'W', v: r.Pu, dec: 0 },
            { k: 'eta', label: 'Rendimiento η', unit: '%', v: r.eta, dec: 1 },
            { k: 's', label: 'Deslizamiento s', unit: '%', v: r.s * 100, dec: 2, noCompare: true }
        ];
    }

    function diagram(P, mode, r) {
        var b = '', top = 70, bot = 240, f = fmt;
        b += S.txt(80, 205, 'V₁ = ' + f(r.V, 1) + ' V', { a: 'start', c: 'val' });
        b += S.txt(20, 32, 'I₁ = ' + f(r.I1, 2) + ' A', { a: 'start', c: 'val' });
        b += S.source(50, 155);
        b += S.wire('M50,135 V' + top + ' H110 M170,' + top + ' H190 M250,' + top + ' H370 M430,' + top + ' H450 M510,' + top + ' H620 V100');
        b += S.wire('M50,175 V' + bot + ' H620');
        b += S.arrowH(82, top, '');
        b += S.resH(110, top, 60) + S.txt(140, 44, 'R₁') + S.txt(140, 104, f(P.R1, 3) + ' Ω', { c: 'pv' });
        b += S.indH(190, top, 60) + S.txt(220, 44, 'X₁') + S.txt(220, 104, f(P.X1, 3) + ' Ω', { c: 'pv' });
        /* rama de vacío */
        b += S.node(300, top) + S.node(300, bot);
        b += S.wire('M300,' + top + ' V95 M280,95 H320 M280,95 V105 M320,95 V105 M280,185 V205 M320,185 V205 M280,205 H320 M300,205 V' + bot);
        b += S.resV(280, 105, 80) + S.indV(320, 105, 80);
        b += S.txt(266, 140, 'R<tspan class="sub" dy="4">Fe</tspan>', { a: 'end' }) + S.txt(266, 160, f(P.Rfe, 0) + ' Ω', { a: 'end', c: 'pv' });
        b += S.txt(336, 140, 'X<tspan class="sub" dy="4">μ</tspan>', { a: 'start' }) + S.txt(336, 160, f(P.Xmu, 2) + ' Ω', { a: 'start', c: 'pv' });
        b += S.txt(336, 226, 'I₀ = ' + f(r.I0, 2) + ' A', { a: 'start', c: 'val' });
        /* rotor */
        b += S.indH(370, top, 60) + S.txt(400, 44, 'X′₂') + S.txt(400, 104, f(P.X2, 3) + ' Ω', { c: 'pv' });
        b += S.resH(450, top, 60) + S.txt(480, 44, 'R′₂') + S.txt(480, 104, f(P.R2, 3) + ' Ω', { c: 'pv' });
        b += S.arrowH(560, top, "I′₂ = " + f(r.I2, 2) + ' A');
        /* carga mecánica */
        if (mode === 'bloqueado') {
            b += S.wire('M620,100 V' + bot, 'short');
            b += S.txt(636, 150, 'R′c = 0', { a: 'start', c: 'state' });
            b += S.txt(636, 170, 'rotor bloqueado (s = 1)', { a: 'start', c: 'muted' });
        } else {
            b += S.resV(620, 110, 90) + S.wire('M620,200 V' + bot);
            b += S.txt(636, 140, 'R′c = ' + (r.Rc > 9999 ? '≈ ∞' : f(r.Rc, r.Rc >= 100 ? 0 : 2) + ' Ω'), { a: 'start', c: 'state' });
            b += S.txt(636, 160, 'R′₂·(1−s)/s', { a: 'start', c: 'muted' });
            b += S.txt(636, 184, 's = ' + f(r.s * 100, 2) + ' %', { a: 'start', c: 'val' });
            b += S.txt(636, 204, 'n = ' + f(r.n, 0) + ' rpm', { a: 'start', c: 'val' });
        }
        b += S.txt(330, 285, 'Circuito equivalente por fase (estrella equivalente), referido al estátor', { c: 'muted' });
        return '<svg class="diagram" viewBox="0 0 790 296" role="img" aria-label="Circuito equivalente del motor asíncrono">' + b + '</svg>';
    }

    VEM.machines = VEM.machines || [];
    VEM.machines.unshift({
        id: 'motor', name: 'Máquina asíncrona', subtitle: 'Motor trifásico',
        params: params,
        note: 'Valores <strong>por fase</strong> (estrella), referidos al estátor. Todas las tensiones son <strong>de fase</strong>; las potencias, totales (usa P/3 por fase).',
        modes: [
            { id: 'vacio', label: 'Vacío', help: 'Motor girando sin carga. A V<sub>1n</sub> el simulador debe dar tus I<sub>0</sub> y P<sub>0</sub> medidas.' },
            { id: 'bloqueado', label: 'Rotor bloqueado', help: 'Rotor parado (s = 1). Ajusta V<sub>1</sub> hasta I = I<sub>n</sub>, como en el laboratorio.' },
            { id: 'carga', label: 'Carga', help: 'Introduce la velocidad que mediste con el freno y compara corriente, potencia y par.' }
        ],
        supply: function (mode, P) {
            if (mode === 'bloqueado') {
                var Uin = P.In / circuit(P, 1, 1).I1;
                return { label: 'Tensión de fase aplicada V<sub>1</sub>', unit: 'V', min: 0, max: Math.round(Math.max(Uin * 1.6, 10)), step: 0.5, def: Math.round(Uin * 2) / 2,
                    quick: { label: 'Ajustar a I<sub>n</sub> = ' + fmt(P.In, 2) + ' A', v: Uin } };
            }
            return { label: 'Tensión de fase aplicada V<sub>1</sub>', unit: 'V', min: 0, max: Math.round(P.Un * 1.2), step: 1, def: P.Un,
                quick: { label: 'Tensión nominal ' + fmt(P.Un, 0) + ' V', v: P.Un } };
        },
        load: function (P) {
            var ns = n1(P);
            return [{ k: 'n', label: 'Velocidad medida n (sincronismo: ' + fmt(ns, 0) + ' rpm)', unit: 'rpm', min: 0, max: ns, step: 1, def: Math.round(ns * 0.96) }];
        },
        solve: solve, readings: readings, diagram: diagram
    });
})();
