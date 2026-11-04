/* =====================================================================
   VEMLAB · Transformador monofásico
   Modelo: circuito equivalente aproximado referido al primario
   (rama de vacío RFe ‖ Xμ en bornes del primario, Rcc + jXcc en serie).
   Se incluye una saturación suave de Xμ para que la curva de vacío
   tenga la forma real (I0 crece rápidamente por encima de V1n).
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, Cx = VEM.Cx, C = Cx.C, ui = VEM.ui, fmt = VEM.fmt;

    var defaults = { Sn: 5000, V1n: 400, V2n: 230, f: 50, Rfe: 3200, Xmu: 826, Rcc: 0.64, Xcc: 1.29 };
    var defs = [
        { k: 'Sn', label: 'Potencia nominal S<sub>n</sub>', unit: 'VA', plate: true, min: 100 },
        { k: 'V1n', label: 'Tensión primaria V<sub>1n</sub>', unit: 'V', plate: true, min: 10 },
        { k: 'V2n', label: 'Tensión secundaria V<sub>2n</sub>', unit: 'V', plate: true, min: 10 },
        { k: 'f', label: 'Frecuencia f', unit: 'Hz', plate: true, min: 1 },
        { k: 'Rfe', label: 'R<sub>Fe</sub> (pérdidas en el hierro)', unit: 'Ω', vary: 0.25, min: 1 },
        { k: 'Xmu', label: 'X<sub>μ</sub> (magnetizante, a V<sub>1n</sub>)', unit: 'Ω', vary: 0.25, min: 1 },
        { k: 'Rcc', label: 'R<sub>cc</sub> (referida al primario)', unit: 'Ω', vary: 0.25, min: 0.001 },
        { k: 'Xcc', label: 'X<sub>cc</sub> (referida al primario)', unit: 'Ω', vary: 0.25, min: 0.001 }
    ];

    /* ---------------- Modelo ---------------- */
    var SAT_A = 0.15, SAT_B = 10;
    function satFactor(u) { return (1 + SAT_A * Math.pow(Math.max(u, 0), SAT_B)) / (1 + SAT_A); }

    function base(P) {
        return { m: P.V1n / P.V2n, I1n: P.Sn / P.V1n, I2n: P.Sn / P.V2n, Zcc: C(P.Rcc, P.Xcc) };
    }
    /* corriente de la rama de vacío para una tensión V (fasor) */
    function shunt(P, Vph) {
        var V = Cx.abs(Vph);
        var G = 1 / P.Rfe, B = satFactor(V / P.V1n) / P.Xmu;
        return Cx.mul(Vph, C(G, -B));
    }

    function vacio(P, V1) {
        var b = base(P);
        var I0 = shunt(P, C(V1));
        var P0 = V1 * I0.re;
        var i0 = Cx.abs(I0);
        return { V1: V1, I0: i0, P0: P0, V20: V1 / b.m, cos0: i0 > 0 ? P0 / (V1 * i0) : 0, Ife: I0.re, Imu: -I0.im };
    }

    function cc(P, V1) {
        var b = base(P);
        var Ib = Cx.div(C(V1), b.Zcc);
        var I1 = Cx.add(Ib, shunt(P, C(V1)));
        var i1 = Cx.abs(I1);
        return { V1: V1, I1: i1, P: V1 * I1.re, I2: Cx.abs(Ib) * b.m, cos: i1 > 0 ? I1.re / i1 : 0 };
    }

    /* tipo: 'res' | 'ind' | 'cap'; Cidx = I2/I2n */
    function carga(P, V1, Cidx, cosphi, tipo) {
        var b = base(P);
        var c = tipo === 'res' ? 1 : cosphi;
        var s = tipo === 'res' ? 0 : Math.sqrt(Math.max(0, 1 - c * c)) * (tipo === 'cap' ? -1 : 1);
        var I = Cidx * b.I1n;
        var a = I * (P.Rcc * c + P.Xcc * s);
        var bb = I * (P.Xcc * c - P.Rcc * s);
        var disc = V1 * V1 - bb * bb;
        if (disc < 0) return null;
        var V2p = -a + Math.sqrt(disc);
        var I2p = C(I * c, -I * s);                 /* referida a V'2 en el eje real */
        var V1ph = Cx.add(C(V2p), Cx.mul(I2p, b.Zcc));
        var I1 = Cx.add(I2p, shunt(P, V1ph));
        var S1 = Cx.mul(V1ph, Cx.conj(I1));
        var P2 = V2p * I * c;
        var V20 = V1 / b.m;
        return {
            V1: V1, I1: Cx.abs(I1), P1: S1.re, Q1: S1.im, cos1: S1.re / Math.max(1e-9, Cx.abs(S1)),
            V2: V2p / b.m, I2: I * b.m, P2: P2, eta: S1.re > 0 ? P2 / S1.re * 100 : 0,
            eps: (V20 - V2p / b.m) / V20 * 100,
            Pcu: I * I * P.Rcc, Pfe: Cx.abs(V1ph) * Cx.abs(V1ph) / P.Rfe,
            C: Cidx, c: c, s: s, V2p: V2p, I2p: I2p, V1ph: V1ph, I1ph: I1
        };
    }

    /* Valores de referencia de los ensayos (sin ruido) */
    function refTests(P) {
        var b = base(P);
        var v = vacio(P, P.V1n);
        var k = b.I1n / cc(P, 1).I1;          /* tensión de cortocircuito para I1n */
        var c1 = cc(P, k);
        return { vacio: v, cc: c1, Vcc: k };
    }

    function plateData(P) {
        var b = base(P), r = refTests(P);
        return [
            ['Potencia aparente', fmt(P.Sn / 1000, 2) + ' kVA'],
            ['Tensiones', fmt(P.V1n, 0) + ' / ' + fmt(P.V2n, 0) + ' V'],
            ['Frecuencia', fmt(P.f, 0) + ' Hz'],
            ['Corrientes nominales', fmt(b.I1n, 2) + ' / ' + fmt(b.I2n, 2) + ' A'],
            ['Relación de transformación m', fmt(b.m, 3)],
            ['Tensión de cortocircuito ε<sub>cc</sub>', fmt(r.Vcc / P.V1n * 100, 2) + ' %', true],
            ['Corriente de vacío i<sub>0</sub>', fmt(r.vacio.I0 / b.I1n * 100, 2) + ' %', true]
        ];
    }

    /* ---------------- Utilidades de las prácticas ---------------- */
    function rowsOf(key) { return VEM.store.get('table.' + key, []); }
    function nearest(rows, field, target) {
        var best = null;
        rows.forEach(function (r) { if (!best || Math.abs(r[field] - target) < Math.abs(best[field] - target)) best = r; });
        return best;
    }
    function m(v, res) { return VEM.measure(v, res); }

    /* Resultados del ensayo de vacío (desde medidas del alumno o lectura actual) */
    function vacioResults(P, row) {
        var cos0 = row.P0 / (row.V1 * row.I0);
        var sin0 = Math.sqrt(Math.max(0, 1 - cos0 * cos0));
        return {
            m: row.V1 / row.V20, cos0: cos0, Ife: row.I0 * cos0, Imu: row.I0 * sin0,
            Rfe: row.V1 / (row.I0 * cos0), Xmu: row.V1 / (row.I0 * sin0),
            P0: row.P0, i0: row.I0 / base(P).I1n * 100
        };
    }
    function ccResults(P, row) {
        var In = base(P).I1n, k = In / row.I1;
        var Vcc = row.V1 * k, Pcc = row.P * k * k;
        var Zcc = Vcc / In, Rcc = Pcc / (In * In), Xcc = Math.sqrt(Math.max(0, Zcc * Zcc - Rcc * Rcc));
        return {
            Vcc: Vcc, Pcc: Pcc, Zcc: Zcc, Rcc: Rcc, Xcc: Xcc, cos: Rcc / Zcc,
            ecc: Vcc / P.V1n * 100, eR: Rcc * In / P.V1n * 100, eX: Xcc * In / P.V1n * 100, scaled: Math.abs(k - 1) > 0.01
        };
    }

    /* =====================================================================
       Prácticas
       ===================================================================== */

    /* ---------- 0. Máquina: placa, parámetros y circuito ---------- */
    function renderMaquina(root, P) {
        var grid = ui.h('<div class="grid-2"></div>'); root.appendChild(grid);
        var left = ui.h('<div class="stack"></div>'), right = ui.h('<div class="stack"></div>');
        grid.appendChild(left); grid.appendChild(right);
        VEM.app.plateCard(left, 'Placa de características', plateData(P),
            'Transformador monofásico. Los valores marcados con * se obtienen de los ensayos.');
        VEM.app.paramsCard(left, 'trafo', defs, P);
        var eq = ui.card(right, 'Circuito equivalente aproximado');
        eq.innerHTML = VEM.sch.trafoEquiv() +
            '<p class="card-intro">La rama de vacío (R<sub>Fe</sub> ‖ X<sub>μ</sub>) se obtiene del <strong>ensayo de vacío</strong> y la impedancia serie ' +
            '(R<sub>cc</sub> + jX<sub>cc</sub>) del <strong>ensayo de cortocircuito</strong>. Con ellos se predice el comportamiento ' +
            'en carga: caída de tensión y rendimiento.</p>';
        var how = ui.card(right, 'Cómo usar este simulador junto al laboratorio');
        how.innerHTML = '<ol class="plain-steps">' +
            '<li><strong>Antes de la sesión:</strong> sigue el guion de cada ensayo aquí para saber qué vas a medir y qué valores esperar.</li>' +
            '<li><strong>En el laboratorio:</strong> monta el esquema, toma tus medidas reales y anótalas.</li>' +
            '<li><strong>Después:</strong> compara tus medidas con las del simulador, exporta las tablas a CSV y comprueba tus cálculos con la tarjeta de resultados.</li>' +
            '</ol><p class="card-intro">Si tu profesor te ha dado un <strong>código de práctica</strong> (botón ⚙ arriba), tendrás una máquina con parámetros ocultos que deberás identificar con los ensayos.</p>';
    }

    /* ---------- 1. Ensayo de vacío ---------- */
    function renderVacio(root, P) {
        var b = base(P);
        ui.guide(root, {
            goal: 'Determinar las pérdidas en el hierro P<sub>Fe</sub>, la corriente de vacío I<sub>0</sub>, la relación de transformación m y los parámetros de la rama paralelo R<sub>Fe</sub> y X<sub>μ</sub>.',
            circuit: VEM.sch.trafoSetup('vacio'),
            steps: [
                'Deja el secundario <strong>abierto</strong> (sólo con un voltímetro).',
                'Alimenta el primario desde el autotransformador partiendo de 0 V.',
                'Sube la tensión por escalones hasta aproximadamente 1,1·V<sub>1n</sub> y registra V<sub>1</sub>, I<sub>0</sub>, P<sub>0</sub> y V<sub>20</sub> en cada uno.',
                'Observa cómo I<sub>0</sub> crece mucho más deprisa al pasar de la tensión nominal: es la <strong>saturación</strong> del núcleo.',
                'Con la lectura a V<sub>1n</sub> calcula cos φ<sub>0</sub>, I<sub>Fe</sub>, I<sub>μ</sub>, R<sub>Fe</sub> y X<sub>μ</sub>.'
            ],
            safety: 'El secundario abierto tiene tensión. Usa el amperímetro en la escala baja: I<sub>0</sub> es sólo un pequeño porcentaje de I<sub>1n</sub>. Las pérdidas en el cobre en vacío son despreciables, por eso P<sub>0</sub> ≈ P<sub>Fe</sub>.'
        });
        var grid = ui.h('<div class="grid-lab"></div>'); root.appendChild(grid);
        var ctl = ui.card(grid, 'Mando', 'controls');
        var ins = ui.card(grid, 'Instrumentos', 'instruments');
        var meters = ui.meters(ins, [
            { key: 'V1', sym: 'V', label: 'Tensión primario V<sub>1</sub>', unit: 'V', dec: 1 },
            { key: 'I0', sym: 'A', label: 'Corriente de vacío I<sub>0</sub>', unit: 'A', dec: 3 },
            { key: 'P0', sym: 'W', label: 'Potencia de vacío P<sub>0</sub>', unit: 'W', dec: 1 },
            { key: 'V20', sym: 'V', label: 'Tensión secundario V<sub>20</sub>', unit: 'V', dec: 1 }
        ]);
        var live = {};
        var v1 = ui.control(ctl, {
            id: 'tv-v1', label: 'Tensión aplicada V<sub>1</sub>', unit: 'V', min: 0, max: Math.round(P.V1n * 1.15), step: 1,
            value: P.V1n, dec: 0, onInput: update,
            help: 'Nominal: ' + fmt(P.V1n, 0) + ' V'
        });
        ctl.insertAdjacentHTML('beforeend', '<div class="btn-row"><button type="button" class="btn btn-ghost" data-go="nom">Ir a V<sub>1n</sub></button></div>');
        ctl.querySelector('[data-go]').addEventListener('click', function () { v1.set(P.V1n); });

        var charts = ui.h('<div class="grid-2"></div>'); root.appendChild(charts);
        var c1 = ui.chart(ui.card(charts, 'Curva de vacío I<sub>0</sub>(V<sub>1</sub>)'));
        var c2 = ui.chart(ui.card(charts, 'Pérdidas en vacío P<sub>0</sub>(V<sub>1</sub>)'));
        var tbl = ui.table(root, {
            key: 'trafo.vacio', title: 'Medidas del ensayo de vacío',
            columns: [{ key: 'V1', label: 'V<sub>1</sub>', unit: 'V', dec: 1 }, { key: 'I0', label: 'I<sub>0</sub>', unit: 'A', dec: 3 },
                { key: 'P0', label: 'P<sub>0</sub>', unit: 'W', dec: 1 }, { key: 'V20', label: 'V<sub>20</sub>', unit: 'V', dec: 1 }],
            getRow: function () { return Object.assign({}, live); },
            onChange: function () { drawCharts(); showResults(); }
        });
        var res = ui.results(root, 'Resultados del ensayo (a tensión nominal)',
            'Se calculan con tu medida registrada más próxima a V<sub>1n</sub> (o con la lectura actual si no hay medidas). Úsalo para comprobar tus cálculos a mano.');

        var curveI = [], curveP = [];
        for (var v = 0; v <= P.V1n * 1.15; v += P.V1n / 100) {
            var r = vacio(P, v); curveI.push([v, r.I0]); curveP.push([v, r.P0]);
        }
        function drawCharts() {
            var rows = tbl.rows();
            VEM.plot(c1, {
                xLabel: 'V₁ (V)', yLabel: 'I₀ (A)', x: [0, P.V1n * 1.15],
                lines: [{ data: curveI, color: VEM.col(1), label: 'Simulador', width: 2 }],
                points: [{ data: rows.map(function (r) { return [r.V1, r.I0]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: { x: live.V1, y: live.I0, color: VEM.col(2), label: 'Lectura actual' },
                vlines: [{ x: P.V1n, label: 'V₁ₙ' }]
            });
            VEM.plot(c2, {
                xLabel: 'V₁ (V)', yLabel: 'P₀ (W)', x: [0, P.V1n * 1.15],
                lines: [{ data: curveP, color: VEM.col(1), label: 'Simulador (∝ V₁²)', width: 2 }],
                points: [{ data: rows.map(function (r) { return [r.V1, r.P0]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: { x: live.V1, y: live.P0, color: VEM.col(2), label: 'Lectura actual' },
                vlines: [{ x: P.V1n, label: 'V₁ₙ' }]
            });
        }
        function showResults() {
            var rows = tbl.rows();
            var row = rows.length ? nearest(rows, 'V1', P.V1n) : live;
            if (!row || row.V1 < 1 || row.I0 <= 0) { res.update([], 'Aplica tensión para obtener resultados.'); return; }
            var R = vacioResults(P, row);
            var note = (rows.length ? 'Usando la medida registrada con V<sub>1</sub> = ' : 'Usando la lectura actual, V<sub>1</sub> = ') + fmt(row.V1, 1) + ' V.';
            if (Math.abs(row.V1 - P.V1n) / P.V1n > 0.03) note += ' <span class="warn-text">⚠ Lejos de la tensión nominal: los resultados no representan el punto nominal.</span>';
            res.update([
                { label: 'Relación de transformación m', value: R.m, dec: 3, formula: 'm = V<sub>1</sub> / V<sub>20</sub>' },
                { label: 'Pérdidas en el hierro P<sub>Fe</sub>', value: R.P0, unit: 'W', dec: 1, formula: 'P<sub>Fe</sub> ≈ P<sub>0</sub>' },
                { label: 'Factor de potencia cos φ<sub>0</sub>', value: R.cos0, dec: 4, formula: 'cos φ<sub>0</sub> = P<sub>0</sub> / (V<sub>1</sub>·I<sub>0</sub>)' },
                { label: 'Corriente de pérdidas I<sub>Fe</sub>', value: R.Ife, unit: 'A', dec: 4, formula: 'I<sub>Fe</sub> = I<sub>0</sub>·cos φ<sub>0</sub>' },
                { label: 'Corriente magnetizante I<sub>μ</sub>', value: R.Imu, unit: 'A', dec: 4, formula: 'I<sub>μ</sub> = I<sub>0</sub>·sen φ<sub>0</sub>' },
                { label: 'R<sub>Fe</sub>', value: R.Rfe, unit: 'Ω', dec: 0, formula: 'R<sub>Fe</sub> = V<sub>1</sub> / I<sub>Fe</sub>' },
                { label: 'X<sub>μ</sub>', value: R.Xmu, unit: 'Ω', dec: 0, formula: 'X<sub>μ</sub> = V<sub>1</sub> / I<sub>μ</sub>' },
                { label: 'Corriente de vacío i<sub>0</sub>', value: R.i0, unit: '% de I<sub>1n</sub>', dec: 2, formula: 'i<sub>0</sub> = I<sub>0</sub> / I<sub>1n</sub> · 100' }
            ], note);
        }
        function update() {
            var r = vacio(P, v1.get());
            live = { V1: m(r.V1, 0.1), I0: Math.max(0, m(r.I0, 0.0005)), P0: Math.max(0, m(r.P0, 0.1)), V20: m(r.V20, 0.1) };
            meters.update(live);
            drawCharts(); showResults();
        }
        update();
    }

    /* ---------- 2. Ensayo de cortocircuito ---------- */
    function renderCC(root, P) {
        var b = base(P), ref = refTests(P);
        ui.guide(root, {
            goal: 'Determinar las pérdidas en el cobre a corriente nominal P<sub>cc</sub>, la tensión de cortocircuito ε<sub>cc</sub> y los parámetros serie R<sub>cc</sub> y X<sub>cc</sub>.',
            circuit: VEM.sch.trafoSetup('cc'),
            steps: [
                'Cortocircuita el secundario a través de un amperímetro.',
                '<strong>Con el autotransformador a 0 V</strong>, conecta la alimentación.',
                'Sube la tensión <strong>muy despacio</strong> vigilando el amperímetro hasta que I<sub>1</sub> = I<sub>1n</sub> = ' + fmt(b.I1n, 2) + ' A.',
                'Registra V<sub>1cc</sub>, I<sub>1</sub>, P<sub>cc</sub> e I<sub>2</sub>. Toma también algunos puntos por debajo de I<sub>1n</sub>.',
                'Calcula ε<sub>cc</sub>, cos φ<sub>cc</sub>, R<sub>cc</sub>, X<sub>cc</sub>, ε<sub>Rcc</sub> y ε<sub>Xcc</sub>.'
            ],
            safety: 'La tensión necesaria es sólo un pequeño porcentaje de V<sub>1n</sub>. Si aplicaras la tensión nominal con el secundario en cortocircuito, la corriente sería unas 100/ε<sub>cc</sub> veces la nominal. Como la tensión es tan baja, las pérdidas en el hierro son despreciables: P<sub>cc</sub> ≈ P<sub>Cu</sub>.'
        });
        var grid = ui.h('<div class="grid-lab"></div>'); root.appendChild(grid);
        var ctl = ui.card(grid, 'Mando', 'controls');
        var ins = ui.card(grid, 'Instrumentos', 'instruments');
        var meters = ui.meters(ins, [
            { key: 'V1', sym: 'V', label: 'Tensión primario V<sub>1cc</sub>', unit: 'V', dec: 2 },
            { key: 'I1', sym: 'A', label: 'Corriente primario I<sub>1</sub>', unit: 'A', dec: 2 },
            { key: 'P', sym: 'W', label: 'Potencia P<sub>cc</sub>', unit: 'W', dec: 1 },
            { key: 'I2', sym: 'A', label: 'Corriente secundario I<sub>2</sub>', unit: 'A', dec: 2 }
        ]);
        var alarm = ui.h('<div class="alarm" hidden></div>'); ins.appendChild(alarm);
        var live = {};
        var vmax = Math.max(1, Math.ceil(ref.Vcc * 1.35));
        var vc = ui.control(ctl, {
            id: 'tc-v1', label: 'Tensión aplicada V<sub>1cc</sub>', unit: 'V', min: 0, max: vmax, step: 0.1,
            value: 0, dec: 1, onInput: update,
            help: 'Rango limitado a ' + fmt(vmax, 0) + ' V (autotransformador en escala baja).'
        });
        ctl.insertAdjacentHTML('beforeend', '<div class="btn-row"><button type="button" class="btn btn-ghost" data-go="in">Ajustar a I<sub>1n</sub></button><button type="button" class="btn btn-ghost" data-go="0">A cero</button></div>');
        ctl.querySelector('[data-go="in"]').addEventListener('click', function () { vc.set(Math.round(ref.Vcc * 10) / 10); });
        ctl.querySelector('[data-go="0"]').addEventListener('click', function () { vc.set(0); });

        var charts = ui.h('<div class="grid-2"></div>'); root.appendChild(charts);
        var c1 = ui.chart(ui.card(charts, 'Corriente I<sub>1</sub>(V<sub>1cc</sub>)'));
        var c2 = ui.chart(ui.card(charts, 'Pérdidas P<sub>cc</sub>(I<sub>1</sub>)'));
        var tbl = ui.table(root, {
            key: 'trafo.cc', title: 'Medidas del ensayo de cortocircuito',
            columns: [{ key: 'V1', label: 'V<sub>1cc</sub>', unit: 'V', dec: 2 }, { key: 'I1', label: 'I<sub>1</sub>', unit: 'A', dec: 2 },
                { key: 'P', label: 'P<sub>cc</sub>', unit: 'W', dec: 1 }, { key: 'I2', label: 'I<sub>2</sub>', unit: 'A', dec: 2 }],
            getRow: function () { return Object.assign({}, live); },
            onChange: function () { drawCharts(); showResults(); }
        });
        var res = ui.results(root, 'Resultados del ensayo (a corriente nominal)',
            'Con tu medida registrada más próxima a I<sub>1n</sub>. Si no es exactamente I<sub>1n</sub>, se refiere a ella: V<sub>cc</sub> ∝ I y P<sub>cc</sub> ∝ I².');

        var curveI = [], curveP = [];
        for (var v = 0; v <= vmax; v += vmax / 60) {
            var r = cc(P, v); curveI.push([v, r.I1]); curveP.push([r.I1, r.P]);
        }
        function drawCharts() {
            var rows = tbl.rows();
            VEM.plot(c1, {
                xLabel: 'V₁cc (V)', yLabel: 'I₁ (A)', x: [0, vmax],
                lines: [{ data: curveI, color: VEM.col(1), label: 'Simulador', width: 2 }],
                points: [{ data: rows.map(function (r) { return [r.V1, r.I1]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: { x: live.V1, y: live.I1, color: VEM.col(2), label: 'Lectura actual' }
            });
            VEM.plot(c2, {
                xLabel: 'I₁ (A)', yLabel: 'Pcc (W)',
                lines: [{ data: curveP, color: VEM.col(1), label: 'Simulador (∝ I²)', width: 2 }],
                points: [{ data: rows.map(function (r) { return [r.I1, r.P]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: { x: live.I1, y: live.P, color: VEM.col(2), label: 'Lectura actual' },
                vlines: [{ x: b.I1n, label: 'I₁ₙ' }]
            });
        }
        function showResults() {
            var rows = tbl.rows();
            var row = rows.length ? nearest(rows, 'I1', b.I1n) : live;
            if (!row || row.I1 < b.I1n * 0.1) { res.update([], 'Sube la tensión hasta que circule una corriente apreciable (idealmente I<sub>1n</sub>).'); return; }
            var R = ccResults(P, row);
            var note = (rows.length ? 'Usando la medida registrada con I<sub>1</sub> = ' : 'Usando la lectura actual, I<sub>1</sub> = ') + fmt(row.I1, 2) + ' A' +
                (R.scaled ? ', referida a I<sub>1n</sub> = ' + fmt(b.I1n, 2) + ' A.' : '.');
            res.update([
                { label: 'Tensión de cortocircuito V<sub>1cc</sub>', value: R.Vcc, unit: 'V', dec: 2, formula: R.scaled ? 'V<sub>1cc</sub> = V·I<sub>1n</sub>/I' : '' },
                { label: 'Pérdidas en el cobre P<sub>cc</sub>', value: R.Pcc, unit: 'W', dec: 1, formula: R.scaled ? 'P<sub>cc</sub> = P·(I<sub>1n</sub>/I)²' : 'P<sub>Cu,n</sub> ≈ P<sub>cc</sub>' },
                { label: 'ε<sub>cc</sub>', value: R.ecc, unit: '%', dec: 2, formula: 'ε<sub>cc</sub> = V<sub>1cc</sub> / V<sub>1n</sub> · 100' },
                { label: 'cos φ<sub>cc</sub>', value: R.cos, dec: 4, formula: 'cos φ<sub>cc</sub> = P<sub>cc</sub> / (V<sub>1cc</sub>·I<sub>1n</sub>)' },
                { label: 'Z<sub>cc</sub>', value: R.Zcc, unit: 'Ω', dec: 3, formula: 'Z<sub>cc</sub> = V<sub>1cc</sub> / I<sub>1n</sub>' },
                { label: 'R<sub>cc</sub>', value: R.Rcc, unit: 'Ω', dec: 3, formula: 'R<sub>cc</sub> = P<sub>cc</sub> / I<sub>1n</sub>²' },
                { label: 'X<sub>cc</sub>', value: R.Xcc, unit: 'Ω', dec: 3, formula: 'X<sub>cc</sub> = √(Z<sub>cc</sub>² − R<sub>cc</sub>²)' },
                { label: 'ε<sub>Rcc</sub> / ε<sub>Xcc</sub>', value: NaN, unit: '', formula: fmt(R.eR, 2) + ' % / ' + fmt(R.eX, 2) + ' %  (ε<sub>Rcc</sub> = ε<sub>cc</sub>·cos φ<sub>cc</sub>)' },
                { label: 'Corriente de cortocircuito accidental', value: b.I1n * 100 / R.ecc, unit: 'A', dec: 0, formula: 'I<sub>1,falta</sub> = I<sub>1n</sub>·100 / ε<sub>cc</sub>  (a V<sub>1n</sub>)' }
            ], note);
        }
        function update() {
            var r = cc(P, vc.get());
            live = { V1: m(r.V1, 0.02), I1: Math.max(0, m(r.I1, 0.01)), P: Math.max(0, m(r.P, 0.2)), I2: Math.max(0, m(r.I2, 0.01)) };
            meters.update(live);
            var over = r.I1 > b.I1n * 1.05;
            alarm.hidden = !over;
            if (over) alarm.innerHTML = '⚠ I<sub>1</sub> supera la corriente nominal (' + fmt(r.I1 / b.I1n * 100, 0) + ' % de I<sub>1n</sub>). En el laboratorio, baja la tensión: los devanados se calientan con I².';
            drawCharts(); showResults();
        }
        update();
    }

    /* ---------- 3. Ensayo en carga ---------- */
    function renderCarga(root, P) {
        var b = base(P);
        ui.guide(root, {
            goal: 'Medir la tensión secundaria y el rendimiento en carga, y compararlos con lo que predicen los ensayos de vacío y cortocircuito (caída de tensión de Kapp y rendimiento por pérdidas).',
            circuit: VEM.sch.trafoSetup('carga'),
            steps: [
                'Alimenta el primario a la tensión nominal V<sub>1n</sub> con la carga desconectada y anota V<sub>20</sub>.',
                'Conecta la carga (resistiva, inductiva o capacitiva) y aumenta el índice de carga C = I<sub>2</sub>/I<sub>2n</sub> por escalones.',
                'En cada escalón registra V<sub>1</sub>, I<sub>1</sub>, P<sub>1</sub>, V<sub>2</sub>, I<sub>2</sub> y P<sub>2</sub>.',
                'Calcula η = P<sub>2</sub>/P<sub>1</sub> y la caída de tensión ε = (V<sub>20</sub> − V<sub>2</sub>)/V<sub>20</sub>.',
                'Compara con la predicción a partir de los ensayos (tarjeta inferior). Prueba una carga capacitiva: ¿puede V<sub>2</sub> superar a V<sub>20</sub>?'
            ],
            safety: 'No superes la corriente nominal del secundario durante más de unos minutos. Con cargas capacitivas, la tensión secundaria puede subir por encima de la de vacío (efecto Ferranti).'
        });
        var grid = ui.h('<div class="grid-lab"></div>'); root.appendChild(grid);
        var ctl = ui.card(grid, 'Mando', 'controls');
        var ins = ui.card(grid, 'Instrumentos', 'instruments');
        var meters = ui.meters(ins, [
            { key: 'V1', sym: 'V', label: 'V<sub>1</sub>', unit: 'V', dec: 1 },
            { key: 'I1', sym: 'A', label: 'I<sub>1</sub>', unit: 'A', dec: 2 },
            { key: 'P1', sym: 'W', label: 'P<sub>1</sub>', unit: 'W', dec: 0 },
            { key: 'V2', sym: 'V', label: 'V<sub>2</sub>', unit: 'V', dec: 1 },
            { key: 'I2', sym: 'A', label: 'I<sub>2</sub>', unit: 'A', dec: 2 },
            { key: 'P2', sym: 'W', label: 'P<sub>2</sub>', unit: 'W', dec: 0 },
            { key: 'eta', sym: 'η', label: 'Rendimiento P<sub>2</sub>/P<sub>1</sub>', unit: '%', dec: 2, kind: 'calc' },
            { key: 'eps', sym: 'ε', label: 'Caída de tensión', unit: '%', dec: 2, kind: 'calc' }
        ]);
        var live = {}, cur = null;
        var v1 = ui.control(ctl, { id: 'tl-v1', label: 'Tensión primaria V<sub>1</sub>', unit: 'V', min: Math.round(P.V1n * 0.8), max: Math.round(P.V1n * 1.1), step: 1, value: P.V1n, dec: 0, onInput: update });
        var tipo = ui.segmented(ctl, {
            label: 'Tipo de carga', value: 'ind',
            options: [{ v: 'res', t: 'Resistiva' }, { v: 'ind', t: 'Inductiva' }, { v: 'cap', t: 'Capacitiva' }],
            onChange: function (t) { cosc.disable(t === 'res'); update(); }
        });
        var cosc = ui.control(ctl, { id: 'tl-cos', label: 'Factor de potencia de la carga cos φ<sub>2</sub>', unit: '', min: 0.1, max: 1, step: 0.01, value: 0.8, dec: 2, onInput: update });
        var cidx = ui.control(ctl, { id: 'tl-c', label: 'Índice de carga C = I<sub>2</sub>/I<sub>2n</sub>', unit: '', min: 0, max: 1.3, step: 0.01, value: 0.75, dec: 2, onInput: update });

        var row2 = ui.h('<div class="grid-2"></div>'); root.appendChild(row2);
        var phasorBody = ui.card(row2, 'Diagrama fasorial (referido al primario)', '',
            '<div class="seg-mini" role="group" aria-label="Ampliación de las caídas"><button type="button" data-k="1">×1</button><button type="button" data-k="5" class="on">×5</button><button type="button" data-k="10">×10</button></div>');
        var phasorCv = ui.chart(phasorBody, 'chart-square');
        phasorBody.insertAdjacentHTML('beforeend', '<p class="card-intro">Triángulo de Kapp: R<sub>cc</sub>·I′<sub>2</sub> es paralelo a la corriente y X<sub>cc</sub>·I′<sub>2</sub> perpendicular. Las caídas se dibujan ampliadas para que se vean.</p>');
        var kZoom = 5;
        phasorBody.parentNode.querySelectorAll('.seg-mini button').forEach(function (btn) {
            btn.addEventListener('click', function () {
                kZoom = +btn.getAttribute('data-k');
                phasorBody.parentNode.querySelectorAll('.seg-mini button').forEach(function (x) { x.classList.toggle('on', x === btn); });
                drawPhasor();
            });
        });
        var flowBody = ui.card(row2, 'Balance de potencias');
        var flow = ui.h('<div class="flow"></div>'); flowBody.appendChild(flow);

        var charts = ui.h('<div class="grid-2"></div>'); root.appendChild(charts);
        var c1 = ui.chart(ui.card(charts, 'Rendimiento η(C)'));
        var c2 = ui.chart(ui.card(charts, 'Tensión secundaria V<sub>2</sub>(C)'));

        var tbl = ui.table(root, {
            key: 'trafo.carga', title: 'Medidas del ensayo en carga',
            columns: [{ key: 'tipo', label: 'Carga', dec: 0 }, { key: 'cos', label: 'cos φ<sub>2</sub>', dec: 2 }, { key: 'V1', label: 'V<sub>1</sub>', unit: 'V', dec: 1 },
                { key: 'I1', label: 'I<sub>1</sub>', unit: 'A', dec: 2 }, { key: 'P1', label: 'P<sub>1</sub>', unit: 'W', dec: 0 },
                { key: 'V2', label: 'V<sub>2</sub>', unit: 'V', dec: 1 }, { key: 'I2', label: 'I<sub>2</sub>', unit: 'A', dec: 2 }, { key: 'P2', label: 'P<sub>2</sub>', unit: 'W', dec: 0 }],
            getRow: function () {
                var r = Object.assign({}, live);
                r.tipo = { res: 1, ind: 2, cap: 3 }[tipo.get()];
                r.cos = tipo.get() === 'res' ? 1 : cosc.get();
                return r;
            },
            onChange: function () { drawCharts(); }
        });
        tbl.el.insertAdjacentHTML('beforeend', '<p class="card-intro">Columna «Carga»: 1 = resistiva, 2 = inductiva, 3 = capacitiva.</p>');
        var res = ui.results(root, 'Predicción a partir de los ensayos frente a la medida',
            'Usa P<sub>0</sub> del ensayo de vacío y P<sub>cc</sub>, ε<sub>Rcc</sub>, ε<sub>Xcc</sub> del de cortocircuito (de tus medidas registradas; si no hay, de los valores del simulador).');

        function testData() {
            var rv = rowsOf('trafo.vacio'), rc = rowsOf('trafo.cc');
            var ref = refTests(P);
            var vrow = rv.length ? nearest(rv, 'V1', P.V1n) : { V1: ref.vacio.V1, I0: ref.vacio.I0, P0: ref.vacio.P0, V20: ref.vacio.V20 };
            var crow = rc.length ? nearest(rc, 'I1', b.I1n) : { V1: ref.cc.V1, I1: ref.cc.I1, P: ref.cc.P, I2: ref.cc.I2 };
            return { V: vacioResults(P, vrow), K: ccResults(P, crow), own: rv.length > 0 && rc.length > 0, partial: (rv.length > 0) !== (rc.length > 0) };
        }

        function drawPhasor() {
            if (!cur) return;
            var cv = phasorCv, rect = cv.getBoundingClientRect();
            if (rect.width < 10) return;
            var dpr = window.devicePixelRatio || 1;
            cv.width = rect.width * dpr; cv.height = rect.height * dpr;
            var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            var W = rect.width, H = rect.height;
            ctx.clearRect(0, 0, W, H);
            var r = cur, k = kZoom;
            var drop = Cx.scale(Cx.mul(r.I2p, base(P).Zcc), k);
            var dR = Cx.scale(r.I2p, P.Rcc * k);
            var V1d = Cx.add(C(r.V2p), drop);
            var xs = [0, r.V2p, V1d.re], ys = [0, V1d.im, r.V2p * 0.02 + Math.abs(drop.im)];
            var Imag = Cx.abs(r.I2p), Iscale = Imag > 0 ? (r.V2p * 0.45) / (b.I1n * 1.3) : 0;
            var Iv = Cx.scale(r.I2p, Iscale);
            xs.push(Iv.re); ys.push(Iv.im);
            var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
            var minY = Math.min.apply(null, ys.concat([-r.V2p * 0.1])), maxY = Math.max.apply(null, ys.concat([r.V2p * 0.1]));
            var pad = 40;
            var sc = Math.min((W - 2 * pad) / (maxX - minX || 1), (H - 2 * pad) / (maxY - minY || 1));
            var ox = pad - minX * sc + ((W - 2 * pad) - (maxX - minX) * sc) / 2;
            var oy = H - pad + minY * sc - ((H - 2 * pad) - (maxY - minY) * sc) / 2;
            function P2(z) { return [ox + z.re * sc, oy - z.im * sc]; }
            function arrow(a, z, color, lbl, dash, lw) {
                var p0 = P2(a), p1 = P2(z);
                ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw || 2.5; ctx.setLineDash(dash || []);
                ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); ctx.setLineDash([]);
                var ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
                if (L > 6) {
                    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]);
                    ctx.lineTo(p1[0] - 10 * Math.cos(ang - 0.35), p1[1] - 10 * Math.sin(ang - 0.35));
                    ctx.lineTo(p1[0] - 10 * Math.cos(ang + 0.35), p1[1] - 10 * Math.sin(ang + 0.35)); ctx.closePath(); ctx.fill();
                }
                if (lbl) {
                    ctx.font = '600 13px ' + VEM.cssVar('--font-sans');
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    var mx = (p0[0] + p1[0]) / 2 - 14 * Math.sin(ang), my = (p0[1] + p1[1]) / 2 + 14 * Math.cos(ang);
                    if (lbl.at === 'end') { mx = p1[0] + 16 * Math.cos(ang); my = p1[1] + 16 * Math.sin(ang) - 8; }
                    ctx.fillText(lbl.t, mx, my);
                }
            }
            arrow(C(0), C(r.V2p), VEM.col(1), { t: "V'₂" });
            if (Imag > 0) {
                arrow(C(0), Iv, VEM.col(3), { t: "I'₂", at: 'end' }, null, 2);
                arrow(C(r.V2p), Cx.add(C(r.V2p), dR), VEM.col(4), { t: 'R·I' }, null, 2);
                arrow(Cx.add(C(r.V2p), dR), V1d, VEM.col(5), { t: 'jX·I' }, null, 2);
            }
            arrow(C(0), V1d, VEM.col(2), { t: 'V₁', at: 'end' });
            ctx.fillStyle = VEM.cssVar('--text-2'); ctx.font = '12px ' + VEM.cssVar('--font-sans'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
            ctx.fillText('Caídas ×' + k + ' · φ₂ = ' + fmt(Math.acos(r.c) * 180 / Math.PI * (r.s < 0 ? -1 : 1), 1) + '°', 8, 8);
        }

        function drawFlow() {
            if (!cur) return;
            var r = cur, max = Math.max(r.P1, 1);
            function bar(lbl, v, cls) {
                return '<div class="flow-row ' + (cls || '') + '"><span class="flow-l">' + lbl + '</span><span class="flow-bar"><i style="width:' +
                    Math.max(0.5, Math.abs(v) / max * 100).toFixed(2) + '%"></i></span><span class="flow-v">' + fmt(v, 0) + ' W</span></div>';
            }
            flow.innerHTML = bar('Potencia absorbida P<sub>1</sub>', r.P1, 'in') +
                bar('Pérdidas hierro P<sub>Fe</sub>', r.Pfe, 'loss') +
                bar('Pérdidas cobre P<sub>Cu</sub>', r.Pcu, 'loss') +
                bar('Potencia entregada P<sub>2</sub>', r.P2, 'out') +
                '<p class="flow-note">P<sub>Fe</sub> depende de la tensión (casi constante) y P<sub>Cu</sub> = C²·P<sub>cc</sub>. El rendimiento es máximo cuando ambas pérdidas se igualan.</p>';
        }

        function drawCharts() {
            var t = tipo.get(), cs = t === 'res' ? 1 : cosc.get(), V = v1.get();
            var eta = [], eta1 = [], v2 = { res: [], ind: [], cap: [] };
            for (var c = 0.01; c <= 1.3001; c += 0.02) {
                var r = carga(P, V, c, cs, t); if (r) eta.push([c, r.eta]);
                var r1 = carga(P, V, c, 1, 'res'); if (r1) eta1.push([c, r1.eta]);
            }
            for (c = 0; c <= 1.3001; c += 0.02) {
                ['res', 'ind', 'cap'].forEach(function (k) { var rr = carga(P, V, c, k === 'res' ? 1 : cs, k); if (rr) v2[k].push([c, rr.V2]); });
            }
            var rows = tbl.rows().filter(function (rw) { return rw.V1 > 0; });
            var etaMin = Math.min.apply(null, eta.filter(function (p) { return p[0] > 0.2; }).map(function (p) { return p[1]; }).concat([100]));
            VEM.plot(c1, {
                xLabel: 'Índice de carga C', yLabel: 'η (%)', x: [0, 1.3], y: [Math.max(0, Math.floor(etaMin / 5) * 5 - 5), 100],
                lines: [{ data: eta, color: VEM.col(1), label: 'cos φ₂ = ' + fmt(cs, 2) }, { data: eta1, color: VEM.col(4), dash: [5, 4], width: 1.5, label: 'cos φ₂ = 1' }],
                points: [{ data: rows.map(function (rw) { return [rw.I2 / b.I2n, rw.P2 / rw.P1 * 100]; }).filter(function (p) { return isFinite(p[1]); }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: cur ? { x: cur.C, y: cur.eta, color: VEM.col(2), label: 'Actual' } : null
            });
            var allV = v2.cap.concat(v2.res, v2.ind).map(function (p) { return p[1]; });
            var vlo = Math.min.apply(null, allV), vhi = Math.max.apply(null, allV), pad = Math.max(1, (vhi - vlo) * 0.15);
            VEM.plot(c2, {
                xLabel: 'Índice de carga C', yLabel: 'V₂ (V)', x: [0, 1.3], y: [Math.floor(vlo - pad), Math.ceil(vhi + pad)],
                lines: [{ data: v2.cap, color: VEM.col(5), label: 'Capacitiva' }, { data: v2.res, color: VEM.col(4), label: 'Resistiva' }, { data: v2.ind, color: VEM.col(1), label: 'Inductiva' }],
                points: [{ data: rows.map(function (rw) { return [rw.I2 / b.I2n, rw.V2]; }), color: VEM.col(3), label: 'Tus medidas' }],
                marker: cur ? { x: cur.C, y: cur.V2, color: VEM.col(2), label: 'Actual' } : null
            });
        }

        function showResults() {
            if (!cur) return;
            var T = testData(), Cc = cur.C, cs = cur.c, sn = cur.s;
            var epsK = Cc * (T.K.eR * cs + T.K.eX * sn);
            var Pu = Cc * P.Sn * cs * (v1.get() / P.V1n);
            var etaP = Pu > 0 ? Pu / (Pu + T.V.P0 * Math.pow(v1.get() / P.V1n, 2) + Cc * Cc * T.K.Pcc) * 100 : 0;
            var Copt = Math.sqrt(T.V.P0 / T.K.Pcc);
            var note = T.own ? 'Datos de ensayo: <strong>tus medidas</strong> de vacío y cortocircuito.' :
                (T.partial ? 'Falta una de las dos tablas de ensayo; para la otra se usan los valores del simulador.' : 'Datos de ensayo: valores del simulador (aún no has registrado medidas de vacío y cortocircuito).');
            res.update([
                { label: 'Caída de tensión medida ε', value: live.eps, unit: '%', dec: 2, formula: 'ε = (V<sub>20</sub> − V<sub>2</sub>) / V<sub>20</sub> · 100' },
                { label: 'Caída de tensión de Kapp', value: epsK, unit: '%', dec: 2, formula: 'ε ≈ C·(ε<sub>Rcc</sub>·cos φ<sub>2</sub> + ε<sub>Xcc</sub>·sen φ<sub>2</sub>)' + (sn < 0 ? '  (sen φ<sub>2</sub> < 0 capacitiva)' : '') },
                { label: 'Rendimiento medido η', value: live.eta, unit: '%', dec: 2, formula: 'η = P<sub>2</sub> / P<sub>1</sub>' },
                { label: 'Rendimiento por pérdidas', value: etaP, unit: '%', dec: 2, formula: 'η = C·S<sub>n</sub>·cos φ<sub>2</sub> / (C·S<sub>n</sub>·cos φ<sub>2</sub> + P<sub>0</sub> + C²·P<sub>cc</sub>)' },
                { label: 'Índice de carga de η máximo', value: Copt, dec: 3, formula: 'C<sub>opt</sub> = √(P<sub>0</sub> / P<sub>cc</sub>)' }
            ], note);
        }

        function update() {
            var r = carga(P, v1.get(), cidx.get(), cosc.get(), tipo.get());
            if (!r) return;
            cur = r;
            var V20 = v1.get() / b.m;
            live = { V1: m(r.V1, 0.1), I1: m(r.I1, 0.01), P1: m(r.P1, 1), V2: m(r.V2, 0.1), I2: m(r.I2, 0.01), P2: m(r.P2, 1) };
            live.eta = live.P1 > 0 ? live.P2 / live.P1 * 100 : 0;
            live.eps = (V20 - live.V2) / V20 * 100;
            meters.update(live);
            drawPhasor(); drawFlow(); drawCharts(); showResults();
        }
        cosc.disable(false);
        if (window.ResizeObserver) new ResizeObserver(drawPhasor).observe(phasorCv);
        update();
    }

    VEM.machines = VEM.machines || [];
    VEM.machines.push({
        id: 'trafo', name: 'Transformador', defaults: defaults, defs: defs,
        practices: [
            { id: 'maquina', name: 'Máquina', render: renderMaquina },
            { id: 'vacio', name: 'Ensayo de vacío', render: renderVacio },
            { id: 'cc', name: 'Ensayo de cortocircuito', render: renderCC },
            { id: 'carga', name: 'Ensayo en carga', render: renderCarga }
        ],
        tables: ['trafo.vacio', 'trafo.cc', 'trafo.carga'],
        model: { vacio: vacio, cc: cc, carga: carga, refTests: refTests }
    });
})();
