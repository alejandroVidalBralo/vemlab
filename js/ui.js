/* =====================================================================
   VEMLAB · Componentes de interfaz reutilizables
   - Mandos (deslizador + campo numérico)
   - Panel de instrumentos (lecturas)
   - Tabla de medidas registradas (persistente, exportable a CSV)
   - Guion de práctica, tarjetas y gráficas
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM;
    var fmt = VEM.fmt, esc = VEM.esc;

    function h(html) {
        var t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstElementChild;
    }

    /* ---------------- Mando: deslizador + valor editable ---------------- */
    function control(parent, o) {
        var dec = o.dec === undefined ? 0 : o.dec;
        var el = h(
            '<div class="control">' +
            '<div class="control-head"><label for="' + o.id + '">' + o.label + '</label>' +
            '<span class="control-val"><input type="text" inputmode="decimal" class="control-num" aria-label="' + esc(o.label.replace(/<[^>]+>/g, '')) + '">' +
            '<span class="unit">' + (o.unit || '') + '</span></span></div>' +
            '<input type="range" id="' + o.id + '" min="' + o.min + '" max="' + o.max + '" step="' + o.step + '">' +
            (o.help ? '<div class="control-help">' + o.help + '</div>' : '') +
            '</div>');
        parent.appendChild(el);
        var range = el.querySelector('input[type=range]');
        var num = el.querySelector('.control-num');
        var api = {
            el: el,
            get: function () { return parseFloat(range.value); },
            set: function (v, silent) {
                range.value = v;
                num.value = fmt(parseFloat(range.value), dec);
                if (!silent && o.onInput) o.onInput(api.get());
            },
            setRange: function (min, max, step) {
                range.min = min; range.max = max; if (step) range.step = step;
                num.value = fmt(parseFloat(range.value), dec);
            },
            disable: function (d) { range.disabled = d; num.disabled = d; el.classList.toggle('disabled', d); }
        };
        range.addEventListener('input', function () {
            num.value = fmt(parseFloat(range.value), dec);
            if (o.onInput) o.onInput(api.get());
        });
        function commit() {
            var v = VEM.parseNum(num.value);
            if (isFinite(v)) api.set(VEM.clamp(v, parseFloat(range.min), parseFloat(range.max)));
            else num.value = fmt(api.get(), dec);
        }
        num.addEventListener('change', commit);
        num.addEventListener('keydown', function (e) { if (e.key === 'Enter') { commit(); num.blur(); } });
        api.set(o.value, true);
        return api;
    }

    /* ---------------- Selector segmentado ---------------- */
    function segmented(parent, o) {
        var el = h('<div class="control"><div class="control-head"><label>' + o.label + '</label></div>' +
            '<div class="segmented" role="radiogroup"></div></div>');
        var box = el.querySelector('.segmented');
        var value = o.value;
        o.options.forEach(function (opt) {
            var b = h('<button type="button" role="radio" data-v="' + opt.v + '">' + opt.t + '</button>');
            b.addEventListener('click', function () { api.set(opt.v); });
            box.appendChild(b);
        });
        parent.appendChild(el);
        var api = {
            el: el,
            get: function () { return value; },
            set: function (v, silent) {
                value = v;
                Array.prototype.forEach.call(box.children, function (b) {
                    var on = b.getAttribute('data-v') === String(v);
                    b.classList.toggle('on', on);
                    b.setAttribute('aria-checked', on);
                });
                if (!silent && o.onChange) o.onChange(v);
            },
            disableOption: function (v, d) {
                var b = box.querySelector('[data-v="' + v + '"]');
                if (b) b.disabled = d;
            }
        };
        api.set(value, true);
        return api;
    }

    /* ---------------- Instrumentos ---------------- */
    function meters(parent, defs) {
        var el = h('<div class="meters"></div>');
        var cells = {};
        defs.forEach(function (d) {
            var c = h('<div class="meter' + (d.kind ? ' meter-' + d.kind : '') + '">' +
                '<div class="meter-sym">' + d.sym + '</div>' +
                '<div class="meter-read"><span class="meter-val">—</span><span class="meter-unit">' + (d.unit || '') + '</span></div>' +
                '<div class="meter-name">' + d.label + '</div></div>');
            el.appendChild(c);
            cells[d.key] = { el: c.querySelector('.meter-val'), d: d, box: c };
        });
        parent.appendChild(el);
        return {
            el: el,
            update: function (vals) {
                Object.keys(cells).forEach(function (k) {
                    var c = cells[k];
                    var v = vals[k];
                    c.el.textContent = (v === undefined || v === null) ? '—' : (typeof v === 'string' ? v : fmt(v, c.d.dec === undefined ? 2 : c.d.dec));
                });
            }
        };
    }

    /* ---------------- Tabla de medidas ---------------- */
    function table(parent, o) {
        var rows = VEM.store.get('table.' + o.key, []);
        var el = h(
            '<div class="card">' +
            '<div class="card-head"><h3>' + (o.title || 'Medidas registradas') + '</h3>' +
            '<div class="btn-row">' +
            '<button type="button" class="btn btn-primary btn-rec">＋ Registrar lectura</button>' +
            '<button type="button" class="btn btn-ghost btn-csv" title="Descargar en CSV (se abre en Excel)">⤓ CSV</button>' +
            '<button type="button" class="btn btn-ghost btn-clear" title="Borrar todas las filas">Borrar</button>' +
            '</div></div>' +
            '<div class="table-wrap"><table class="data"><thead><tr><th>#</th>' +
            o.columns.map(function (c) { return '<th>' + c.label + (c.unit ? ' <span class="th-unit">(' + c.unit + ')</span>' : '') + '</th>'; }).join('') +
            '<th></th></tr></thead><tbody></tbody></table></div>' +
            '<p class="table-empty">Ajusta los mandos y pulsa <strong>Registrar lectura</strong> para anotar las medidas, igual que en tu hoja de laboratorio.</p>' +
            '</div>');
        parent.appendChild(el);
        var tbody = el.querySelector('tbody');
        var empty = el.querySelector('.table-empty');

        function render() {
            tbody.innerHTML = rows.map(function (r, i) {
                return '<tr><td>' + (i + 1) + '</td>' + o.columns.map(function (c) {
                    return '<td>' + fmt(r[c.key], c.dec === undefined ? 2 : c.dec) + '</td>';
                }).join('') + '<td><button type="button" class="icon-btn" data-del="' + i + '" title="Eliminar fila" aria-label="Eliminar fila ' + (i + 1) + '">×</button></td></tr>';
            }).join('');
            empty.style.display = rows.length ? 'none' : '';
            el.querySelector('.table-wrap').style.display = rows.length ? '' : 'none';
        }
        function save() { VEM.store.set('table.' + o.key, rows); render(); if (o.onChange) o.onChange(rows); }

        el.querySelector('.btn-rec').addEventListener('click', function () {
            var r = o.getRow();
            if (!r) return;
            rows.push(r); save();
            VEM.ui.toast('Lectura ' + rows.length + ' registrada');
        });
        el.querySelector('.btn-csv').addEventListener('click', function () {
            if (!rows.length) { VEM.ui.toast('No hay medidas que exportar'); return; }
            VEM.downloadCSV(o.key.replace(/\./g, '_') + '.csv',
                o.columns.map(function (c) { return c.label.replace(/<[^>]+>/g, '') + (c.unit ? ' (' + c.unit + ')' : ''); }),
                rows.map(function (r) { return o.columns.map(function (c) { return +r[c.key].toFixed(c.dec === undefined ? 2 : c.dec); }); }));
        });
        el.querySelector('.btn-clear').addEventListener('click', function () {
            if (!rows.length) return;
            if (window.confirm('¿Borrar las ' + rows.length + ' medidas de esta tabla?')) { rows = []; save(); }
        });
        tbody.addEventListener('click', function (e) {
            var b = e.target.closest('[data-del]');
            if (!b) return;
            rows.splice(+b.getAttribute('data-del'), 1); save();
        });
        render();
        return { el: el, rows: function () { return rows; } };
    }

    /* ---------------- Resultados calculados (con fórmula) ----------------
       update(items, note): items = [{label, value, unit, dec, formula}]      */
    function results(parent, title, intro) {
        var el = h('<div class="card results"><div class="card-head"><h3>' + title + '</h3></div>' +
            (intro ? '<p class="card-intro">' + intro + '</p>' : '') +
            '<div class="results-note"></div><dl class="results-list"></dl></div>');
        parent.appendChild(el);
        var list = el.querySelector('.results-list'), note = el.querySelector('.results-note');
        return {
            el: el,
            update: function (items, msg) {
                note.innerHTML = msg || '';
                note.style.display = msg ? '' : 'none';
                list.innerHTML = (items || []).map(function (it) {
                    return '<div class="res-item"><dt>' + it.label + '</dt><dd><span class="res-val">' +
                        (isFinite(it.value) ? fmt(it.value, it.dec === undefined ? 2 : it.dec) : '—') +
                        '</span> <span class="unit">' + (it.unit || '') + '</span></dd>' +
                        (it.formula ? '<div class="res-formula">' + it.formula + '</div>' : '') + '</div>';
                }).join('');
            }
        };
    }

    /* ---------------- Aviso breve ---------------- */
    var toastTimer;
    function toast(msg) {
        var t = document.getElementById('toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
    }

    /* ---------------- Tarjeta de práctica: objetivo + procedimiento ---------------- */
    function guide(parent, o) {
        var el = h('<details class="card guide"' + (o.open === false ? '' : ' open') + '>' +
            '<summary><h3>Guion de la práctica</h3><span class="summary-hint">mostrar / ocultar</span></summary>' +
            '<div class="guide-body">' +
            '<p class="guide-goal"><strong>Objetivo.</strong> ' + o.goal + '</p>' +
            (o.circuit ? '<div class="guide-circuit">' + o.circuit + '</div>' : '') +
            '<ol class="guide-steps">' + o.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
            (o.safety ? '<p class="guide-safety"><strong>En el laboratorio real:</strong> ' + o.safety + '</p>' : '') +
            '</div></details>');
        parent.appendChild(el);
        el.addEventListener('toggle', function () { VEM.redrawAll(); });
        return el;
    }

    function card(parent, title, cls, extraHead) {
        var el = h('<div class="card ' + (cls || '') + '">' + (title ? '<div class="card-head"><h3>' + title + '</h3>' + (extraHead || '') + '</div>' : '') + '<div class="card-body"></div></div>');
        parent.appendChild(el);
        return el.querySelector('.card-body');
    }

    function chart(parent, cls) {
        var w = h('<div class="chart ' + (cls || '') + '"><canvas></canvas></div>');
        parent.appendChild(w);
        return w.querySelector('canvas');
    }

    VEM.ui = {
        h: h, control: control, segmented: segmented, meters: meters, table: table,
        results: results, toast: toast, guide: guide, card: card, chart: chart
    };
})();
