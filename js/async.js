/* =====================================================================
   VEMLAB · Motor asíncrono trifásico
   Modelo: circuito equivalente exacto por fase (estrella equivalente),
   pérdidas mecánicas ∝ n², régimen permanente y arranque cuasiestático
   (se resuelve J·dω/dt = T_em − T_carga − T_pérdidas).
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, Cx = VEM.Cx, C = Cx.C, ui = VEM.ui, fmt = VEM.fmt;
    var SQ3 = Math.sqrt(3);

    var defaults = {
        Un: 400, f: 50, p: 2, Pn: 4000, rotor: 'bobinado', J: 0.08,
        R1: 1.5, X1: 2.4, R2: 1.3, X2: 2.4, Rfe: 1400, Xmu: 75, Pm: 70
    };
    var defs = [
        { k: 'Un', label: 'Tensión de línea U<sub>n</sub> (estrella)', unit: 'V', plate: true, min: 10 },
        { k: 'f', label: 'Frecuencia f', unit: 'Hz', plate: true, min: 1 },
        { k: 'p', label: 'Pares de polos p', unit: '', plate: true, min: 1, step: 1 },
        { k: 'Pn', label: 'Potencia útil nominal P<sub>n</sub>', unit: 'W', plate: true, min: 10 },
        { k: 'rotor', label: 'Tipo de rotor', plate: true, select: [['jaula', 'Jaula de ardilla'], ['bobinado', 'Bobinado (anillos)']] },
        { k: 'J', label: 'Inercia J (motor + freno)', unit: 'kg·m²', plate: true, min: 0.005 },
        { k: 'R1', label: 'R<sub>1</sub> estátor', unit: 'Ω', vary: 0.2, min: 0.001 },
        { k: 'X1', label: 'X<sub>1</sub> estátor', unit: 'Ω', vary: 0.2, min: 0.001 },
        { k: 'R2', label: 'R′<sub>2</sub> rotor (referida)', unit: 'Ω', vary: 0.2, min: 0.001 },
        { k: 'X2', label: 'X′<sub>2</sub> rotor (referida)', unit: 'Ω', tie: 'X1', min: 0.001 },
        { k: 'Rfe', label: 'R<sub>Fe</sub>', unit: 'Ω', vary: 0.2, min: 1 },
        { k: 'Xmu', label: 'X<sub>μ</sub>', unit: 'Ω', vary: 0.2, min: 0.1 },
        { k: 'Pm', label: 'Pérdidas mecánicas a n<sub>1</sub>', unit: 'W', vary: 0.3, min: 0 }
    ];

    /* ---------------- Modelo ---------------- */
    function w1(P) { return 2 * Math.PI * P.f / P.p; }
    function n1(P) { return 60 * P.f / P.p; }

    /* Circuito por fase. U: tensión de línea, Rx: resistencia adicional rotórica (referida) */
    function solve(P, s, U, Rx) {
        Rx = Rx || 0;
        if (Math.abs(s) < 1e-9) s = 1e-9;
        var V = U / SQ3, ws = w1(P);
        var Z1 = C(P.R1, P.X1);
        var Zm = Cx.par(C(P.Rfe), C(0, P.Xmu));
        var R2t = P.R2 + Rx;
        var Z2 = C(R2t / s, P.X2);
        var Zp = Cx.par(Zm, Z2);
        var I1 = Cx.div(C(V), Cx.add(Z1, Zp));
        var E = Cx.mul(I1, Zp);
        var I2 = Cx.abs(E) / Cx.abs(Z2);
        var e = Cx.abs(E), i1 = Cx.abs(I1);
        var P1 = 3 * V * I1.re;
        var Pcu1 = 3 * i1 * i1 * P.R1;
        var Pfe = 3 * e * e / P.Rfe;
        var Pa = 3 * I2 * I2 * R2t / s;
        var Pcu2 = 3 * I2 * I2 * P.R2, Prx = 3 * I2 * I2 * Rx;
        var Pmi = Pa * (1 - s);
        var w = ws * (1 - s);
        var Pmec = P.Pm * Math.pow(Math.max(0, 1 - s), 2);
        var Pu = Pmi - Pmec;
        return {
            s: s, U: U, I: i1, I2: I2, cos: i1 > 0 ? I1.re / i1 : 0, P1: P1,
            Pcu1: Pcu1, Pfe: Pfe, Pa: Pa, Pcu2: Pcu2, Prx: Prx, Pmi: Pmi, Pmec: Pmec, Pu: Pu,
            Tem: Pa / ws, Tu: w > 1e-6 ? Pu / w : Pa / ws, n: n1(P) * (1 - s), w: w,
            eta: P1 > 0 && Pu > 0 ? Pu / P1 * 100 : 0
        };
    }
    function lossTorque(P, w) { var ws = w1(P); return P.Pm * w / (ws * ws); }

    var SGRID = (function () { var a = []; for (var i = 0; i <= 500; i++) a.push(Math.pow(10, -5 + 5 * i / 500)); return a; })();

    /* Punto de equilibrio en la rama estable. TL(w) = par resistente. */
    function steady(P, U, Rx, TL) {
        var ws = w1(P);
        function f(s) {
            var w = ws * (1 - s);
            return solve(P, s, U, Rx).Tem - TL(w) - lossTorque(P, w);
        }
        var prev = f(SGRID[0]);
        for (var i = 1; i < SGRID.length; i++) {
            var cur = f(SGRID[i]);
            if (prev < 0 && cur >= 0) {
                var a = SGRID[i - 1], b = SGRID[i];
                for (var k = 0; k < 60; k++) { var mid = (a + b) / 2; if (f(mid) < 0) a = mid; else b = mid; }
                return { r: solve(P, (a + b) / 2, U, Rx), stalled: false };
            }
            prev = cur;
        }
        return { r: solve(P, 1, U, Rx), stalled: true };
    }

    function tmax(P, U, Rx) {
        var best = { T: 0, s: 1 };
        SGRID.forEach(function (s) { var T = solve(P, s, U, Rx).Tem; if (T > best.T) best = { T: T, s: s }; });
        return best;
    }

    var nomCache = { key: '', v: null };
    function nominal(P) {
        var key = JSON.stringify(P);
        if (nomCache.key === key) return nomCache.v;
        var prev = solve(P, SGRID[0], P.Un).Pu - P.Pn, v = null;
        for (var i = 1; i < SGRID.length; i++) {
            var cur = solve(P, SGRID[i], P.Un).Pu - P.Pn;
            if (prev < 0 && cur >= 0) {
                var a = SGRID[i - 1], b = SGRID[i];
                for (var k = 0; k < 60; k++) { var mid = (a + b) / 2; if (solve(P, mid, P.Un).Pu < P.Pn) a = mid; else b = mid; }
                v = solve(P, (a + b) / 2, P.Un);
                break;
            }
            prev = cur;
        }
        if (v) {
            var tm = tmax(P, P.Un, 0), st = solve(P, 1, P.Un);
            v.Tn = v.Tu; v.Tmax = tm.T; v.sTmax = tm.s; v.Tarr = st.Tem; v.Iarr = st.I;
        }
        nomCache = { key: key, v: v };
        return v;
    }

    function plateData(P) {
        var N = nominal(P);
        var rows = [
            ['Potencia útil P<sub>n</sub>', fmt(P.Pn / 1000, 2) + ' kW'],
            ['Tensión / conexión', fmt(P.Un, 0) + ' V · estrella'],
            ['Frecuencia · pares de polos', fmt(P.f, 0) + ' Hz · p = ' + P.p],
            ['Rotor', P.rotor === 'bobinado' ? 'Bobinado (con anillos y reóstato)' : 'Jaula de ardilla'],
            ['Velocidad de sincronismo n<sub>1</sub>', fmt(n1(P), 0) + ' rpm']
        ];
        if (!N) return rows.concat([['Aviso', 'Con estos parámetros el motor no llega a P<sub>n</sub>. Revisa los valores.']]);
        return rows.concat([
            ['Velocidad nominal n<sub>n</sub>', fmt(N.n, 0) + ' rpm (s<sub>n</sub> = ' + fmt(N.s * 100, 2) + ' %)'],
            ['Corriente nominal I<sub>n</sub>', fmt(N.I, 2) + ' A'],
            ['cos φ<sub>n</sub> · η<sub>n</sub>', fmt(N.cos, 3) + ' · ' + fmt(N.eta, 1) + ' %'],
            ['Par nominal T<sub>n</sub>', fmt(N.Tn, 1) + ' N·m'],
            ['I<sub>arr</sub>/I<sub>n</sub> · T<sub>arr</sub>/T<sub>n</sub> · T<sub>máx</sub>/T<sub>n</sub>', fmt(N.Iarr / N.I, 2) + ' · ' + fmt(N.Tarr / N.Tn, 2) + ' · ' + fmt(N.Tmax / N.Tn, 2), true]
        ]);
    }

    /* ---------------- Utilidades ---------------- */
    function m(v, res) { return VEM.measure(v, res); }
    function rowsOf(key) { return VEM.store.get('table.' + key, []); }
    function nearest(rows, field, target) {
        var best = null;
        rows.forEach(function (r) { if (!best || Math.abs(r[field] - target) < Math.abs(best[field] - target)) best = r; });
        return best;
    }
    function R1meas(P) { var v = VEM.store.get('async.R1meas', null); return (v && isFinite(v)) ? v : P.R1; }
    function In(P) { var N = nominal(P); return N ? N.I : 1; }

    /* Pm por extrapolación de (P0 − 3R1I0²) frente a U² */
    function pmFit(P, rows) {
        var R1 = R1meas(P);
        var pts = rows.filter(function (r) { return r.U > 0.3 * P.Un; }).map(function (r) { return [r.U * r.U, r.P0 - 3 * R1 * r.I0 * r.I0]; });
        if (pts.length < 2) return null;
        var us = pts.map(function (p) { return p[0]; });
        if (Math.max.apply(null, us) - Math.min.apply(null, us) < 0.05 * P.Un * P.Un) return null;
        return VEM.linFit(pts);
    }
    function vacioSweep(P) {
        var pts = [];
        for (var u = 0.2; u <= 1.101; u += 0.05) {
            var r = steady(P, u * P.Un, 0, function () { return 0; }).r;
            pts.push({ U: r.U, I0: r.I, P0: r.P1, n: r.n });
        }
        return pts;
    }

    /* =====================================================================
       Prácticas
       ===================================================================== */

    function renderMaquina(root, P) {
        var grid = ui.h('<div class="grid-2"></div>'); root.appendChild(grid);
        var left = ui.h('<div class="stack"></div>'), right = ui.h('<div class="stack"></div>');
        grid.appendChild(left); grid.appendChild(right);
        VEM.app.plateCard(left, 'Placa de características', plateData(P),
            'Motor trifásico. Los valores nominales los calcula el simulador a partir del circuito equivalente.');
        VEM.app.paramsCard(left, 'async', defs, P);
        var eq = ui.card(right, 'Circuito equivalente por fase');
        eq.innerHTML = VEM.sch.asyncEquiv() +
            '<p class="card-intro">R<sub>1</sub> se mide en <strong>corriente continua</strong>; R<sub>Fe</sub>, X<sub>μ</sub> y las pérdidas mecánicas del ' +
            '<strong>ensayo de vacío</strong>; R′<sub>2</sub>, X<sub>1</sub> y X′<sub>2</sub> del <strong>ensayo de rotor bloqueado</strong> ' +
            '(suponiendo X<sub>1</sub> = X′<sub>2</sub>). La resistencia de carga R′<sub>2</sub>(1−s)/s representa la potencia mecánica interna.</p>';
        var cv = ui.chart(ui.card(right, 'Característica par–velocidad a tensión nominal'));
        var N = nominal(P), dataT = [], dataI = [];
        for (var i = 0; i <= 300; i++) {
            var s = 1 - i / 300 * 1.0;
            var r = solve(P, Math.max(s, 1e-4), P.Un);
            dataT.push([r.n, r.Tem]); dataI.push([r.n, r.I]);
        }
        VEM.plot(cv, {
            xLabel: 'n (rpm)', yLabel: 'T (N·m)', x: [0, n1(P)],
            lines: [{ data: dataT, color: VEM.col(1), label: 'Par electromagnético' }],
            marker: N ? { x: N.n, y: N.Tem, color: VEM.col(2), label: 'Punto nominal' } : null
        });
    }

    /* ---------- 1. Ensayo de vacío (+ medida de R1 en c.c.) ---------- */
    function renderVacio(root, P) {
        ui.guide(root, {
            goal: 'Medir R<sub>1</sub> en corriente continua y, con el motor girando en vacío, separar las pérdidas mecánicas P<sub>m</sub> de las pérdidas en el hierro P<sub>Fe</sub> para obtener R<sub>Fe</sub> y X<sub>μ</sub>.',
            circuit: VEM.sch.asyncSetup('vacio'),
            steps: [
                '<strong>Ensayo en c.c.:</strong> con el motor desconectado, aplica una tensión continua baja entre dos bornes del estátor y mide U e I. En estrella, R<sub>1</sub> = U<sub>cc</sub>/(2·I<sub>cc</sub>).',
                '<strong>Vacío:</strong> arranca el motor sin carga y llévalo a la tensión nominal. Gira casi a la velocidad de sincronismo.',
                'Registra U, I<sub>0</sub>, P<sub>0</sub> y n. Baja la tensión por escalones (hasta ≈ 40 % de U<sub>n</sub>) registrando cada punto.',
                'Para cada punto calcula P<sub>0</sub> − 3·R<sub>1</sub>·I<sub>0</sub>² y represéntalo frente a U². Extrapolando la recta a U = 0 obtienes las <strong>pérdidas mecánicas</strong>.',
                'A tensión nominal: P<sub>Fe</sub> = P<sub>0</sub> − 3R<sub>1</sub>I<sub>0</sub>² − P<sub>m</sub>, y de ahí cos φ<sub>0</sub>, R<sub>Fe</sub> y X<sub>μ</sub>.'
            ],
            safety: 'La potencia se mide con el método de los dos vatímetros; aquí se muestra ya la suma P<sub>0</sub>. En vacío el factor de potencia es muy bajo y uno de los vatímetros puede marcar negativo.'
        });

        /* --- Medida de R1 en c.c. --- */
        var dcGrid = ui.h('<div class="grid-lab"></div>'); root.appendChild(dcGrid);
        var dcCtl = ui.card(dcGrid, 'Ensayo en c.c. · mando', 'controls');
        dcCtl.insertAdjacentHTML('beforeend', VEM.sch.asyncSetup('cc_dc'));
        var dcIns = ui.card(dcGrid, 'Ensayo en c.c. · instrumentos', 'instruments');
        var dcM = ui.meters(dcIns, [
            { key: 'U', sym: 'V', label: 'Tensión continua U<sub>cc</sub>', unit: 'V', dec: 2 },
            { key: 'I', sym: 'A', label: 'Corriente continua I<sub>cc</sub>', unit: 'A', dec: 3 },
            { key: 'R1', sym: 'Ω', label: 'R<sub>1</sub> = U/(2I)', unit: 'Ω', dec: 3, kind: 'calc' }
        ]);
        var dcAlarm = ui.h('<div class="alarm" hidden></div>'); dcIns.appendChild(dcAlarm);
        var In_ = In(P);
        var dcv = ui.control(dcCtl, {
            id: 'av-dc', label: 'Tensión de la fuente', unit: 'V', min: 0, max: Math.ceil(2 * P.R1 * In_ * 1.4), step: 0.1, value: Math.round(2 * P.R1 * In_ * 0.5 * 10) / 10, dec: 1,
            onInput: updateDC, help: 'No superes la corriente nominal del devanado (≈ ' + fmt(In_, 1) + ' A).'
        });
        function updateDC() {
            var U = dcv.get(), I = U / (2 * P.R1);
            var lu = m(U, 0.01), li = Math.max(0, m(I, 0.002));
            var R1 = li > 0.01 ? lu / (2 * li) : NaN;
            dcM.update({ U: lu, I: li, R1: R1 });
            if (isFinite(R1)) VEM.store.set('async.R1meas', R1);
            dcAlarm.hidden = I <= In_ * 1.05;
            dcAlarm.innerHTML = '⚠ La corriente supera la nominal del devanado.';
            if (window.__vemVacioRedraw) window.__vemVacioRedraw();
        }

        /* --- Vacío --- */
        var grid = ui.h('<div class="grid-lab"></div>'); root.appendChild(grid);
        var ctl = ui.card(grid, 'Ensayo de vacío · mando', 'controls');
        var ins = ui.card(grid, 'Ensayo de vacío · instrumentos', 'instruments');
        var meters = ui.meters(ins, [
            { key: 'U', sym: 'V', label: 'Tensión de línea U', unit: 'V', dec: 1 },
            { key: 'I0', sym: 'A', label: 'Corriente de línea I<sub>0</sub>', unit: 'A', dec: 3 },
            { key: 'P0', sym: 'W', label: 'Potencia total P<sub>0</sub>', unit: 'W', dec: 1 },
            { key: 'n', sym: 'n', label: 'Velocidad', unit: 'rpm', dec: 0 }
        ]);
        var alarm = ui.h('<div class="alarm" hidden></div>'); ins.appendChild(alarm);
        var live = {};
        var uc = ui.control(ctl, {
            id: 'av-u', label: 'Tensión de línea U', unit: 'V', min: Math.round(P.Un * 0.1), max: Math.round(P.Un * 1.1), step: 1, value: P.Un, dec: 0,
            onInput: update, help: 'Nominal: ' + fmt(P.Un, 0) + ' V'
        });
        ctl.insertAdjacentHTML('beforeend', '<div class="btn-row"><button type="button" class="btn btn-ghost" data-go>Ir a U<sub>n</sub></button></div>');
        ctl.querySelector('[data-go]').addEventListener('click', function () { uc.set(P.Un); });

        var charts = ui.h('<div class="grid-2"></div>'); root.appendChild(charts);
        var c1 = ui.chart(ui.card(charts, 'Corriente de vacío I<sub>0</sub>(U)'));
        var c2 = ui.chart(ui.card(charts, 'Separación de pérdidas: P<sub>0</sub> − 3R<sub>1</sub>I<sub>0</sub>² frente a U²'));
        var tbl = ui.table(root, {
            key: 'async.vacio', title: 'Medidas del ensayo de vacío',
            columns: [{ key: 'U', label: 'U', unit: 'V', dec: 1 }, { key: 'I0', label: 'I<sub>0</sub>', unit: 'A', dec: 3 },
                { key: 'P0', label: 'P<sub>0</sub>', unit: 'W', dec: 1 }, { key: 'n', label: 'n', unit: 'rpm', dec: 0 }],
            getRow: function () { return live.stalled ? null : Object.assign({}, live); },
            onChange: function () { drawCharts(); showResults(); }
        });
        var res = ui.results(root, 'Resultados del ensayo de vacío',
            'P<sub>m</sub> se obtiene de la recta ajustada a tus medidas (mínimo 2 puntos con tensiones distintas); el resto con tu medida más próxima a U<sub>n</sub>.');

        var sweep = vacioSweep(P);
        function drawCharts() {
            var rows = tbl.rows(), R1 = R1meas(P);
            var fit = pmFit(P, rows);
            var lines = [];
            if (fit) lines.push({ data: [[0, fit.b], [Math.pow(P.Un * 1.1, 2) / 1000, fit.b + fit.m * Math.pow(P.Un * 1.1, 2)]], color: VEM.col(3), dash: [6, 4], width: 1.5, label: 'Recta ajustada (corte = P_m)' });
            VEM.plot(c1, {
                xLabel: 'U (V)', yLabel: 'I₀ (A)', x: [0, P.Un * 1.1],
                lines: [{ data: sweep.map(function (p) { return [p.U, p.I0]; }), color: VEM.col(1), label: 'Simulador' }],
                points: [{ data: rows.map(function (r) { return [r.U, r.I0]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: live.stalled ? null : { x: live.U, y: live.I0, color: VEM.col(2), label: 'Lectura actual' }
            });
            VEM.plot(c2, {
                xLabel: 'U² (×1000 V²)', yLabel: 'P₀ − 3R₁I₀² (W)', x: [0, Math.pow(P.Un * 1.1, 2) / 1000], y: [0, null],
                lines: [{ data: sweep.map(function (p) { return [p.U * p.U / 1000, p.P0 - 3 * R1 * p.I0 * p.I0]; }), color: VEM.col(1), label: 'Simulador' }].concat(lines),
                points: [{ data: rows.map(function (r) { return [r.U * r.U / 1000, r.P0 - 3 * R1 * r.I0 * r.I0]; }), color: VEM.col(3), label: 'Tus medidas' }]
            });
        }
        window.__vemVacioRedraw = function () { drawCharts(); showResults(); };
        function showResults() {
            var rows = tbl.rows(), R1 = R1meas(P);
            var fit = pmFit(P, rows);
            var row = rows.length ? nearest(rows, 'U', P.Un) : (live.stalled ? null : live);
            if (!row) { res.update([], 'Sin datos.'); return; }
            var Pm = fit ? fit.b : NaN;
            var V = row.U / SQ3;
            var Pcu1 = 3 * R1 * row.I0 * row.I0;
            var Pfe = row.P0 - Pcu1 - Pm;
            var cos0 = Pfe / (3 * V * row.I0), sin0 = Math.sqrt(Math.max(0, 1 - cos0 * cos0));
            var note = 'R<sub>1</sub> = ' + fmt(R1, 3) + ' Ω (de tu ensayo en c.c.). ' +
                (rows.length ? 'Medida usada: U = ' + fmt(row.U, 1) + ' V.' : 'Usando la lectura actual: registra varias tensiones para obtener P<sub>m</sub>.');
            if (!fit) note += ' <span class="warn-text">Faltan puntos para la recta: P<sub>m</sub>, P<sub>Fe</sub>, R<sub>Fe</sub> y X<sub>μ</sub> no se pueden calcular aún.</span>';
            else if (Math.abs(row.U - P.Un) / P.Un > 0.03) note += ' <span class="warn-text">⚠ No tienes una medida a tensión nominal.</span>';
            res.update([
                { label: 'Pérdidas en el cobre del estátor P<sub>Cu1</sub>', value: Pcu1, unit: 'W', dec: 1, formula: 'P<sub>Cu1</sub> = 3·R<sub>1</sub>·I<sub>0</sub>²' },
                { label: 'Pérdidas mecánicas P<sub>m</sub>', value: Pm, unit: 'W', dec: 1, formula: 'Ordenada en el origen de la recta P<sub>0</sub> − P<sub>Cu1</sub> = f(U²)' },
                { label: 'Pérdidas en el hierro P<sub>Fe</sub>', value: Pfe, unit: 'W', dec: 1, formula: 'P<sub>Fe</sub> = P<sub>0</sub> − P<sub>Cu1</sub> − P<sub>m</sub>' },
                { label: 'cos φ<sub>0</sub>', value: cos0, dec: 4, formula: 'cos φ<sub>0</sub> = P<sub>Fe</sub> / (3·V<sub>1</sub>·I<sub>0</sub>),  V<sub>1</sub> = U/√3' },
                { label: 'R<sub>Fe</sub>', value: V / (row.I0 * cos0), unit: 'Ω', dec: 0, formula: 'R<sub>Fe</sub> = V<sub>1</sub> / (I<sub>0</sub>·cos φ<sub>0</sub>)' },
                { label: 'X<sub>μ</sub>', value: V / (row.I0 * sin0), unit: 'Ω', dec: 2, formula: 'X<sub>μ</sub> = V<sub>1</sub> / (I<sub>0</sub>·sen φ<sub>0</sub>)' },
                { label: 'Corriente de vacío', value: row.I0 / In(P) * 100, unit: '% de I<sub>n</sub>', dec: 1, formula: 'Mucho mayor que en un transformador: el entrehierro exige más magnetización' }
            ], note);
        }
        function update() {
            var st = steady(P, uc.get(), 0, function () { return 0; });
            var r = st.r;
            live = { U: m(r.U, 0.1), I0: Math.max(0, m(r.I, 0.002)), P0: m(r.P1, 0.5), n: Math.max(0, m(r.n, 1)), stalled: st.stalled };
            alarm.hidden = !st.stalled;
            alarm.innerHTML = '⚠ Con esta tensión el par motor no vence las pérdidas mecánicas: el motor se para. En el laboratorio, desconecta y vuelve a subir la tensión.';
            meters.update(live);
            drawCharts(); showResults();
        }
        updateDC();
        update();
    }

    /* ---------- 2. Ensayo de rotor bloqueado ---------- */
    function renderRotor(root, P) {
        var In_ = In(P);
        ui.guide(root, {
            goal: 'Obtener la impedancia de cortocircuito del motor y, a partir de ella, R′<sub>2</sub>, X<sub>1</sub> y X′<sub>2</sub>. También permite estimar la corriente de arranque a tensión nominal.',
            circuit: VEM.sch.asyncSetup('rotor'),
            steps: [
                'Bloquea mecánicamente el rotor (s = 1)' + (P.rotor === 'bobinado' ? ' y cortocircuita los anillos (reóstato a cero).' : '.'),
                '<strong>Con el autotransformador a 0 V</strong>, sube la tensión despacio hasta que la corriente sea la nominal, I<sub>n</sub> ≈ ' + fmt(In_, 2) + ' A.',
                'Registra U<sub>cc</sub>, I<sub>cc</sub> y P<sub>cc</sub>. Toma también puntos a corrientes menores.',
                'Calcula cos φ<sub>cc</sub>, R<sub>cc</sub> = P<sub>cc</sub>/(3I<sub>n</sub>²) y Z<sub>cc</sub> = (U<sub>cc</sub>/√3)/I<sub>n</sub>.',
                'Con R<sub>1</sub> del ensayo en c.c.: R′<sub>2</sub> = R<sub>cc</sub> − R<sub>1</sub> y X<sub>1</sub> = X′<sub>2</sub> = X<sub>cc</sub>/2.'
            ],
            safety: 'Haz el ensayo rápido: el motor no ventila al estar parado y se calienta. La tensión necesaria es aproximadamente un 15–25 % de la nominal. Se desprecia la rama de vacío porque la tensión es baja.'
        });
        var grid = ui.h('<div class="grid-lab"></div>'); root.appendChild(grid);
        var ctl = ui.card(grid, 'Mando', 'controls');
        var ins = ui.card(grid, 'Instrumentos', 'instruments');
        var meters = ui.meters(ins, [
            { key: 'U', sym: 'V', label: 'Tensión de línea U<sub>cc</sub>', unit: 'V', dec: 1 },
            { key: 'I', sym: 'A', label: 'Corriente de línea I<sub>cc</sub>', unit: 'A', dec: 2 },
            { key: 'P', sym: 'W', label: 'Potencia total P<sub>cc</sub>', unit: 'W', dec: 1 }
        ]);
        var alarm = ui.h('<div class="alarm" hidden></div>'); ins.appendChild(alarm);
        var live = {};
        var Vn_cc = P.Un * In_ / solve(P, 1, P.Un).I;
        var umax = Math.ceil(Vn_cc * 1.4);
        var uc = ui.control(ctl, { id: 'ar-u', label: 'Tensión de línea U<sub>cc</sub>', unit: 'V', min: 0, max: umax, step: 0.5, value: 0, dec: 1, onInput: update });
        ctl.insertAdjacentHTML('beforeend', '<div class="btn-row"><button type="button" class="btn btn-ghost" data-go="in">Ajustar a I<sub>n</sub></button><button type="button" class="btn btn-ghost" data-go="0">A cero</button></div>');
        ctl.querySelector('[data-go="in"]').addEventListener('click', function () { uc.set(Math.round(Vn_cc * 2) / 2); });
        ctl.querySelector('[data-go="0"]').addEventListener('click', function () { uc.set(0); });

        var charts = ui.h('<div class="grid-2"></div>'); root.appendChild(charts);
        var c1 = ui.chart(ui.card(charts, 'Corriente I<sub>cc</sub>(U<sub>cc</sub>)'));
        var c2 = ui.chart(ui.card(charts, 'Potencia P<sub>cc</sub>(I<sub>cc</sub>)'));
        var tbl = ui.table(root, {
            key: 'async.rotor', title: 'Medidas del ensayo de rotor bloqueado',
            columns: [{ key: 'U', label: 'U<sub>cc</sub>', unit: 'V', dec: 1 }, { key: 'I', label: 'I<sub>cc</sub>', unit: 'A', dec: 2 }, { key: 'P', label: 'P<sub>cc</sub>', unit: 'W', dec: 1 }],
            getRow: function () { return Object.assign({}, live); },
            onChange: function () { drawCharts(); showResults(); }
        });
        var res = ui.results(root, 'Resultados del ensayo (referidos a I<sub>n</sub>)',
            'Con tu medida más próxima a I<sub>n</sub>; si no coincide, se refiere a I<sub>n</sub> (U ∝ I, P ∝ I²). Valores por fase en estrella equivalente.');

        var curveI = [], curveP = [];
        for (var u = 0; u <= umax; u += umax / 50) { var r = solve(P, 1, u); curveI.push([u, r.I]); curveP.push([r.I, r.P1]); }
        function drawCharts() {
            var rows = tbl.rows();
            VEM.plot(c1, {
                xLabel: 'Ucc (V)', yLabel: 'Icc (A)', x: [0, umax],
                lines: [{ data: curveI, color: VEM.col(1), label: 'Simulador' }],
                points: [{ data: rows.map(function (r) { return [r.U, r.I]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: { x: live.U, y: live.I, color: VEM.col(2), label: 'Lectura actual' }
            });
            VEM.plot(c2, {
                xLabel: 'Icc (A)', yLabel: 'Pcc (W)',
                lines: [{ data: curveP, color: VEM.col(1), label: 'Simulador (∝ I²)' }],
                points: [{ data: rows.map(function (r) { return [r.I, r.P]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: { x: live.I, y: live.P, color: VEM.col(2), label: 'Lectura actual' },
                vlines: [{ x: In_, label: 'In' }]
            });
        }
        function showResults() {
            var rows = tbl.rows();
            var row = rows.length ? nearest(rows, 'I', In_) : live;
            if (!row || row.I < 0.1 * In_) { res.update([], 'Sube la tensión hasta que circule una corriente apreciable (idealmente I<sub>n</sub>).'); return; }
            var k = In_ / row.I, Ucc = row.U * k, Pcc = row.P * k * k, R1 = R1meas(P);
            var Zcc = Ucc / SQ3 / In_, Rcc = Pcc / (3 * In_ * In_), Xcc = Math.sqrt(Math.max(0, Zcc * Zcc - Rcc * Rcc));
            var note = (rows.length ? 'Medida usada: I<sub>cc</sub> = ' : 'Lectura actual: I<sub>cc</sub> = ') + fmt(row.I, 2) + ' A' +
                (Math.abs(k - 1) > 0.01 ? ', referida a I<sub>n</sub> = ' + fmt(In_, 2) + ' A.' : '.') + ' R<sub>1</sub> = ' + fmt(R1, 3) + ' Ω (ensayo en c.c.).';
            res.update([
                { label: 'U<sub>cc</sub> a I<sub>n</sub>', value: Ucc, unit: 'V', dec: 1, formula: 'ε<sub>cc</sub> = ' + fmt(Ucc / P.Un * 100, 1) + ' % de U<sub>n</sub>' },
                { label: 'P<sub>cc</sub> a I<sub>n</sub>', value: Pcc, unit: 'W', dec: 1, formula: 'Pérdidas en el cobre nominales (estátor + rotor)' },
                { label: 'cos φ<sub>cc</sub>', value: Pcc / (SQ3 * Ucc * In_), dec: 4, formula: 'cos φ<sub>cc</sub> = P<sub>cc</sub> / (√3·U<sub>cc</sub>·I<sub>n</sub>)' },
                { label: 'R<sub>cc</sub> = R<sub>1</sub> + R′<sub>2</sub>', value: Rcc, unit: 'Ω', dec: 3, formula: 'R<sub>cc</sub> = P<sub>cc</sub> / (3·I<sub>n</sub>²)' },
                { label: 'X<sub>cc</sub> = X<sub>1</sub> + X′<sub>2</sub>', value: Xcc, unit: 'Ω', dec: 3, formula: 'X<sub>cc</sub> = √(Z<sub>cc</sub>² − R<sub>cc</sub>²),  Z<sub>cc</sub> = (U<sub>cc</sub>/√3)/I<sub>n</sub>' },
                { label: 'R′<sub>2</sub>', value: Rcc - R1, unit: 'Ω', dec: 3, formula: 'R′<sub>2</sub> = R<sub>cc</sub> − R<sub>1</sub>' },
                { label: 'X<sub>1</sub> = X′<sub>2</sub>', value: Xcc / 2, unit: 'Ω', dec: 3, formula: 'X<sub>1</sub> = X′<sub>2</sub> ≈ X<sub>cc</sub> / 2' },
                { label: 'Corriente de arranque a U<sub>n</sub>', value: In_ * P.Un / Ucc, unit: 'A', dec: 1, formula: 'I<sub>arr</sub> ≈ I<sub>n</sub>·U<sub>n</sub>/U<sub>cc</sub> = ' + fmt(P.Un / Ucc, 2) + '·I<sub>n</sub>' }
            ], note);
        }
        function update() {
            var r = solve(P, 1, uc.get());
            live = { U: m(r.U, 0.1), I: Math.max(0, m(r.I, 0.01)), P: Math.max(0, m(r.P1, 0.5)) };
            meters.update(live);
            var over = r.I > In_ * 1.1;
            alarm.hidden = !over;
            if (over) alarm.innerHTML = '⚠ Corriente al ' + fmt(r.I / In_ * 100, 0) + ' % de I<sub>n</sub> con el rotor parado: el motor se calienta muy rápido.';
            drawCharts(); showResults();
        }
        update();
    }

    /* ---------- 3. Ensayo en carga ---------- */
    function renderCarga(root, P) {
        var N = nominal(P), In_ = In(P), Tn = N ? N.Tn : 10, wound = P.rotor === 'bobinado';
        ui.guide(root, {
            goal: 'Obtener las curvas de funcionamiento del motor (velocidad, corriente, cos φ y rendimiento en función de la carga) y estudiar el balance de potencias' +
                (wound ? ' y el efecto del reóstato rotórico.' : '.'),
            circuit: VEM.sch.asyncSetup('carga'),
            steps: [
                'Arranca el motor en vacío y llévalo a tensión nominal.',
                'Aumenta el par del freno por escalones desde 0 hasta ≈ 1,2·T<sub>n</sub> (T<sub>n</sub> ≈ ' + fmt(Tn, 1) + ' N·m).',
                'En cada escalón registra U, I, P<sub>1</sub>, n y T. Calcula P<sub>u</sub> = T·ω, η = P<sub>u</sub>/P<sub>1</sub>, cos φ y s.',
                'Representa n, I, cos φ y η frente a P<sub>u</sub>.',
                wound ? 'Con un par fijo, introduce resistencia en el reóstato: observa cómo baja la velocidad y aumentan las pérdidas en el rotor (P<sub>Cu2</sub> = s·P<sub>a</sub>).' : 'Observa en la curva par–velocidad dónde se sitúa el punto de funcionamiento y cuánto margen hay hasta el par máximo.'
            ],
            safety: 'Si el par resistente supera el par máximo, el motor se “cala” y queda absorbiendo la corriente de arranque. Vigila la temperatura del freno y del motor.'
        });
        var grid = ui.h('<div class="grid-lab"></div>'); root.appendChild(grid);
        var ctl = ui.card(grid, 'Mando', 'controls');
        var ins = ui.card(grid, 'Instrumentos', 'instruments');
        var meters = ui.meters(ins, [
            { key: 'U', sym: 'V', label: 'Tensión de línea U', unit: 'V', dec: 1 },
            { key: 'I', sym: 'A', label: 'Corriente de línea I', unit: 'A', dec: 2 },
            { key: 'P1', sym: 'W', label: 'Potencia absorbida P<sub>1</sub>', unit: 'W', dec: 0 },
            { key: 'n', sym: 'n', label: 'Velocidad', unit: 'rpm', dec: 0 },
            { key: 'T', sym: 'T', label: 'Par en el freno', unit: 'N·m', dec: 2 },
            { key: 'Pu', sym: 'P<sub>u</sub>', label: 'Potencia útil T·ω', unit: 'W', dec: 0, kind: 'calc' },
            { key: 'eta', sym: 'η', label: 'Rendimiento', unit: '%', dec: 1, kind: 'calc' },
            { key: 'cos', sym: 'φ', label: 'Factor de potencia', unit: '', dec: 3, kind: 'calc' },
            { key: 's', sym: 's', label: 'Deslizamiento', unit: '%', dec: 2, kind: 'calc' }
        ]);
        var alarm = ui.h('<div class="alarm" hidden></div>'); ins.appendChild(alarm);
        var live = {}, cur = null;
        var tmx = N ? N.Tmax : 50;
        var uc = ui.control(ctl, { id: 'ac-u', label: 'Tensión de línea U', unit: 'V', min: Math.round(P.Un * 0.6), max: Math.round(P.Un * 1.1), step: 1, value: P.Un, dec: 0, onInput: update });
        var tc = ui.control(ctl, { id: 'ac-t', label: 'Par resistente del freno T<sub>r</sub>', unit: 'N·m', min: 0, max: Math.ceil(tmx * 1.1), step: 0.1, value: Math.round(Tn * 10) / 10, dec: 1, onInput: update, help: 'T<sub>n</sub> ≈ ' + fmt(Tn, 1) + ' N·m · T<sub>máx</sub> ≈ ' + fmt(tmx, 1) + ' N·m' });
        var rx = null;
        if (wound) rx = ui.control(ctl, { id: 'ac-rx', label: 'Reóstato rotórico R′<sub>x</sub> (referido)', unit: 'Ω', min: 0, max: 15, step: 0.1, value: 0, dec: 1, onInput: update });
        ctl.insertAdjacentHTML('beforeend', '<div class="btn-row"><button type="button" class="btn btn-ghost" data-go="0">Vacío</button><button type="button" class="btn btn-ghost" data-go="n">Par nominal</button></div>');
        ctl.querySelector('[data-go="0"]').addEventListener('click', function () { tc.set(0); });
        ctl.querySelector('[data-go="n"]').addEventListener('click', function () { tc.set(Math.round(Tn * 10) / 10); });

        var row2 = ui.h('<div class="grid-2"></div>'); root.appendChild(row2);
        var c1 = ui.chart(ui.card(row2, 'Característica mecánica T(n)'));
        var flowBody = ui.card(row2, 'Balance de potencias');
        var flow = ui.h('<div class="flow"></div>'); flowBody.appendChild(flow);
        var c2 = ui.chart(ui.card(root, 'Curvas de funcionamiento frente a la potencia útil'), 'chart-wide');

        var tbl = ui.table(root, {
            key: 'async.carga', title: 'Medidas del ensayo en carga',
            columns: [{ key: 'U', label: 'U', unit: 'V', dec: 1 }, { key: 'I', label: 'I', unit: 'A', dec: 2 }, { key: 'P1', label: 'P<sub>1</sub>', unit: 'W', dec: 0 },
                { key: 'n', label: 'n', unit: 'rpm', dec: 0 }, { key: 'T', label: 'T', unit: 'N·m', dec: 2 }, { key: 'Rx', label: 'R′<sub>x</sub>', unit: 'Ω', dec: 1 }],
            getRow: function () { return live.stalled ? null : Object.assign({}, live, { Rx: rx ? rx.get() : 0 }); },
            onChange: function () { drawCharts(); }
        });

        function curves() {
            var U = uc.get(), Rx = rx ? rx.get() : 0;
            var T = [], Tu = [];
            for (var i = 0; i <= 300; i++) {
                var s = Math.max(1 - i / 300, 1e-4);
                var r = solve(P, s, U, Rx);
                T.push([r.n, r.Tem]); Tu.push([r.n, r.Tem - lossTorque(P, r.w)]);
            }
            return { T: T, Tu: Tu };
        }
        function perfCurves() {
            var U = uc.get(), Rx = rx ? rx.get() : 0, out = { eta: [], cos: [], I: [], n: [] };
            for (var t = 0; t <= tmx * 0.95; t += tmx / 80) {
                var st = steady(P, U, Rx, function () { return t; });
                if (st.stalled) break;
                var x = st.r.Pu / P.Pn * 100;
                if (x > 130) break;
                if (x < 0) continue;
                out.eta.push([x, st.r.eta]); out.cos.push([x, st.r.cos * 100]); out.I.push([x, st.r.I / In_ * 100]);
                out.n.push([x, st.r.n / n1(P) * 100]);
            }
            return out;
        }
        function drawCharts() {
            var cv = curves(), rows = tbl.rows();
            VEM.plot(c1, {
                xLabel: 'n (rpm)', yLabel: 'T (N·m)', x: [0, n1(P)], y: [0, null],
                lines: [{ data: cv.T, color: VEM.col(1), label: 'Par electromagnético' },
                    { data: [[0, tc.get()], [n1(P), tc.get()]], color: VEM.col(5), dash: [6, 4], width: 1.5, label: 'Par del freno' }],
                points: [{ data: rows.map(function (r) { return [r.n, r.T]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: cur ? { x: cur.n, y: cur.Tu, color: VEM.col(2), label: 'Punto de funcionamiento' } : null
            });
            var pc = perfCurves();
            VEM.plot(c2, {
                xLabel: 'Potencia útil Pu (% de Pn)', yLabel: '%', x: [0, 130], y: [0, 140],
                lines: [{ data: pc.eta, color: VEM.col(1), label: 'η (%)' }, { data: pc.cos, color: VEM.col(4), label: 'cos φ (×100)' },
                    { data: pc.I, color: VEM.col(5), label: 'I / In (%)' }],
                points: [{ data: rows.map(function (r) { var pu = r.T * r.n * Math.PI / 30; return [pu / P.Pn * 100, pu / r.P1 * 100]; }).filter(function (p) { return p[0] > 0 && isFinite(p[1]); }), color: VEM.col(3), label: 'η de tus medidas' }],
                marker: cur && cur.Pu > 0 ? { x: cur.Pu / P.Pn * 100, y: cur.eta, color: VEM.col(2), label: 'Actual' } : null
            });
        }
        function drawFlow() {
            if (!cur) return;
            var r = cur, max = Math.max(r.P1, 1);
            function bar(lbl, v, cls) {
                return '<div class="flow-row ' + (cls || '') + '"><span class="flow-l">' + lbl + '</span><span class="flow-bar"><i style="width:' +
                    Math.max(0.5, Math.max(0, v) / max * 100).toFixed(2) + '%"></i></span><span class="flow-v">' + fmt(v, 0) + ' W</span></div>';
            }
            flow.innerHTML = bar('Absorbida P<sub>1</sub>', r.P1, 'in') +
                bar('− Cobre estátor P<sub>Cu1</sub>', r.Pcu1, 'loss') +
                bar('− Hierro P<sub>Fe</sub>', r.Pfe, 'loss') +
                bar('= Entrehierro P<sub>a</sub>', r.Pa, 'mid') +
                bar('− Cobre rotor P<sub>Cu2</sub> = s·P<sub>a</sub>' + (r.Prx > 0.5 ? ' (incl. reóstato)' : ''), r.Pcu2 + r.Prx, 'loss') +
                bar('= Mecánica interna P<sub>mi</sub>', r.Pmi, 'mid') +
                bar('− Mecánicas P<sub>m</sub>', r.Pmec, 'loss') +
                bar('= Útil P<sub>u</sub>', r.Pu, 'out') +
                '<p class="flow-note">s = ' + fmt(r.s * 100, 2) + ' %: de cada 100 W que cruzan el entrehierro, ' + fmt(r.s * 100, 1) + ' W se disipan en el rotor.</p>';
        }
        function update() {
            var Tr = tc.get(), Rx = rx ? rx.get() : 0;
            var st = steady(P, uc.get(), Rx, function () { return Tr; });
            var r = st.r; cur = r;
            alarm.hidden = !st.stalled;
            alarm.innerHTML = '⚠ El par resistente supera el par máximo disponible: el motor se para y absorbe la corriente de arranque (' + fmt(r.I, 1) + ' A). Reduce el par del freno.';
            if (st.stalled) {
                live = { U: m(r.U, 0.1), I: m(r.I, 0.01), P1: m(r.P1, 1), n: 0, T: m(r.Tem, 0.01), stalled: true };
                live.Pu = 0; live.eta = 0; live.cos = live.P1 / (SQ3 * live.U * live.I); live.s = 100;
            } else {
                live = { U: m(r.U, 0.1), I: m(r.I, 0.01), P1: m(r.P1, 1), n: m(r.n, 0.5), T: Math.max(0, m(Tr, 0.01)) };
                live.Pu = live.T * live.n * Math.PI / 30;
                live.eta = live.P1 > 0 ? live.Pu / live.P1 * 100 : 0;
                live.cos = live.P1 / (SQ3 * live.U * live.I);
                live.s = (n1(P) - live.n) / n1(P) * 100;
            }
            meters.update(live);
            drawCharts(); drawFlow();
        }
        update();
    }

    /* ---------- 4. Arranque ---------- */
    function simulate(P, cfg) {
        var ws = w1(P), N = nominal(P), Tn = N ? N.Tn : 10;
        var dt = 2e-4, t = 0, w = 0, out = [], quiet = 0;
        var stages = cfg.method === 'rotor' ? 3 : (cfg.method === 'directo' ? 0 : 1);
        var tSwitch = stages * cfg.tc;
        var tEnd = tSwitch + 6;
        var TL0 = cfg.loadPct / 100 * Tn;
        function TL(w) {
            if (cfg.load === 'none') return 0;
            if (cfg.load === 'const') return w > 1e-3 ? TL0 : Math.min(TL0, 1e9);
            return TL0 * Math.pow(w / ws, 2);
        }
        var stepsPerSample = 25, k = 0;
        while (t <= tEnd) {
            var kv = 1, ki = 1, Rx = 0;
            if (cfg.method === 'yd' && t < cfg.tc) { kv = 1 / SQ3; ki = 1 / SQ3; }
            else if (cfg.method === 'auto' && t < cfg.tc) { kv = cfg.k; ki = cfg.k; }
            else if (cfg.method === 'soft' && t < cfg.tc) { kv = cfg.k + (1 - cfg.k) * t / cfg.tc; }
            else if (cfg.method === 'rotor') { var st = Math.floor(t / cfg.tc); Rx = cfg.Rx * ([1, 0.45, 0.15][st] || 0); }
            var s = 1 - w / ws;
            var r = solve(P, s, P.Un * kv, Rx);
            var Tl = TL(w), Tloss = lossTorque(P, w);
            var Tnet = r.Tem - Tl - Tloss;
            if (w <= 0 && Tnet < 0) Tnet = 0;          /* parado: la carga no hace girar al revés */
            if (k % stepsPerSample === 0) out.push({ t: t, n: w * 30 / Math.PI, I: r.I * ki, T: r.Tem, TL: Tl, kv: kv, Rx: Rx });
            w = Math.max(0, w + Tnet / P.J * dt);
            t += dt; k++;
            if (t > tSwitch + 0.3) {
                quiet = Math.abs(Tnet) < 0.002 * Tn ? quiet + dt : 0;
                if (quiet > 0.25) break;
            }
        }
        var last = out[out.length - 1];
        var nf = last.n, Ipk = 0, tArr = NaN;
        out.forEach(function (p) { if (p.I > Ipk) Ipk = p.I; });
        if (nf > 0.5 * n1(P)) { for (var i = 0; i < out.length; i++) if (out[i].n >= 0.98 * nf) { tArr = out[i].t; break; } }
        return { data: out, Ipk: Ipk, T0: out[0].T, tArr: tArr, nf: nf, If: last.I, started: nf > 0.5 * n1(P) };
    }

    var METHODS = { directo: 'Directo', yd: 'Estrella–triángulo', auto: 'Autotransformador', soft: 'Arrancador suave', rotor: 'Resist. rotóricas' };

    function renderArranque(root, P) {
        var N = nominal(P), In_ = In(P), wound = P.rotor === 'bobinado';
        ui.guide(root, {
            goal: 'Comparar los métodos de arranque: corriente absorbida de la red, par de arranque y tiempo hasta alcanzar la velocidad de régimen.',
            steps: [
                'Elige un método y el tipo de carga acoplada. Pulsa <strong>Arrancar</strong>.',
                'Observa el pico de corriente y el tiempo de arranque. Cada arranque se añade a la tabla comparativa.',
                'Repite con otros métodos y la misma carga. ¿Cuáles reducen la corriente? ¿A costa de qué?',
                'Prueba el estrella–triángulo con carga de par constante elevada: ¿consigue arrancar en estrella?',
                wound ? 'Con resistencias rotóricas, busca el valor de R′<sub>x</sub> que da el par máximo en el arranque.' : 'El arranque por resistencias rotóricas requiere rotor bobinado (cámbialo en «Máquina» para probarlo).'
            ],
            safety: 'El estrella–triángulo exige que el motor funcione en triángulo a la tensión de red (aquí se modela con su estrella equivalente). Se desprecian los transitorios electromagnéticos de conexión: la simulación es cuasiestática.'
        });
        var grid = ui.h('<div class="grid-lab"></div>'); root.appendChild(grid);
        var ctl = ui.card(grid, 'Configuración del arranque', 'controls');
        var ins = ui.card(grid, 'Resultado', 'instruments');
        var meters = ui.meters(ins, [
            { key: 'Ipk', sym: 'A', label: 'Pico de corriente de línea', unit: 'A', dec: 1 },
            { key: 'Irel', sym: '÷', label: 'Pico / corriente nominal', unit: '', dec: 2, kind: 'calc' },
            { key: 'T0', sym: 'T', label: 'Par de arranque (n = 0)', unit: 'N·m', dec: 1 },
            { key: 'tArr', sym: 't', label: 'Tiempo de arranque (98 % n)', unit: 's', dec: 2 },
            { key: 'nf', sym: 'n', label: 'Velocidad final', unit: 'rpm', dec: 0 },
            { key: 'If', sym: 'A', label: 'Corriente final', unit: 'A', dec: 2 }
        ]);
        var alarm = ui.h('<div class="alarm" hidden></div>'); ins.appendChild(alarm);

        var method = ui.segmented(ctl, {
            label: 'Método', value: 'directo',
            options: Object.keys(METHODS).map(function (k) { return { v: k, t: METHODS[k] }; }),
            onChange: syncControls
        });
        if (!wound) method.disableOption('rotor', true);
        var kc = ui.control(ctl, { id: 'aa-k', label: 'Relación del autotransformador k', unit: '', min: 0.4, max: 0.95, step: 0.01, value: 0.65, dec: 2 });
        var rxc = ui.control(ctl, { id: 'aa-rx', label: 'Resistencia de arranque R′<sub>x</sub> (3 escalones)', unit: 'Ω', min: 0, max: 20, step: 0.1, value: 6, dec: 1 });
        var tcc = ui.control(ctl, { id: 'aa-tc', label: 'Tiempo de conmutación / rampa', unit: 's', min: 0.1, max: 4, step: 0.05, value: 0.6, dec: 2 });
        var load = ui.segmented(ctl, {
            label: 'Carga acoplada', value: 'quad',
            options: [{ v: 'none', t: 'Sin carga' }, { v: 'const', t: 'Par constante' }, { v: 'quad', t: 'Ventilador (∝ n²)' }]
        });
        var lp = ui.control(ctl, { id: 'aa-lp', label: 'Par de carga en régimen', unit: '% T<sub>n</sub>', min: 0, max: 150, step: 1, value: 100, dec: 0 });
        var jc = ui.control(ctl, { id: 'aa-j', label: 'Inercia total J', unit: 'kg·m²', min: 0.01, max: 1, step: 0.01, value: P.J, dec: 2 });
        ctl.insertAdjacentHTML('beforeend', '<div class="btn-row"><button type="button" class="btn btn-primary btn-lg" data-run>▶ Arrancar</button></div>');

        function syncControls() {
            var mt = method.get();
            kc.el.hidden = !(mt === 'auto' || mt === 'soft');
            kc.el.querySelector('label').innerHTML = mt === 'soft' ? 'Tensión inicial de la rampa (en p.u.)' : 'Relación del autotransformador k';
            rxc.el.hidden = mt !== 'rotor';
            tcc.el.hidden = mt === 'directo';
            tcc.el.querySelector('label').innerHTML = mt === 'soft' ? 'Duración de la rampa' : (mt === 'rotor' ? 'Tiempo por escalón' : 'Tiempo de conmutación');
        }
        syncControls();

        var charts = ui.h('<div class="grid-2"></div>'); root.appendChild(charts);
        var cN = ui.chart(ui.card(charts, 'Velocidad n(t)'));
        var cI = ui.chart(ui.card(charts, 'Corriente de línea I(t)'));
        var cT = ui.chart(ui.card(root, 'Trayectoria en el plano par–velocidad'), 'chart-wide');

        var hist = VEM.store.get('async.arranques', []);
        var cmpBody = ui.card(root, 'Comparación de arranques', '',
            '<div class="btn-row"><button type="button" class="btn btn-ghost" data-csv>⤓ CSV</button><button type="button" class="btn btn-ghost" data-clr>Borrar</button></div>');
        var cmp = ui.h('<div class="table-wrap"></div>'); cmpBody.appendChild(cmp);
        function renderHist() {
            if (!hist.length) { cmp.innerHTML = '<p class="table-empty">Aún no has hecho ningún arranque.</p>'; return; }
            cmp.innerHTML = '<table class="data"><thead><tr><th>#</th><th>Método</th><th>Carga</th><th>I<sub>pico</sub> (A)</th><th>I<sub>pico</sub>/I<sub>n</sub></th><th>T<sub>arr</sub> (N·m)</th><th>t<sub>arr</sub> (s)</th></tr></thead><tbody>' +
                hist.map(function (h, i) {
                    return '<tr><td>' + (i + 1) + '</td><td class="txt">' + h.m + '</td><td class="txt">' + h.l + '</td><td>' + fmt(h.Ipk, 1) + '</td><td>' + fmt(h.Irel, 2) + '</td><td>' + fmt(h.T0, 1) + '</td><td>' + (isFinite(h.t) ? fmt(h.t, 2) : 'no arranca') + '</td></tr>';
                }).join('') + '</tbody></table>';
        }
        cmpBody.parentNode.querySelector('[data-csv]').addEventListener('click', function () {
            if (!hist.length) return;
            VEM.downloadCSV('arranques.csv', ['Método', 'Carga', 'I pico (A)', 'I pico / In', 'T arranque (N·m)', 't arranque (s)'],
                hist.map(function (h) { return [h.m, h.l, +h.Ipk.toFixed(2), +h.Irel.toFixed(3), +h.T0.toFixed(2), isFinite(h.t) ? +h.t.toFixed(3) : 'no arranca']; }));
        });
        cmpBody.parentNode.querySelector('[data-clr]').addEventListener('click', function () { hist = []; VEM.store.set('async.arranques', hist); renderHist(); });
        renderHist();

        function run() {
            var Pj = Object.assign({}, P, { J: jc.get() });
            var cfg = { method: method.get(), k: kc.get(), Rx: rxc.get(), tc: tcc.get(), load: load.get(), loadPct: lp.get() };
            var R = simulate(Pj, cfg);
            meters.update({ Ipk: R.Ipk, Irel: R.Ipk / In_, T0: R.T0, tArr: isFinite(R.tArr) ? R.tArr : 'no arranca', nf: R.nf, If: R.If });
            alarm.hidden = R.started;
            alarm.innerHTML = '⚠ El motor no consigue arrancar: el par de arranque es menor que el par resistente. Reduce la carga o usa otro método.';
            var d = R.data;
            VEM.plot(cN, {
                xLabel: 't (s)', yLabel: 'n (rpm)', y: [0, n1(P) * 1.05],
                lines: [{ data: d.map(function (p) { return [p.t, p.n]; }), color: VEM.col(1), label: METHODS[cfg.method] }],
                vlines: cfg.method !== 'directo' ? [{ x: cfg.tc, label: cfg.method === 'soft' ? 'fin rampa' : 'conmutación' }] : []
            });
            VEM.plot(cI, {
                xLabel: 't (s)', yLabel: 'I (A)', y: [0, null],
                lines: [{ data: d.map(function (p) { return [p.t, p.I]; }), color: VEM.col(5), label: 'Corriente de línea' },
                    { data: [[0, In_], [d[d.length - 1].t, In_]], color: VEM.col(4), dash: [5, 4], width: 1.5, label: 'In' }]
            });
            var stat = [], stat2 = [];
            for (var i = 0; i <= 200; i++) {
                var s = Math.max(1 - i / 200, 1e-4);
                stat.push([n1(P) * (1 - s), solve(Pj, s, P.Un).Tem]);
                if (cfg.method === 'yd' || cfg.method === 'auto') stat2.push([n1(P) * (1 - s), solve(Pj, s, P.Un * (cfg.method === 'yd' ? 1 / SQ3 : cfg.k)).Tem]);
                if (cfg.method === 'rotor') stat2.push([n1(P) * (1 - s), solve(Pj, s, P.Un, cfg.Rx).Tem]);
            }
            var lines = [{ data: stat, color: VEM.col(4), dash: [5, 4], width: 1.5, label: 'T a Un (directo)' }];
            if (stat2.length) lines.push({ data: stat2, color: VEM.col(6), dash: [2, 3], width: 1.5, label: cfg.method === 'rotor' ? 'T con R′x completa' : 'T con tensión reducida' });
            lines.push({ data: d.map(function (p) { return [p.n, p.TL]; }), color: VEM.col(5), width: 1.5, label: 'Par de carga' });
            lines.push({ data: d.map(function (p) { return [p.n, p.T]; }), color: VEM.col(1), width: 2.5, label: 'Trayectoria del arranque' });
            VEM.plot(cT, { xLabel: 'n (rpm)', yLabel: 'T (N·m)', x: [0, n1(P)], y: [0, null], lines: lines });
            hist.push({
                m: METHODS[cfg.method] + (cfg.method === 'auto' || cfg.method === 'soft' ? ' (k=' + fmt(cfg.k, 2) + ')' : '') + (cfg.method === 'rotor' ? ' (' + fmt(cfg.Rx, 1) + ' Ω)' : ''),
                l: { none: 'Sin carga', const: 'Constante', quad: 'Ventilador' }[cfg.load] + (cfg.load !== 'none' ? ' ' + cfg.loadPct + ' %' : ''),
                Ipk: R.Ipk, Irel: R.Ipk / In_, T0: R.T0, t: R.tArr
            });
            if (hist.length > 30) hist.shift();
            VEM.store.set('async.arranques', hist);
            renderHist();
        }
        ctl.querySelector('[data-run]').addEventListener('click', run);
        run();
        hist.pop(); VEM.store.set('async.arranques', hist); renderHist();   /* el arranque inicial de muestra no cuenta */
    }

    VEM.machines = VEM.machines || [];
    VEM.machines.unshift({
        id: 'async', name: 'Máquina asíncrona', defaults: defaults, defs: defs,
        practices: [
            { id: 'maquina', name: 'Máquina' },
            { id: 'vacio', name: 'Ensayo de vacío' },
            { id: 'rotor', name: 'Rotor bloqueado' },
            { id: 'carga', name: 'Ensayo en carga' },
            { id: 'arranque', name: 'Arranque' }
        ].map(function (p) {
            p.render = { maquina: renderMaquina, vacio: renderVacio, rotor: renderRotor, carga: renderCarga, arranque: renderArranque }[p.id];
            return p;
        }),
        tables: ['async.vacio', 'async.rotor', 'async.carga'],
        extraKeys: ['async.R1meas', 'async.arranques'],
        model: { solve: solve, steady: steady, nominal: nominal, simulate: simulate }
    });
})();
