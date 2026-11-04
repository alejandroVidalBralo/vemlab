/* =====================================================================
   VEMLAB · Transformador monofásico
   Circuito equivalente aproximado referido al primario:
   rama de vacío (RFe ‖ jXμ) en bornes del primario y Rcc + jXcc en serie.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, Cx = VEM.Cx, C = Cx.C, S = VEM.svg, fmt = VEM.fmt;

    var params = [
        { k: 'Sn', label: 'Potencia nominal S<sub>n</sub>', unit: 'VA', def: 5000, group: 'Placa' },
        { k: 'V1n', label: 'Tensión primaria V<sub>1n</sub>', unit: 'V', def: 400, group: 'Placa' },
        { k: 'V2n', label: 'Tensión secundaria V<sub>2n</sub>', unit: 'V', def: 230, group: 'Placa' },
        { k: 'Rfe', label: 'R<sub>Fe</sub>', unit: 'Ω', def: 3200, group: 'Ensayo de vacío' },
        { k: 'Xmu', label: 'X<sub>μ</sub>', unit: 'Ω', def: 826, group: 'Ensayo de vacío' },
        { k: 'Rcc', label: 'R<sub>cc</sub>', unit: 'Ω', def: 0.64, group: 'Ensayo de cortocircuito' },
        { k: 'Xcc', label: 'X<sub>cc</sub>', unit: 'Ω', def: 1.29, group: 'Ensayo de cortocircuito' }
    ];

    function I1n(P) { return P.Sn / P.V1n; }
    function Zcc(P) { return C(P.Rcc, P.Xcc); }

    function solve(P, mode, V, L) {
        var m = P.V1n / P.V2n;
        var V1 = C(V);
        var I0 = Cx.mul(V1, C(1 / P.Rfe, -1 / P.Xmu));
        var I2p = C(0), ZLp = null;
        if (mode === 'cc') I2p = Cx.div(V1, Zcc(P));
        if (mode === 'carga') {
            var X = L.tipo === 'res' ? 0 : (L.tipo === 'cap' ? -L.X : L.X);
            ZLp = Cx.scale(C(L.R, X), m * m);
            I2p = Cx.div(V1, Cx.add(Zcc(P), ZLp));
        }
        var V2p = Cx.sub(V1, Cx.mul(I2p, Zcc(P)));
        var I1 = Cx.add(I0, I2p);
        var S1 = Cx.mul(V1, Cx.conj(I1));
        var i2p = Cx.abs(I2p), i1 = Cx.abs(I1);
        var P2 = ZLp ? i2p * i2p * ZLp.re : 0;
        var V2 = Cx.abs(V2p) / m, V20 = V / m;
        return {
            m: m, V1: V, I0: Cx.abs(I0), I1: i1, P1: S1.re, cos1: i1 > 0 ? S1.re / (V * i1) : 0,
            I2p: i2p, I2: i2p * m, V2: V2, P2: P2,
            eta: S1.re > 0 ? P2 / S1.re * 100 : NaN,
            eps: V20 > 0 ? (V20 - V2) / V20 * 100 : NaN,
            Cidx: i2p * m / (P.Sn / P.V2n),
            cos2: ZLp ? ZLp.re / Cx.abs(ZLp) : NaN
        };
    }

    function readings(mode, r) {
        if (mode === 'vacio') return [
            { k: 'V1', label: 'Tensión primario V<sub>1</sub>', unit: 'V', v: r.V1, dec: 1 },
            { k: 'I0', label: 'Corriente de vacío I<sub>0</sub>', unit: 'A', v: r.I1, dec: 3 },
            { k: 'P0', label: 'Potencia de vacío P<sub>0</sub>', unit: 'W', v: r.P1, dec: 1 },
            { k: 'V20', label: 'Tensión secundario V<sub>20</sub>', unit: 'V', v: r.V2, dec: 1 },
            { k: 'cos0', label: 'cos φ<sub>0</sub>', unit: '', v: r.cos1, dec: 3 }
        ];
        if (mode === 'cc') return [
            { k: 'V1', label: 'Tensión de cortocircuito V<sub>1cc</sub>', unit: 'V', v: r.V1, dec: 2 },
            { k: 'I1', label: 'Corriente primario I<sub>1cc</sub>', unit: 'A', v: r.I1, dec: 2 },
            { k: 'Pcc', label: 'Potencia de cortocircuito P<sub>cc</sub>', unit: 'W', v: r.P1, dec: 1 },
            { k: 'I2', label: 'Corriente secundario I<sub>2cc</sub>', unit: 'A', v: r.I2, dec: 2 },
            { k: 'coscc', label: 'cos φ<sub>cc</sub>', unit: '', v: r.cos1, dec: 3 }
        ];
        return [
            { k: 'V1', label: 'Tensión primario V<sub>1</sub>', unit: 'V', v: r.V1, dec: 1 },
            { k: 'I1', label: 'Corriente primario I<sub>1</sub>', unit: 'A', v: r.I1, dec: 2 },
            { k: 'P1', label: 'Potencia absorbida P<sub>1</sub>', unit: 'W', v: r.P1, dec: 0 },
            { k: 'V2', label: 'Tensión secundario V<sub>2</sub>', unit: 'V', v: r.V2, dec: 1 },
            { k: 'I2', label: 'Corriente secundario I<sub>2</sub>', unit: 'A', v: r.I2, dec: 2 },
            { k: 'P2', label: 'Potencia entregada P<sub>2</sub>', unit: 'W', v: r.P2, dec: 0 },
            { k: 'eta', label: 'Rendimiento η', unit: '%', v: r.eta, dec: 2 },
            { k: 'eps', label: 'Caída de tensión ε', unit: '%', v: r.eps, dec: 2 },
            { k: 'C', label: 'Índice de carga C = I<sub>2</sub>/I<sub>2n</sub>', unit: '', v: r.Cidx, dec: 2, noCompare: true },
            { k: 'cos2', label: 'cos φ<sub>2</sub> de la carga', unit: '', v: r.cos2, dec: 3, noCompare: true }
        ];
    }

    function diagram(P, mode, r, L) {
        var b = '', top = 70, bot = 240, f = fmt;
        /* fuente y primario */
        b += S.txt(20, 32, 'V₁ = ' + f(r.V1, 1) + ' V', { a: 'start', c: 'val' });
        b += S.source(50, 155);
        b += S.wire('M50,135 V' + top + ' H240 M300,' + top + ' H330 M390,' + top + ' H450 V115');
        b += S.wire('M50,175 V' + bot + ' H450 V195');
        b += S.arrowH(105, top, 'I₁ = ' + f(r.I1, 2) + ' A');
        /* rama de vacío */
        b += S.node(160, top) + S.node(160, bot);
        b += S.wire('M160,' + top + ' V95 M140,95 H180 M140,95 V105 M180,95 V105 M140,185 V205 M180,185 V205 M140,205 H180 M160,205 V' + bot);
        b += S.resV(140, 105, 80) + S.indV(180, 105, 80);
        b += S.txt(126, 140, 'R<tspan class="sub" dy="4">Fe</tspan>', { a: 'end' }) + S.txt(126, 160, f(P.Rfe, 0) + ' Ω', { a: 'end', c: 'pv' });
        b += S.txt(200, 140, 'X<tspan class="sub" dy="4">μ</tspan>', { a: 'start' }) + S.txt(200, 160, f(P.Xmu, 0) + ' Ω', { a: 'start', c: 'pv' });
        b += S.txt(200, 226, 'I₀ = ' + f(r.I0, 3) + ' A', { a: 'start', c: 'val' });
        /* serie */
        b += S.resH(240, top, 60) + S.indH(330, top, 60);
        b += S.txt(270, 44, 'R<tspan class="sub" dy="4">cc</tspan>') + S.txt(270, 104, f(P.Rcc, 3) + ' Ω', { c: 'pv' });
        b += S.txt(360, 44, 'X<tspan class="sub" dy="4">cc</tspan>') + S.txt(360, 104, f(P.Xcc, 3) + ' Ω', { c: 'pv' });
        b += S.arrowH(420, top, "I′₂", true);
        /* transformador ideal */
        b += S.indV(450, 115, 80) + S.indV(500, 115, 80);
        b += '<path class="core" d="M471,105 V205 M479,105 V205"/>';
        b += S.txt(475, 44, 'm = ' + f(r.m, 3));
        b += S.txt(475, 222, 'ideal', { c: 'muted' });
        /* secundario */
        b += S.wire('M500,115 V' + top + ' H660 M500,195 V' + bot + ' H660');
        b += S.arrowH(560, top, 'I₂ = ' + f(r.I2, 2) + ' A');
        if (mode === 'vacio') {
            b += '<circle class="term" cx="664" cy="' + top + '" r="5"/><circle class="term" cx="664" cy="' + bot + '" r="5"/>';
            b += S.txt(684, 150, 'Abierto', { a: 'start', c: 'state' });
            b += S.txt(684, 170, '(vacío)', { a: 'start', c: 'muted' });
        } else if (mode === 'cc') {
            b += S.wire('M660,' + top + ' H680 V' + bot + ' H660', 'short');
            b += S.txt(694, 150, 'Cortocircuito', { a: 'start', c: 'state' });
            b += S.txt(694, 170, 'Z = 0', { a: 'start', c: 'muted' });
        } else {
            b += S.wire('M660,' + top + ' H680 V92');
            b += S.resV(680, 92, 56);
            b += S.txt(696, 116, 'R = ' + f(L.R, 2) + ' Ω', { a: 'start', c: 'pv' });
            if (L.tipo === 'res') b += S.wire('M680,148 V' + bot + ' H660');
            else {
                b += S.wire('M680,148 V160');
                b += L.tipo === 'ind' ? S.indV(680, 160, 52) : S.capV(680, 160, 52);
                b += S.wire('M680,212 V' + bot + ' H660');
                b += S.txt(696, 190, (L.tipo === 'ind' ? 'X<tspan class="sub" dy="4">L</tspan>' : 'X<tspan class="sub" dy="4">C</tspan>') + '<tspan dy="-4"> = ' + f(L.X, 2) + ' Ω</tspan>', { a: 'start', c: 'pv' });
            }
        }
        b += S.txt(580, 160, 'V₂ = ' + f(r.V2, 1) + ' V', { c: 'val' });
        b += S.txt(260, 285, 'Circuito equivalente aproximado · parámetros referidos al primario', { c: 'muted' });
        return '<svg class="diagram" viewBox="0 0 790 296" role="img" aria-label="Circuito equivalente del transformador">' + b + '</svg>';
    }

    var Zb = function (P) { return P.V2n * P.V2n / P.Sn; };   /* impedancia base del secundario */

    VEM.machines = VEM.machines || [];
    VEM.machines.push({
        id: 'trafo', name: 'Transformador', subtitle: 'Monofásico',
        params: params,
        note: 'R<sub>cc</sub>, X<sub>cc</sub>, R<sub>Fe</sub> y X<sub>μ</sub> referidos al primario.',
        modes: [
            { id: 'vacio', label: 'Vacío', help: 'Secundario abierto. Con V<sub>1</sub> = V<sub>1n</sub> el simulador debe dar tus I<sub>0</sub> y P<sub>0</sub> medidas.' },
            { id: 'cc', label: 'Cortocircuito', help: 'Secundario en cortocircuito. Ajusta V<sub>1</sub> hasta I<sub>1</sub> = I<sub>1n</sub>, como en el laboratorio.' },
            { id: 'carga', label: 'Carga', help: 'Conecta la carga que usaste en el laboratorio y compara tensiones, corrientes y potencias.' }
        ],
        supply: function (mode, P) {
            if (mode === 'cc') {
                var Vin = I1n(P) * Cx.abs(Zcc(P));
                return { label: 'Tensión aplicada V<sub>1</sub>', unit: 'V', min: 0, max: +(Math.max(Vin * 1.5, 1)).toFixed(1), step: 0.1, def: +Vin.toFixed(1),
                    quick: { label: 'Ajustar a I<sub>1n</sub> = ' + fmt(I1n(P), 2) + ' A', v: Vin } };
            }
            return { label: 'Tensión aplicada V<sub>1</sub>', unit: 'V', min: 0, max: Math.round(P.V1n * 1.2), step: 1, def: P.V1n,
                quick: { label: 'Tensión nominal ' + fmt(P.V1n, 0) + ' V', v: P.V1n } };
        },
        load: function (P) {
            var z = Zb(P);
            return [
                { k: 'tipo', label: 'Tipo de carga', seg: [['res', 'Resistiva'], ['ind', 'Inductiva (R-L)'], ['cap', 'Capacitiva (R-C)']], def: 'ind' },
                { k: 'R', label: 'Resistencia R (en el secundario)', unit: 'Ω', min: 0.1, max: +(z * 5).toFixed(1), step: 0.1, def: +(z / 0.75 * 0.8).toFixed(1) },
                { k: 'X', label: 'Reactancia X (en el secundario)', unit: 'Ω', min: 0.1, max: +(z * 5).toFixed(1), step: 0.1, def: +(z / 0.75 * 0.6).toFixed(1), hideIf: { tipo: 'res' } }
            ];
        },
        solve: solve, readings: readings, diagram: diagram
    });
})();
