/* =====================================================================
   VEMLAB · Banco de pruebas
   Una pantalla por máquina:
     1. Parámetros calculados en el laboratorio
     2. Conexión (vacío / cortocircuito / carga) y alimentación
     3. Diagrama + lecturas del simulador frente a las medidas del alumno
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, fmt = VEM.fmt, store = VEM.store;
    var $ = function (id) { return document.getElementById(id); };

    var M = null;          /* máquina activa */
    var st = null;         /* estado de la máquina activa */

    function defaults(m) {
        var P = {}; m.params.forEach(function (d) { P[d.k] = d.def; });
        return P;
    }
    function loadState(m) {
        var s = store.get('state.' + m.id, null) || {};
        s.P = Object.assign(defaults(m), s.P || {});
        s.mode = s.mode || m.modes[0].id;
        s.supply = s.supply || {};
        s.load = s.load || {};
        s.meas = s.meas || {};
        m.load(s.P).forEach(function (d) { if (s.load[d.k] === undefined) s.load[d.k] = d.def; });
        return s;
    }
    function save() { store.set('state.' + M.id, st); }

    /* ---------------- Mando: deslizador + número ---------------- */
    function control(parent, o, onChange) {
        var w = document.createElement('div');
        w.className = 'control';
        w.innerHTML = '<div class="control-head"><label>' + o.label + '</label><span class="control-val">' +
            '<input type="text" inputmode="decimal" class="num"><span class="unit">' + (o.unit || '') + '</span></span></div>' +
            '<input type="range" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '" aria-label="' + o.label.replace(/<[^>]+>/g, '') + '">';
        parent.appendChild(w);
        var num = w.querySelector('.num'), rng = w.querySelector('input[type=range]');
        var dec = o.step < 1 ? (o.step < 0.1 ? 2 : 1) : 0;
        function set(v, fire) {
            v = VEM.clamp(v, o.min, o.max);
            rng.value = v; num.value = fmt(v, dec);
            if (fire) onChange(v);
        }
        rng.addEventListener('input', function () { set(parseFloat(rng.value), true); });
        num.addEventListener('change', function () {
            var v = VEM.parseNum(num.value);
            if (isFinite(v)) set(v, true); else set(parseFloat(rng.value), false);
        });
        num.addEventListener('keydown', function (e) { if (e.key === 'Enter') num.blur(); });
        set(o.value, false);
        return { el: w, set: set };
    }

    function segmented(parent, options, value, onChange, cls) {
        var w = document.createElement('div');
        w.className = 'segmented ' + (cls || '');
        w.setAttribute('role', 'radiogroup');
        options.forEach(function (o) {
            var b = document.createElement('button');
            b.type = 'button'; b.setAttribute('role', 'radio');
            b.innerHTML = o[1];
            b.className = o[0] === value ? 'on' : '';
            b.setAttribute('aria-checked', o[0] === value);
            b.addEventListener('click', function () { onChange(o[0]); });
            w.appendChild(b);
        });
        parent.appendChild(w);
        return w;
    }

    /* ---------------- 1. Parámetros ---------------- */
    function renderParams() {
        var box = $('params-form');
        box.innerHTML = '';
        var group = null;
        M.params.forEach(function (d) {
            if (d.group !== group) {
                group = d.group;
                box.insertAdjacentHTML('beforeend', '<h3 class="group">' + group + '</h3>');
            }
            var lab = document.createElement('label');
            lab.className = 'param';
            lab.innerHTML = '<span class="param-label">' + d.label + '</span><span class="param-input">' +
                '<input type="text" inputmode="decimal" value="' + VEM.fmtIn(st.P[d.k]) + '" autocomplete="off">' +
                '<span class="unit">' + d.unit + '</span></span>';
            var inp = lab.querySelector('input');
            inp.addEventListener('input', function () {
                var v = VEM.parseNum(inp.value);
                var ok = isFinite(v) && (d.k === 'Pm' ? v >= 0 : v > 0) && (!d.int || Math.round(v) === v);
                inp.classList.toggle('bad', !ok);
                if (!ok) return;
                st.P[d.k] = v; save();
                renderControls(); update();
            });
            box.appendChild(lab);
        });
    }

    /* ---------------- 2. Conexión ---------------- */
    function renderModes() {
        var box = $('modes');
        box.innerHTML = '';
        segmented(box, M.modes.map(function (m) { return [m.id, m.label]; }), st.mode, function (id) {
            st.mode = id; save(); renderModes(); renderControls(); update();
        }, 'big');
        var mode = M.modes.filter(function (m) { return m.id === st.mode; })[0];
        $('mode-help').innerHTML = mode.help;
    }

    function renderControls() {
        var box = $('controls');
        box.innerHTML = '';
        var sp = M.supply(st.mode, st.P);
        var v0 = st.supply[st.mode];
        if (v0 === undefined || v0 > sp.max) v0 = sp.def;
        var sup = control(box, { label: sp.label, unit: sp.unit, min: sp.min, max: sp.max, step: sp.step, value: v0 }, function (v) {
            st.supply[st.mode] = v; save(); update();
        });
        st.supply[st.mode] = VEM.clamp(v0, sp.min, sp.max);
        if (sp.quick) {
            var q = document.createElement('button');
            q.type = 'button'; q.className = 'btn btn-ghost btn-sm';
            q.innerHTML = sp.quick.label;
            q.addEventListener('click', function () { sup.set(+sp.quick.v.toFixed(2), true); });
            sup.el.appendChild(q);
        }
        if (st.mode !== 'carga') return;
        var loadBox = document.createElement('div');
        loadBox.className = 'load-box';
        loadBox.innerHTML = '<h3 class="group">Carga conectada</h3>';
        box.appendChild(loadBox);
        M.load(st.P).forEach(function (d) {
            if (d.hideIf && Object.keys(d.hideIf).some(function (k) { return st.load[k] === d.hideIf[k]; })) return;
            if (d.seg) {
                var w = document.createElement('div');
                w.className = 'control';
                w.innerHTML = '<div class="control-head"><label>' + d.label + '</label></div>';
                loadBox.appendChild(w);
                segmented(w, d.seg, st.load[d.k], function (v) { st.load[d.k] = v; save(); renderControls(); update(); });
                return;
            }
            var v = VEM.clamp(st.load[d.k], d.min, d.max);
            st.load[d.k] = v;
            control(loadBox, { label: d.label, unit: d.unit, min: d.min, max: d.max, step: d.step, value: v }, function (x) {
                st.load[d.k] = x; save(); update();
            });
        });
    }

    /* ---------------- 3. Diagrama y lecturas ---------------- */
    function diffClass(d) {
        var a = Math.abs(d);
        return a <= 5 ? 'ok' : (a <= 10 ? 'warn' : 'bad');
    }

    function update() {
        var r;
        try { r = M.solve(st.P, st.mode, st.supply[st.mode], st.load); }
        catch (e) { console.error(e); return; }
        $('diagram').innerHTML = M.diagram(st.P, st.mode, r, st.load);
        $('alarm').hidden = !r.stalled;
        if (r.stalled) $('alarm').innerHTML = 'Con esta tensión el motor no vence sus pérdidas mecánicas y se para. Sube la tensión.';

        var rows = M.readings(st.mode, r);
        var meas = st.meas[st.mode] = st.meas[st.mode] || {};
        var tb = $('readings-body');
        var focused = document.activeElement && document.activeElement.getAttribute('data-k');
        tb.innerHTML = rows.map(function (row) {
            var mv = meas[row.k];
            var cell = row.noCompare ? '<td class="na">—</td><td></td>' :
                '<td><input type="text" inputmode="decimal" data-k="' + row.k + '" value="' + (mv !== undefined ? VEM.fmtIn(mv) : '') + '" placeholder="—" aria-label="Tu medida de ' + row.label.replace(/<[^>]+>/g, '') + '"></td>' +
                '<td class="diff" data-d="' + row.k + '"></td>';
            return '<tr><th scope="row">' + row.label + (row.unit ? ' <span class="unit">(' + row.unit + ')</span>' : '') + '</th>' +
                '<td class="sim">' + fmt(row.v, row.dec) + '</td>' + cell + '</tr>';
        }).join('');
        function showDiff(row) {
            var cell = tb.querySelector('[data-d="' + row.k + '"]');
            if (!cell) return;
            var mv = meas[row.k];
            if (mv === undefined || !isFinite(mv) || mv === 0 || !isFinite(row.v)) { cell.textContent = ''; cell.className = 'diff'; return; }
            var d = (row.v - mv) / Math.abs(mv) * 100;
            cell.textContent = (d > 0 ? '+' : '') + fmt(d, 1) + ' %';
            cell.className = 'diff ' + diffClass(d);
        }
        rows.forEach(showDiff);
        tb.querySelectorAll('input[data-k]').forEach(function (inp) {
            inp.addEventListener('input', function () {
                var k = inp.getAttribute('data-k'), v = VEM.parseNum(inp.value);
                if (inp.value.trim() === '') delete meas[k]; else if (isFinite(v)) meas[k] = v;
                inp.classList.toggle('bad', inp.value.trim() !== '' && !isFinite(v));
                save();
                showDiff(rows.filter(function (x) { return x.k === k; })[0]);
                summary(rows);
            });
        });
        if (focused) {
            var f = tb.querySelector('[data-k="' + focused + '"]');
            if (f) { f.focus(); var l = f.value.length; f.setSelectionRange(l, l); }
        }
        summary(rows);
    }

    function summary(rows) {
        var meas = st.meas[st.mode] || {}, n = 0, worst = 0;
        rows.forEach(function (row) {
            var mv = meas[row.k];
            if (row.noCompare || mv === undefined || !isFinite(mv) || mv === 0 || !isFinite(row.v)) return;
            n++; worst = Math.max(worst, Math.abs((row.v - mv) / mv * 100));
        });
        var el = $('verdict');
        if (!n) {
            el.className = 'verdict';
            el.innerHTML = 'Escribe en la columna <strong>Tu medida</strong> lo que mediste en el laboratorio en las mismas condiciones (misma conexión y misma tensión).';
            return;
        }
        var c = diffClass(worst);
        el.className = 'verdict ' + c;
        el.innerHTML = c === 'ok' ? '✓ Tus parámetros reproducen tus medidas (todas las diferencias ≤ 5 %).' :
            c === 'warn' ? 'Diferencias moderadas (máx. ' + fmt(worst, 1) + ' %). Revisa los cálculos o la precisión de las medidas.' :
                '✗ Alguna diferencia supera el 10 % (máx. ' + fmt(worst, 1) + ' %). Revisa el parámetro relacionado con esa medida.';
    }

    /* ---------------- Máquina activa ---------------- */
    function select(id) {
        M = VEM.machines.filter(function (m) { return m.id === id; })[0] || VEM.machines[0];
        st = loadState(M);
        store.set('machine', M.id);
        document.querySelectorAll('[data-m]').forEach(function (b) {
            var on = b.getAttribute('data-m') === M.id;
            b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
        });
        $('machine-sub').textContent = M.subtitle;
        $('params-note').innerHTML = M.note || '';
        renderParams(); renderModes(); renderControls(); update();
    }

    function applyTheme(t) {
        if (t) document.documentElement.setAttribute('data-theme', t);
        var cur = document.documentElement.getAttribute('data-theme');
        var dark = cur ? cur === 'dark' : window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
        $('btn-theme').textContent = dark ? '☀' : '☾';
        $('btn-theme').title = dark ? 'Tema claro' : 'Tema oscuro';
        return dark;
    }

    function init() {
        document.querySelectorAll('[data-m]').forEach(function (b) {
            b.addEventListener('click', function () { select(b.getAttribute('data-m')); });
        });
        $('btn-defaults').addEventListener('click', function () {
            if (!window.confirm('¿Sustituir tus parámetros por los valores de ejemplo?')) return;
            st.P = defaults(M); save(); renderParams(); renderControls(); update();
        });
        $('btn-clear').addEventListener('click', function () {
            st.meas[st.mode] = {}; save(); update();
        });
        var t = store.get('theme', null);
        applyTheme(t);
        $('btn-theme').addEventListener('click', function () {
            var dark = applyTheme();
            store.set('theme', dark ? 'light' : 'dark');
            applyTheme(dark ? 'light' : 'dark');
        });
        select(store.get('machine', VEM.machines[0].id));
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
