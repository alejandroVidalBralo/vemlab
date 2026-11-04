/* =====================================================================
   VEMLAB · Aplicación
   Navegación (#máquina/práctica), parámetros de cada máquina,
   código de práctica (máquina con parámetros ocultos), ajustes y tema.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, ui = VEM.ui, fmt = VEM.fmt, store = VEM.store;

    /* ---------------- Ajustes ---------------- */
    VEM.settings = Object.assign({ noise: true, code: '', reveal: false, theme: 'auto' }, store.get('settings', {}));
    function saveSettings() { store.set('settings', VEM.settings); }

    function machine(id) { return VEM.machines.filter(function (m) { return m.id === id; })[0]; }

    /* ---------------- Parámetros ---------------- */
    function round3(v) {
        if (!v) return v;
        var d = Math.pow(10, 2 - Math.floor(Math.log10(Math.abs(v))));
        return Math.round(v * d) / d;
    }
    VEM.params = {
        get: function (id) {
            var M = machine(id);
            if (VEM.settings.code) {
                var rnd = VEM.rng(VEM.settings.code.trim().toUpperCase() + '|' + id);
                var P = Object.assign({}, M.defaults);
                M.defs.forEach(function (d) { if (d.vary) P[d.k] = round3(M.defaults[d.k] * (1 + d.vary * (2 * rnd() - 1))); });
                M.defs.forEach(function (d) { if (d.tie) P[d.k] = P[d.tie]; });
                return P;
            }
            return Object.assign({}, M.defaults, store.get('params.' + id, {}));
        },
        set: function (id, P) { store.set('params.' + id, P); },
        reset: function (id) { store.del('params.' + id); },
        hidden: function () { return !!VEM.settings.code && !VEM.settings.reveal; }
    };

    function clearMachineData(id) {
        var M = machine(id);
        (M.tables || []).forEach(function (k) { store.del('table.' + k); });
        (M.extraKeys || []).forEach(function (k) { store.del(k); });
    }
    function hasData(id) {
        return (machine(id).tables || []).some(function (k) { return store.get('table.' + k, []).length > 0; });
    }

    /* ---------------- Tarjetas comunes de la página «Máquina» ---------------- */
    function plateCard(parent, title, rows, note) {
        var body = ui.card(parent, title, 'plate');
        body.innerHTML = '<dl class="plate-list">' + rows.map(function (r) {
            return '<div><dt>' + r[0] + (r[2] ? ' *' : '') + '</dt><dd>' + r[1] + '</dd></div>';
        }).join('') + '</dl>' + (note ? '<p class="card-intro">' + note + '</p>' : '');
    }

    function paramsCard(parent, id, defs, P) {
        var hidden = VEM.params.hidden(), coded = !!VEM.settings.code;
        var body = ui.card(parent, 'Parámetros de la máquina', 'params');
        if (coded) {
            body.insertAdjacentHTML('beforeend', '<div class="notice">Máquina asignada por el código de práctica <strong>' + VEM.esc(VEM.settings.code) + '</strong>. ' +
                (hidden ? 'Los parámetros del circuito equivalente están <strong>ocultos</strong>: identifícalos con los ensayos.' : 'Parámetros visibles (modo profesor).') + '</div>');
        }
        var form = ui.h('<form class="param-form" novalidate></form>');
        defs.forEach(function (d) {
            var isHidden = hidden && !d.plate;
            var input;
            if (d.select) {
                input = '<select name="' + d.k + '"' + (coded ? ' disabled' : '') + '>' + d.select.map(function (o) {
                    return '<option value="' + o[0] + '"' + (P[d.k] === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
                }).join('') + '</select>';
            } else if (isHidden) {
                input = '<input type="text" value="oculto" disabled class="is-hidden">';
            } else {
                input = '<input type="text" inputmode="decimal" name="' + d.k + '" value="' + String(+Number(P[d.k]).toPrecision(6)).replace('.', ',') + '"' + (coded || d.tie ? ' disabled' : '') + '>';
            }
            form.insertAdjacentHTML('beforeend', '<label class="param"><span class="param-label">' + d.label + '</span><span class="param-input">' + input +
                '<span class="unit">' + (d.unit || '') + '</span></span>' + (d.tie && !isHidden ? '<span class="param-tie">= ' + d.tie.replace(/(\d)/, '<sub>$1</sub>') + '</span>' : '') + '</label>');
        });
        if (!coded) {
            form.insertAdjacentHTML('beforeend', '<div class="btn-row param-actions"><button type="submit" class="btn btn-primary">Aplicar cambios</button>' +
                '<button type="button" class="btn btn-ghost" data-reset>Valores por defecto</button></div>' +
                '<p class="card-intro">Puedes introducir los datos de la máquina real del laboratorio para que el simulador se parezca a ella.</p>');
        }
        body.appendChild(form);
        function confirmChange() {
            if (!hasData(id)) return true;
            return window.confirm('Al cambiar la máquina se borrarán las medidas registradas de sus ensayos. ¿Continuar?');
        }
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var NP = Object.assign({}, P), bad = [];
            defs.forEach(function (d) {
                var el = form.elements[d.k];
                if (!el || el.disabled) return;
                if (d.select) { NP[d.k] = el.value; return; }
                var v = VEM.parseNum(el.value);
                if (!isFinite(v) || v < (d.min || 0)) { bad.push(d.label.replace(/<[^>]+>/g, '')); el.classList.add('bad'); }
                else { NP[d.k] = d.step === 1 ? Math.round(v) : v; el.classList.remove('bad'); }
            });
            defs.forEach(function (d) { if (d.tie) NP[d.k] = NP[d.tie]; });
            if (bad.length) { ui.toast('Valor no válido: ' + bad.join(', ')); return; }
            if (!confirmChange()) return;
            clearMachineData(id);
            VEM.params.set(id, NP);
            ui.toast('Parámetros aplicados');
            route();
        });
        var rb = form.querySelector('[data-reset]');
        if (rb) rb.addEventListener('click', function () {
            if (!confirmChange()) return;
            clearMachineData(id);
            VEM.params.reset(id);
            ui.toast('Valores por defecto restaurados');
            route();
        });
    }

    VEM.app = { plateCard: plateCard, paramsCard: paramsCard };

    /* ---------------- Navegación ---------------- */
    var dom = {};
    function parseHash() {
        var h = (location.hash || '').replace(/^#\/?/, '').split('/');
        var M = machine(h[0]) || VEM.machines[0];
        var pr = M.practices.filter(function (p) { return p.id === h[1]; })[0] || M.practices[0];
        return { M: M, pr: pr };
    }

    function route() {
        var r = parseHash();
        dom.tabs.forEach(function (t) {
            var on = t.getAttribute('data-m') === r.M.id;
            t.classList.toggle('on', on);
            t.setAttribute('aria-selected', on);
        });
        dom.subnav.innerHTML = r.M.practices.map(function (p, i) {
            return '<a href="#' + r.M.id + '/' + p.id + '" class="' + (p === r.pr ? 'on' : '') + '"' + (p === r.pr ? ' aria-current="page"' : '') + '>' +
                (p.id === 'maquina' ? '' : '<span class="step">' + i + '</span>') + p.name + '</a>';
        }).join('');
        dom.view.innerHTML = '';
        var head = ui.h('<div class="page-head"><h1>' + r.pr.name + '</h1><p>' + r.M.name +
            (VEM.settings.code ? ' · <span class="pill">Código ' + VEM.esc(VEM.settings.code) + (VEM.params.hidden() ? ' · parámetros ocultos' : '') + '</span>' : '') + '</p></div>');
        dom.view.appendChild(head);
        try {
            r.pr.render(dom.view, VEM.params.get(r.M.id));
        } catch (e) {
            console.error(e);
            dom.view.insertAdjacentHTML('beforeend', '<div class="alarm">Error al calcular con estos parámetros. Revisa los valores en «Máquina» o restaura los valores por defecto.</div>');
        }
        store.set('lastRoute', r.M.id + '/' + r.pr.id);
        var active = dom.subnav.querySelector('.on');
        if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    /* ---------------- Tema ---------------- */
    function applyTheme() {
        var t = VEM.settings.theme;
        if (t === 'auto') document.documentElement.removeAttribute('data-theme');
        else document.documentElement.setAttribute('data-theme', t);
        var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        dom.themeBtn.textContent = dark ? '☀' : '☾';
        dom.themeBtn.title = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
        requestAnimationFrame(VEM.redrawAll);
    }

    /* ---------------- Ajustes (diálogo) ---------------- */
    function openSettings() {
        var d = dom.dialog;
        d.querySelector('#set-noise').checked = VEM.settings.noise;
        d.querySelector('#set-code').value = VEM.settings.code;
        d.querySelector('#set-reveal').checked = VEM.settings.reveal;
        d.querySelector('#set-reveal-row').hidden = !VEM.settings.code;
        if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    }
    function bindSettings() {
        var d = dom.dialog;
        d.querySelector('#set-noise').addEventListener('change', function () { VEM.settings.noise = this.checked; saveSettings(); route(); });
        d.querySelector('#set-reveal').addEventListener('change', function () { VEM.settings.reveal = this.checked; saveSettings(); route(); });
        d.querySelector('#set-code-apply').addEventListener('click', function () {
            var c = d.querySelector('#set-code').value.trim().toUpperCase();
            if (c === VEM.settings.code) return;
            if (VEM.machines.some(function (M) { return hasData(M.id); }) &&
                !window.confirm('Al cambiar de máquina se borrarán todas las medidas registradas. ¿Continuar?')) return;
            VEM.machines.forEach(function (M) { clearMachineData(M.id); });
            VEM.settings.code = c; VEM.settings.reveal = false; saveSettings();
            d.querySelector('#set-code').value = c;
            d.querySelector('#set-reveal').checked = false;
            d.querySelector('#set-reveal-row').hidden = !c;
            ui.toast(c ? 'Máquina del código ' + c + ' cargada' : 'Código eliminado');
            route();
        });
        d.querySelector('#set-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); d.querySelector('#set-code-apply').click(); } });
        d.querySelector('#set-code-clear').addEventListener('click', function () {
            d.querySelector('#set-code').value = '';
            d.querySelector('#set-code-apply').click();
        });
        d.querySelector('#set-clear').addEventListener('click', function () {
            if (!window.confirm('¿Borrar todas las medidas registradas de las dos máquinas?')) return;
            VEM.machines.forEach(function (M) { clearMachineData(M.id); });
            ui.toast('Medidas borradas');
            route();
        });
        d.querySelector('[data-close]').addEventListener('click', function () { if (d.close) d.close(); else d.removeAttribute('open'); });
        d.addEventListener('click', function (e) { if (e.target === d && d.close) d.close(); });
    }

    /* ---------------- Inicio ---------------- */
    function init() {
        dom.tabs = Array.prototype.slice.call(document.querySelectorAll('[data-m]'));
        dom.subnav = document.getElementById('subnav');
        dom.view = document.getElementById('view');
        dom.dialog = document.getElementById('settings');
        dom.themeBtn = document.getElementById('btn-theme');

        dom.tabs.forEach(function (t) {
            t.addEventListener('click', function () { location.hash = '#' + t.getAttribute('data-m') + '/maquina'; });
        });
        document.getElementById('btn-settings').addEventListener('click', openSettings);
        dom.themeBtn.addEventListener('click', function () {
            var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                (!document.documentElement.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
            VEM.settings.theme = dark ? 'light' : 'dark'; saveSettings(); applyTheme();
        });
        if (window.matchMedia) {
            var mq = window.matchMedia('(prefers-color-scheme: dark)');
            if (mq.addEventListener) mq.addEventListener('change', applyTheme);
        }
        bindSettings();
        applyTheme();
        window.addEventListener('hashchange', function () { route(); window.scrollTo(0, 0); });
        if (!location.hash) {
            var last = store.get('lastRoute', null);
            if (last) history.replaceState(null, '', '#' + last);
        }
        route();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
