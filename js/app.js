/* =====================================================================
   VEMLAB · Aplicación
   Estado persistente, bucle de simulación en tiempo real, registro de
   eventos, avisos y barra superior.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM;
    var KEY = 'vemlab4';
    var $ = function (id) { return document.getElementById(id); };

    function load() {
        var s = null;
        try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
        s = s || {};
        s.motor = VEM.Motor.catalog.some(function (m) { return m.id === s.motor; }) ? s.motor : 'M2';
        s.test = s.test || 'vacio';
        s.tab = s.tab || 'guia';
        s.data = s.data || {};
        s.cables = Array.isArray(s.cables) ? s.cables.filter(function (c) { return VEM.Circuit.TERMINALS.indexOf(c.a) >= 0 && VEM.Circuit.TERMINALS.indexOf(c.b) >= 0; }) : [];
        s.bridges = s.bridges || {};
        s.variac = +s.variac || 0;
        s.brake = +s.brake || 0;
        s.color = s.color || 'red';
        return s;
    }
    var st = load();
    function link() {
        var d = st.data[st.motor] = st.data[st.motor] || {};
        d.meas = d.meas || {}; d.student = d.student || {}; d.chart = d.chart || {};
        st.meas = d.meas; st.student = d.student; st.chart = d.chart;
    }
    link();

    var lab, bench, panel, scope, saveTimer = null, drawTick = 0;
    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            var o = {
                motor: st.motor, test: st.test, seenHelp: st.seenHelp, tab: st.tab, data: st.data, color: bench ? bench.color : st.color,
                cables: lab.cables, bridges: lab.bridges, variac: lab.variac, brake: lab.brake, scope: st.scope
            };
            try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* sin almacenamiento */ }
        }, 200);
    }

    /* ---------------- Avisos y registro ---------------- */
    function toast(msg, type) {
        var box = $('toasts'), t = document.createElement('div');
        t.className = 'toast ' + (type || '');
        t.setAttribute('role', 'status');
        t.textContent = msg;
        box.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('in'); });
        setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 300); }, type === 'warn' ? 4200 : 2600);
    }
    function log(msg, type) {
        var ol = $('log'), li = document.createElement('li'), d = new Date();
        li.className = type || '';
        li.innerHTML = '<time>' + d.toLocaleTimeString('es-ES') + '</time>';
        li.appendChild(document.createTextNode(msg));
        ol.insertBefore(li, ol.firstChild);
        while (ol.children.length > 40) ol.lastChild.remove();
    }
    function alarm(msg) {
        var a = $('alarm');
        if (!msg) { a.hidden = true; return; }
        a.innerHTML = '<strong>⚠ Disparo de protección</strong><span>' + msg + '</span><button type="button" class="btn btn-sm" id="alarm-ok">Entendido</button>';
        a.hidden = false;
        $('alarm-ok').onclick = function () { a.hidden = true; };
    }

    /* ---------------- Barra superior ---------------- */
    function renderMotorSelect() {
        var sel = $('motor-sel');
        sel.innerHTML = VEM.Motor.catalog.map(function (m) {
            return '<option value="' + m.id + '"' + (m.id === st.motor ? ' selected' : '') + '>' + m.name + ' · ' + VEM.fmtN(m.Pn / 1000, 1) + ' kW</option>';
        }).join('');
        sel.onchange = function () {
            if (lab.on) { toast('Abre el interruptor Q1 antes de cambiar de máquina.', 'warn'); sel.value = st.motor; return; }
            st.motor = sel.value; link();
            lab.setMotor(VEM.Motor.catalog.filter(function (m) { return m.id === st.motor; })[0]);
            lab.locked = false; lab.brake = 0;
            bench.setPlate(); bench.buildBrakeKnob();
            panel.render();
            log('Máquina de ensayo cambiada a ' + lab.P.name + ' (' + VEM.fmtN(lab.P.Pn / 1000, 1) + ' kW).');
            save();
        };
    }

    function renderColors() {
        var box = $('colors');
        box.innerHTML = VEM.Bench.COLORS.map(function (c) {
            return '<button type="button" class="swatch' + (c.id === bench.color ? ' on' : '') + '" data-c="' + c.id + '" style="--c:' + c.c + '" title="Cable ' + c.name.toLowerCase() + '" aria-label="Cable ' + c.name.toLowerCase() + '"></button>';
        }).join('');
        box.querySelectorAll('[data-c]').forEach(function (b) {
            b.onclick = function () { bench.setColor(b.getAttribute('data-c')); renderColors(); save(); };
        });
    }

    function applyTheme(t) {
        if (t) document.documentElement.setAttribute('data-theme', t);
        var cur = document.documentElement.getAttribute('data-theme');
        var dark = cur ? cur === 'dark' : window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
        $('btn-theme').textContent = dark ? '☀' : '☾';
        $('btn-theme').title = dark ? 'Tema claro' : 'Tema oscuro';
        return dark;
    }

    /* ---------------- Bucle ---------------- */
    var last = 0, acc = 0, rd = null;
    function loop(t) {
        try { frame(t); } catch (e) { if (window.console) console.error(e); }
        requestAnimationFrame(loop);
    }
    function frame(t) {
        var dt = last ? (t - last) / 1000 : 0.016;
        last = t;
        dt = Math.min(dt, 0.1);
        lab.step(dt);
        rd = lab.readings();
        bench.frame(dt, rd);
        scope.sample(dt, rd);
        if (++drawTick % 2 === 0) scope.draw();
        acc += dt;
        if (acc >= 0.25) {
            acc = 0;
            var shown = bench.displays(rd);
            panel.tick(shown);
            status(rd);
        }
        lab.events.splice(0).forEach(function (e) {
            if (e.type === 'trip') { log(e.msg, 'bad'); alarm(e.msg); }
            else { log(e.msg, 'warn'); toast(e.msg, 'warn'); }
        });
    }

    var lastStatus = '';
    function status(r) {
        var s, cls;
        if (lab.on) {
            var n = Math.abs(r.n), ns = lab.P.plate.ns;
            if (lab.locked) s = 'Rotor bloqueado · alimentado';
            else if (n < 1 && Math.max(r.Iw[0], r.Iw[1], r.Iw[2]) > 0.3 * lab.P.Iwn) s = 'Motor alimentado pero sin girar (zumba)';
            else if (n < 1) s = 'Fuente conectada';
            else s = 'Motor girando · ' + Math.round(n) + ' min⁻¹' + (r.n < 0 ? ' (sentido antihorario)' : '');
            cls = 'on';
        } else { s = lab.trip ? 'Protección disparada · fuente desconectada' : 'Fuente desconectada · puedes modificar el montaje'; cls = lab.trip ? 'bad' : ''; }
        var html = '<span class="dot ' + cls + '"></span>' + s;
        if (html !== lastStatus) { $('status').innerHTML = html; lastStatus = html; }
    }

    function init() {
        lab = new VEM.Lab(VEM.Motor.catalog.filter(function (m) { return m.id === st.motor; })[0]);
        lab.cables = st.cables; lab.bridges = st.bridges;
        lab.variac = Math.min(1, Math.max(0, st.variac));
        lab.brake = st.brake;
        lab.rewire();
        var hooks = {
            changed: function () { save(); },
            toast: toast, log: log,
            hover: function (s) { $('hover').textContent = s || 'Pulsa un borne y después otro para tender un cable. Clic en un cable para seleccionarlo; doble clic o Supr para quitarlo. Ctrl+Z deshace.'; },
            selection: function (i) {
                var b = $('btn-del');
                if (b) b.hidden = i < 0;
            }
        };
        bench = new VEM.Bench($('bench'), lab, hooks);
        bench.color = st.color;
        hooks.hover(null);
        panel = new VEM.Panel($('side'), lab, st, {
            save: save, toast: toast,
            reference: function () {
                var w = VEM.Panel.referenceWiring(lab.P);
                if (bench.setWiring(w.cables, w.bridges)) { log('Montaje de referencia cableado (método de los dos vatímetros).'); toast('Montaje de referencia cableado.', 'ok'); }
            }
        });
        st.scope = st.scope || {};
        scope = new VEM.Scope($('scope'), lab, {
            settings: st.scope, save: save, toast: toast,
            points: function () { return (st.meas.carga || []).map(function (r) { return { n: r.n, T: r.T }; }); }
        });
        $('scopebox').addEventListener('toggle', function () { scope.draw(true); });
        renderMotorSelect();
        renderColors();
        $('btn-undo').onclick = function () { bench.undo(); };
        $('btn-clear').onclick = function () {
            if (!lab.cables.length) return;
            if (lab.on) { bench.canEdit(); return; }
            if (window.confirm('¿Quitar todos los cables del banco?')) bench.clearCables();
        };
        $('btn-del').onclick = function () { bench.removeCable(bench.sel); };
        $('btn-help').onclick = function () { $('help').showModal(); };
        $('help-close').onclick = function () { $('help').close(); };
        var t = null;
        try { t = localStorage.getItem(KEY + '.theme'); } catch (e) { t = null; }
        applyTheme(t);
        $('btn-theme').onclick = function () {
            var nt = applyTheme() ? 'light' : 'dark';
            applyTheme(nt);
            try { localStorage.setItem(KEY + '.theme', nt); } catch (e) { /* nada */ }
        };
        window.addEventListener('keydown', function (e) {
            if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); panel.record(); }
        });
        log('Banco preparado: ' + lab.P.name + ' (' + VEM.fmtN(lab.P.Pn / 1000, 1) + ' kW). Fuente desconectada.');
        if (!st.seenHelp && !/[?&]nohelp/.test(location.search)) { $('help').showModal(); st.seenHelp = true; }
        VEM.app = { lab: lab, bench: bench, panel: panel, scope: scope, st: st };
        requestAnimationFrame(loop);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
