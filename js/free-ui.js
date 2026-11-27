/* =====================================================================
   VEMLAB · Modo libre: lienzo de montaje
   - Cada componente se dibuja con las mismas piezas que los bancos
     guiados (fuentes, instrumentos, cargas, panel de sincronización,
     dinamómetro, placa del transformador) dentro de un grupo que se
     puede mover; las máquinas rotativas tienen un dibujo compacto con
     su placa de bornes y el extremo del eje.
   - Cables como en los bancos; los ejes se acoplan pulsando el extremo
     del eje de una máquina y luego el de otra.
   - Lienzo con desplazamiento y zoom (rueda, pellizco o botones).
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, W = VEM.W, el = W.el, txt = W.txt, Bench = VEM.Bench, INFO = Bench.INFO;
    var T = VEM.Free.TYPES, f = VEM.fmtN, noisy = Bench.noisy;
    var NS = 'http://www.w3.org/2000/svg';

    /* ---------------- Geometría de cada tipo ----------------
       proto: clase cuyo método dibuja el componente; origin: esquina de su dibujo; size; shaft: extremo del eje (local) */
    var GEO = {
        ac3: { proto: 'Bench', origin: [20, 20], size: [420, 335] },
        dc2: { proto: 'DCBench', origin: [20, 20], size: [420, 335] },
        exc: { proto: 'SyncBench', origin: [0, 20], size: [170, 335] },
        wm: { proto: 'Bench', origin: [0, 20], size: [230, 335] },
        am: { proto: 'Bench', origin: [0, 20], size: [165, 335] },
        vm: { proto: 'Bench', origin: [0, 20], size: [165, 335] },
        adc: { proto: 'Bench', origin: [0, 20], size: [190, 335] },
        adc3: { proto: 'Bench', origin: [0, 20], size: [190, 335] },
        vdc: { proto: 'Bench', origin: [0, 20], size: [190, 335] },
        mm: { proto: 'Bench', origin: [0, 20], size: [170, 335] },
        syncp: { proto: 'SyncBench', origin: [342, 396], size: [310, 484] },
        rlc: { proto: 'SyncBench', origin: [664, 396], size: [496, 204] },
        rdc: { proto: 'DCBench', origin: [524, 396], size: [636, 186] },
        rh: { proto: 'DCBench', origin: [312, 396], size: [200, 484] },
        tr: { proto: 'TrafoBench', origin: [20, 392], size: [740, 520] },
        dyno: { proto: 'Bench', origin: [1130, 396], size: [350, 484], shaft: [1146, 646] },
        im: { proto: 'Bench', origin: [0, 0], size: [470, 300], shaft: [452, 156] },
        dcm: { proto: 'DCBench', origin: [0, 0], size: [470, 300], shaft: [452, 156] },
        sm: { proto: 'SyncBench', origin: [0, 0], size: [470, 300], shaft: [452, 156] },
        ctl: { proto: 'Bench', origin: [0, 0], size: [170, 240] },
        qm: { proto: 'Bench', origin: [0, 0], size: [140, 250] },
        km: { proto: 'Bench', origin: [0, 0], size: [240, 250] },
        fr: { proto: 'Bench', origin: [0, 0], size: [210, 250] },
        kt: { proto: 'Bench', origin: [0, 0], size: [170, 250] },
        pbno: { proto: 'Bench', origin: [0, 0], size: [110, 170] },
        pbnc: { proto: 'Bench', origin: [0, 0], size: [110, 170] },
        estop: { proto: 'Bench', origin: [0, 0], size: [110, 170] },
        sel: { proto: 'Bench', origin: [0, 0], size: [110, 170] },
        lamp: { proto: 'Bench', origin: [0, 0], size: [110, 170] }
    };
    var NICE = {
        'src.L1': 'L1', 'src.L2': 'L2', 'src.L3': 'L3', 'src.N': 'N (tierra de la red)',
        'w.Ia': 'I* (entrada de corriente, polaridad)', 'w.Ib': 'I (salida de corriente)', 'w.Ua': 'U* (tensión, polaridad)', 'w.Ub': 'U (tensión)',
        'am.a': 'A', 'am.b': 'COM', 'vm.a': 'V', 'vm.b': 'COM', 'ad.a': '+ (entra la corriente)', 'ad.b': 'COM', 'vd.a': '+', 'vd.b': 'COM', 'mm.a': 'Ω', 'mm.b': 'COM',
        'ps.A+': 'INDUCIDO +', 'ps.A-': 'INDUCIDO −', 'ps.F+': 'EXCITACIÓN +', 'ps.F-': 'EXCITACIÓN −', 'ex.+': '+', 'ex.-': '−',
        'ld.+': '+', 'ld.-': '−', 'ra.1': 'arranque 1', 'ra.2': 'arranque 2', 'rf.1': 'campo 1', 'rf.2': 'campo 2',
        'k.A1': 'bobina A1', 'k.A2': 'bobina A2', 'kt.A1': 'bobina A1', 'kt.A2': 'bobina A2', 'k.13': '13 (NA)', 'k.14': '14 (NA)', 'k.21': '21 (NC)', 'k.22': '22 (NC)',
        'f.95': '95 (NC)', 'f.96': '96 (NC)', 'f.97': '97 (NA)', 'f.98': '98 (NA)', 'kt.15': '15 (común)', 'kt.16': '16 (NC temporizado)', 'kt.18': '18 (NA temporizado)',
        'cs.L': 'L (fase)', 'cs.N': 'N (neutro)'
    };
    function nice(local) {
        if (NICE[local]) return NICE[local];
        var s = local.split('.')[1] || local;
        if (/^t\.1/.test(local)) return 'AT ' + s.slice(1);
        if (/^t\.2/.test(local)) return 'BT ' + s.slice(1);
        if (/^sy\.L/.test(local)) return 'lado RED ' + s;
        if (/^sy\.G/.test(local)) return 'lado ALTERNADOR ' + s;
        return s;
    }

    function FreeBench(svg, lab, hooks) {
        this.views = {};
        this.selComp = null;
        this.pendCouple = null;
        this.view = hooks.view || null;
        Bench.call(this, svg, lab, hooks);
        this.bindCanvas();
        this.renderAll();
        if (!this.view) this.fit(); else this.applyView();
    }
    FreeBench.prototype = Object.create(Bench.prototype);
    FreeBench.prototype.constructor = FreeBench;

    FreeBench.prototype.defs = function (svg) {
        VEM.DCBench.prototype.defs.call(this, svg);
        var d = svg.querySelector('defs');
        function lin(id, stops, horiz) {
            var g = el('linearGradient', { id: id, x1: 0, y1: 0, x2: horiz ? 1 : 0, y2: horiz ? 0 : 1 }, d);
            stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
        }
        lin('gSyn', [[0, '#2a2f45'], [0.18, '#555f8a'], [0.33, '#8590b8'], [0.5, '#46507a'], [1, '#1b1f33']]);
        lin('gSynDark', [[0, '#1a1d2c'], [0.3, '#363d5c'], [1, '#141726']]);
        lin('gRing', [[0, '#5d646d'], [0.4, '#e3e7ec'], [0.6, '#c3c9d0'], [1, '#4b5159']]);
        lin('gCoil', [[0, '#5b2e10'], [0.18, '#b8692c'], [0.4, '#e3a15e'], [0.62, '#a85a22'], [1, '#4a240b']], true);
        lin('gCore', [[0, '#5d646d'], [0.5, '#8e969f'], [1, '#4b5159']]);
        lin('gBoard', [[0, '#eef0ec'], [1, '#d3d6d0']]);
        var pat = el('pattern', { id: 'pGrid', width: 50, height: 50, patternUnits: 'userSpaceOnUse' }, d);
        el('rect', { width: 50, height: 50, 'class': 'fgrid-bg' }, pat);
        el('path', { d: 'M50,0 H0 V50', 'class': 'fgrid-ln' }, pat);
    };

    FreeBench.prototype.build = function () {
        var svg = this.svg;
        svg.innerHTML = '';
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.defs(svg);
        this.gBg = el('rect', { x: -20000, y: -20000, width: 40000, height: 40000, fill: 'url(#pGrid)', 'class': 'free-bg' }, svg);
        this.gShafts = el('g', { 'class': 'shafts' }, svg);
        this.gComps = el('g', null, svg);
        this.gSel = el('g', { 'class': 'fsel-layer' }, svg);
        this.gCables = el('g', { 'class': 'cables' }, svg);
        this.gTemp = el('g', { 'class': 'cable-temp' }, svg);
        this.gHot = el('g', { 'class': 'hot' }, svg);
        this.gHandles = el('g', { 'class': 'shaft-handles' }, svg);
        this.pos = {};
    };
    FreeBench.prototype.renderBridges = function () { };
    FreeBench.prototype.modelChanged = function () { };
    FreeBench.prototype.afterWiring = function () {
        this.lab.rewire();
        this.renderCables();
        this.hooks.changed(true);
    };
    FreeBench.prototype.undo = function () {
        if (!this.history.length || !this.canEdit()) return;
        var s = JSON.parse(this.history.pop());
        if (s.free) { this.lab.load(s.free); this.renderAll(); this.hooks.structure(); }
        else { this.lab.cables = s.cables; }
        this.sel = -1;
        this.afterWiring();
    };
    FreeBench.prototype.snapshotAll = function () {
        this.history.push(JSON.stringify({ free: this.lab.persist() }));
        if (this.history.length > 60) this.history.shift();
    };

    /* ================= Componentes ================= */
    FreeBench.prototype.adapter = function (c) {
        var lab = this.lab, st = c.st, a = { comp: c };
        function prop(k, get, set) { Object.defineProperty(a, k, { get: get, set: set || function () { }, enumerable: true }); }
        prop('on', function () { return c.type === 'exc' ? st.ex.on : !!st.on; });
        prop('trip', function () { return st.trip || null; });
        prop('variac', function () { return st.variac; }, function (v) { st.variac = v; });
        prop('w', function () { return st.w || 0; });
        prop('q2', function () { return !!st.q2; });
        prop('lampMode', function () { return st.lampMode; }, function (v) { st.lampMode = v; });
        ['U', 'out', 'ex', 'load', 'rh', 'dyno'].forEach(function (k) { if (st[k] !== undefined) prop(k, function () { return st[k]; }); });
        a.P = c.P || { plate: {} };
        a.switchOn = function () { return lab.compSwitch(c, true); };
        a.switchOff = function () { lab.compSwitch(c, false); };
        a.openQ2 = function () { lab.setQ2(c, false); };
        a.closeQ2 = function () { return lab.setQ2(c, true); };
        return a;
    };

    FreeBench.prototype.renderAll = function () {
        var self = this;
        this.gComps.innerHTML = '';
        this.views = {};
        this.lab.comps.forEach(function (c) { self.buildComp(c); });
        this.mapPositions();
        this.renderHot(); this.renderCables(); this.renderShafts(); this.renderSel();
    };

    FreeBench.prototype.buildComp = function (c) {
        var self = this, G = GEO[c.type], Proto = VEM[G.proto] || Bench;
        var outer = el('g', { 'class': 'fcomp', 'data-comp': c.id }, this.gComps);
        var inner = el('g', { transform: 'translate(' + (-G.origin[0]) + ',' + (-G.origin[1]) + ')' }, outer);
        var v = Object.create(Proto.prototype);
        v.svg = this.svg; v.lab = this.adapter(c); v.hooks = this.hooks; v.pos = {}; v.phase = 0; v.history = [];
        v.comp = c;
        switch (c.type) {
            case 'ac3': v.buildSource(inner); break;
            case 'dc2': v.buildDCSource(inner); break;
            case 'exc': v.buildExciter(inner, 0); break;
            case 'wm': v.buildWattmeter(inner, 'w', c.id.replace('c', '#'), 0); break;
            case 'am': v.buildMeter(inner, 'am', 0, 'AMPERÍMETRO', 'A', 'A', '20 A ~', 'red'); break;
            case 'vm': v.buildMeter(inner, 'vm', 0, 'VOLTÍMETRO', 'V', 'V', '600 V ~', 'green'); break;
            case 'adc': v.buildMeter(inner, 'ad', 0, 'AMPERÍMETRO', 'A', 'A', '30 A =  ·  con signo', 'red', { w: 190, dc: true }); break;
            case 'adc3': v.buildMeter(inner, 'ad', 0, 'AMPERÍMETRO', 'A', 'A', '3 A =  ·  con signo', 'red', { w: 190, dc: true }); break;
            case 'vdc': v.buildMeter(inner, 'vd', 0, 'VOLTÍMETRO', 'V', 'V', '600 V =  ·  con signo', 'green', { w: 190, dc: true }); break;
            case 'mm': v.buildMultimeter(inner, 0); break;
            case 'syncp': v.buildSyncPanel(inner); break;
            case 'rlc': v.buildSyncLoad(inner); break;
            case 'rdc': v.buildDCLoad(inner); break;
            case 'rh': v.buildRheostats(inner); break;
            case 'tr': this.drawTrafo(v, inner, c); break;
            case 'dyno': v.buildDynoPanel(inner); this.drawDynoShaft(v, inner); break;
            case 'im': case 'dcm': case 'sm': this.drawMachine(v, inner, c); break;
            default: if (APAR[c.type]) APAR[c.type].call(this, v, inner, c);
        }
        /* etiqueta con el número del componente */
        var tag = el('g', { 'class': 'ftag' }, outer);
        el('rect', { x: 6, y: -24, width: 120, height: 20, rx: 4 }, tag);
        v.tagTxt = txt(tag, 12, -9, T[c.type].short + ' ' + c.id.replace('c', '#'), 'ftag-t');
        v.outer = outer;
        this.views[c.id] = v;
        this.place(c);
        /* arrastrar el componente */
        outer.addEventListener('pointerdown', function (e) { self.dragStart(e, c); });
    };
    FreeBench.prototype.place = function (c) {
        var v = this.views[c.id];
        if (v) v.outer.setAttribute('transform', 'translate(' + c.x + ',' + c.y + ')');
    };
    /* posiciones globales de los bornes y extremos de eje */
    FreeBench.prototype.mapPositions = function () {
        var self = this;
        this.pos = {};
        this.shaftPos = {};
        this.lab.comps.forEach(function (c) { self.mapComp(c); });
    };
    FreeBench.prototype.mapComp = function (c) {
        var v = this.views[c.id], G = GEO[c.type], self = this;
        if (!v) return;
        var label = T[c.type].short + ' ' + c.id.replace('c', '#');
        Object.keys(v.pos).forEach(function (k) {
            var p = v.pos[k], gid = c.id + ':' + k;
            self.pos[gid] = { x: c.x + p.x - G.origin[0], y: c.y + p.y - G.origin[1], r: p.r };
            INFO[gid] = label + ' · ' + nice(k);
        });
        if (G.shaft) this.shaftPos[c.id] = { x: c.x + G.shaft[0] - G.origin[0], y: c.y + G.shaft[1] - G.origin[1] };
    };

    FreeBench.prototype.renderHot = function () {
        var self = this, coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
        this.gHot.innerHTML = '';
        Object.keys(this.pos).forEach(function (id) {
            var p = self.pos[id];
            var c = el('circle', { cx: p.x, cy: p.y, r: p.r || (coarse ? 22 : 17), 'class': 'term-hit', 'data-term': id }, self.gHot);
            W.title(c, INFO[id] || id);
        });
        /* extremos de eje */
        this.gHandles.innerHTML = '';
        this.handleMarks = {};
        Object.keys(this.shaftPos).forEach(function (id) {
            var p = self.shaftPos[id], g = el('g', { 'class': 'shaft-hd' + (self.pendCouple === id ? ' pend' : ''), 'data-shaft': id, tabindex: 0, role: 'button', 'aria-label': 'Extremo del eje' }, self.gHandles);
            el('circle', { cx: p.x, cy: p.y, r: 15, 'class': 'shaft-hd-c' }, g);
            self.handleMarks[id] = el('line', { x1: p.x, y1: p.y - 11, x2: p.x, y2: p.y + 11, 'class': 'shaft-hd-m' }, g);
            W.title(g, 'Extremo del eje: pulsa aquí y después en el eje de otra máquina (o del dinamómetro) para acoplarlas. Con la máquina parada.');
            g.addEventListener('pointerdown', function (e) { if (e.button === 0) { e.stopPropagation(); self.coupleClick(id); } });
        });
    };

    FreeBench.prototype.renderShafts = function () {
        var self = this, g = this.gShafts;
        g.innerHTML = '';
        this.couplingMarks = [];
        this.lab.couplings.forEach(function (k, i) {
            var a = self.shaftPos[k.a], b = self.shaftPos[k.b];
            if (!a || !b) return;
            var cg = el('g', { 'class': 'coupling-l' }, g);
            el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'coupling-shaft' }, cg);
            var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
            var hub = el('g', { transform: 'translate(' + mx + ',' + my + ') rotate(' + ang + ')' }, cg);
            el('rect', { x: -26, y: -24, width: 52, height: 48, rx: 6, fill: 'url(#gCoupling)', 'class': 'coupling' }, hub);
            self.couplingMarks.push(el('rect', { x: -26, y: -2, width: 52, height: 4, 'class': 'cmark' }, hub));
            var hit = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': 'coupling-hit' }, cg);
            W.title(hit, 'Acoplamiento mecánico (doble clic o clic derecho para desacoplar, con las máquinas paradas)');
            function rm(e) { e.preventDefault(); e.stopPropagation(); self.uncouple(i); }
            hit.addEventListener('dblclick', rm);
            hit.addEventListener('contextmenu', rm);
        });
    };

    FreeBench.prototype.coupleClick = function (id) {
        var lab = this.lab;
        if (!this.pendCouple) { this.pendCouple = id; this.renderHot(); this.hooks.hover('Ahora pulsa el extremo del eje de la otra máquina (Esc para cancelar).'); return; }
        var a = this.pendCouple; this.pendCouple = null;
        this.hooks.hover(null);
        if (a === id) { this.renderHot(); return; }
        var ca = lab.byId(a), cb = lab.byId(id);
        if (Math.abs(ca.st.w) > 0.5 || Math.abs(cb.st.w) > 0.5) { this.hooks.toast('Para la máquina antes de acoplar los ejes.', 'warn'); this.renderHot(); return; }
        if (lab.couplings.some(function (k) { return (k.a === a && k.b === id) || (k.a === id && k.b === a); })) { this.renderHot(); return; }
        var used = lab.couplings.filter(function (k) { return k.a === a || k.b === a || k.a === id || k.b === id; });
        if (used.length) { this.hooks.toast('Cada extremo de eje admite un solo acoplamiento: desacopla primero.', 'warn'); this.renderHot(); return; }
        this.snapshotAll();
        lab.couplings.push({ a: a, b: id });
        lab.rewire();
        this.hooks.log('Ejes acoplados: ' + lab.label(ca) + ' ↔ ' + lab.label(cb) + '.');
        this.renderHot(); this.renderShafts(); this.hooks.changed(true); this.hooks.structure();
    };
    FreeBench.prototype.uncouple = function (i) {
        var lab = this.lab, k = lab.couplings[i];
        if (!k) return;
        var ca = lab.byId(k.a), cb = lab.byId(k.b);
        if (Math.abs(ca.st.w) > 0.5 || Math.abs(cb.st.w) > 0.5) { this.hooks.toast('Para las máquinas antes de desacoplar los ejes.', 'warn'); return; }
        this.snapshotAll();
        lab.couplings.splice(i, 1);
        lab.rewire();
        this.hooks.log('Ejes desacoplados: ' + lab.label(ca) + ' · ' + lab.label(cb) + '.');
        this.renderShafts(); this.hooks.changed(true); this.hooks.structure();
    };

    FreeBench.prototype.renderSel = function () {
        this.gSel.innerHTML = '';
        var c = this.selComp && this.lab.byId(this.selComp);
        if (!c) return;
        var G = GEO[c.type];
        el('rect', { x: c.x - 8, y: c.y - 30, width: G.size[0] + 16, height: G.size[1] + 38, rx: 12, 'class': 'fsel' }, this.gSel);
    };
    FreeBench.prototype.selectComp = function (id) {
        this.selComp = id;
        this.renderSel();
        if (this.hooks.compSelection) this.hooks.compSelection(id);
    };

    /* ---------------- Añadir y quitar ---------------- */
    FreeBench.prototype.addComp = function (type, model) {
        if (!this.canEdit()) return null;
        this.snapshotAll();
        var G = GEO[type], r = this.svg.getBoundingClientRect();
        var p = VEM.svgPoint(this.svg, r.left + r.width / 2, r.top + r.height / 2);
        /* busca un hueco libre cerca del centro de la vista (en espiral) */
        var lab = this.lab, cx = Math.round((p.x - G.size[0] / 2) / 10) * 10, cy = Math.round((p.y - G.size[1] / 2) / 10) * 10, x = cx, y = cy;
        function free(x, y) {
            return !lab.comps.some(function (c) {
                var s = GEO[c.type].size;
                return x < c.x + s[0] + 20 && x + G.size[0] + 20 > c.x && y < c.y + s[1] + 40 && y + G.size[1] + 40 > c.y;
            });
        }
        search: for (var rr = 0; rr <= 12; rr++) {
            for (var a = 0; a < Math.max(1, rr * 8); a++) {
                var ang = a / Math.max(1, rr * 8) * 2 * Math.PI, tx = Math.round((cx + rr * 120 * Math.cos(ang)) / 10) * 10, ty = Math.round((cy + rr * 90 * Math.sin(ang)) / 10) * 10;
                if (free(tx, ty)) { x = tx; y = ty; break search; }
            }
        }
        var c = lab.add(type, model, x, y);
        this.buildComp(c); this.mapComp(c);
        this.renderHot(); this.renderCables(); this.renderShafts();
        this.selectComp(c.id);
        this.hooks.log('Añadido: ' + lab.label(c) + (c.P && c.P.name ? ' (' + c.P.name + ')' : '') + '.');
        this.hooks.changed(true); this.hooks.structure();
        return c;
    };
    FreeBench.prototype.removeComp = function (id) {
        var c = this.lab.byId(id);
        if (!c || !this.canEdit()) return;
        if (c.st.w && Math.abs(c.st.w) > 0.5) { this.hooks.toast('Espera a que la máquina se pare.', 'warn'); return; }
        this.snapshotAll();
        var name = this.lab.label(c);
        this.lab.remove(id);
        this.selComp = null; this.sel = -1;
        this.renderAll();
        this.hooks.log('Quitado: ' + name + '.');
        this.hooks.changed(true); this.hooks.structure();
        if (this.hooks.compSelection) this.hooks.compSelection(null);
    };

    /* ---------------- Mover componentes ---------------- */
    FreeBench.prototype.dragStart = function (e, c) {
        if (e.button !== 0 || this.pending) return;
        if (e.target.closest && e.target.closest('.knob,.pbtn,.breaker,.estop,.rocker,.locksw,.slot,.wm-lcd,.ap-btn')) return;
        e.stopPropagation(); e.preventDefault();
        var self = this, p0 = VEM.svgPoint(this.svg, e.clientX, e.clientY), x0 = c.x, y0 = c.y, moved = false;
        this.selectComp(c.id);
        if (this.sel >= 0) this.select(-1);
        var outer = this.views[c.id].outer;
        outer.setPointerCapture && outer.setPointerCapture(e.pointerId);
        function mv(ev) {
            var p = VEM.svgPoint(self.svg, ev.clientX, ev.clientY);
            var nx = Math.round((x0 + p.x - p0.x) / 10) * 10, ny = Math.round((y0 + p.y - p0.y) / 10) * 10;
            if (nx === c.x && ny === c.y) return;
            moved = true; c.x = nx; c.y = ny;
            self.place(c); self.mapComp(c); self.renderSel();
            if (!self.raf) self.raf = requestAnimationFrame(function () { self.raf = null; self.renderHot(); self.renderCables(); self.renderShafts(); });
        }
        function up() {
            outer.removeEventListener('pointermove', mv); outer.removeEventListener('pointerup', up); outer.removeEventListener('pointercancel', up);
            if (moved) { self.renderHot(); self.renderCables(); self.renderShafts(); self.hooks.changed(true); }
        }
        outer.addEventListener('pointermove', mv); outer.addEventListener('pointerup', up); outer.addEventListener('pointercancel', up);
    };

    /* ---------------- Lienzo: desplazamiento y zoom ---------------- */
    FreeBench.prototype.applyView = function () {
        var v = this.view, r = this.svg.getBoundingClientRect();
        var asp = r.width > 10 && r.height > 10 ? r.height / r.width : 0.6;
        v.h = v.w * asp;
        this.svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + v.h);
    };
    FreeBench.prototype.fit = function () {
        var cs = this.lab.comps, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        cs.forEach(function (c) { var s = GEO[c.type].size; x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y - 30); x1 = Math.max(x1, c.x + s[0]); y1 = Math.max(y1, c.y + s[1]); });
        if (!cs.length) { x0 = 0; y0 = 0; x1 = 1500; y1 = 900; }
        var r = this.svg.getBoundingClientRect(), asp = r.width > 10 && r.height > 10 ? r.height / r.width : 0.6;
        var w = Math.max(900, x1 - x0 + 120), h = Math.max(540, y1 - y0 + 120);
        if (h / w > asp) w = h / asp;
        this.view = { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w * asp / 2, w: w, h: w * asp };
        this.applyView();
        this.hooks.changed(false);
    };
    FreeBench.prototype.zoom = function (k, cx, cy) {
        var v = this.view;
        var nw = Math.max(500, Math.min(12000, v.w * k));
        if (cx === undefined) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
        var s = nw / v.w;
        v.x = cx - (cx - v.x) * s; v.y = cy - (cy - v.y) * s; v.w = nw;
        this.applyView();
    };
    FreeBench.prototype.bindCanvas = function () {
        var self = this, svg = this.svg, pts = {}, pan = null, pinch = null;
        svg.addEventListener('wheel', function (e) {
            if (e.target.closest && e.target.closest('.knob')) return;
            e.preventDefault();
            var p = VEM.svgPoint(svg, e.clientX, e.clientY);
            self.zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, p.x, p.y);
            clearTimeout(self.zt); self.zt = setTimeout(function () { self.hooks.changed(false); }, 300);
        }, { passive: false });
        this.gBg.addEventListener('pointerdown', function (e) {
            if (self.pending) return;
            if (self.pendCouple) { self.pendCouple = null; self.renderHot(); self.hooks.hover(null); }
            pts[e.pointerId] = { x: e.clientX, y: e.clientY };
            var ids = Object.keys(pts);
            if (ids.length === 1) {
                pan = { x: e.clientX, y: e.clientY, vx: self.view.x, vy: self.view.y, moved: false };
                if (self.selComp) self.selectComp(null);
            } else if (ids.length === 2) {
                var a = pts[ids[0]], b = pts[ids[1]];
                pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: self.view.w };
                pan = null;
            }
            self.gBg.setPointerCapture(e.pointerId);
        });
        this.gBg.addEventListener('pointermove', function (e) {
            if (!pts[e.pointerId]) return;
            pts[e.pointerId] = { x: e.clientX, y: e.clientY };
            var r = svg.getBoundingClientRect(), k = self.view.w / r.width;
            if (pan) {
                self.view.x = pan.vx - (e.clientX - pan.x) * k; self.view.y = pan.vy - (e.clientY - pan.y) * k;
                pan.moved = true; self.applyView();
            } else if (pinch) {
                var ids = Object.keys(pts), a = pts[ids[0]], b = pts[ids[1]];
                if (!a || !b) return;
                var d = Math.hypot(a.x - b.x, a.y - b.y), cpt = VEM.svgPoint(svg, (a.x + b.x) / 2, (a.y + b.y) / 2);
                self.zoom(pinch.w * pinch.d / Math.max(20, d) / self.view.w, cpt.x, cpt.y);
            }
        });
        function end(e) {
            delete pts[e.pointerId];
            if (!Object.keys(pts).length) { if (pan || pinch) self.hooks.changed(false); pan = null; pinch = null; }
        }
        this.gBg.addEventListener('pointerup', end);
        this.gBg.addEventListener('pointercancel', end);
        window.addEventListener('resize', function () { self.applyView(); });
        window.addEventListener('keydown', function (e) {
            if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            if (e.key === 'Escape' && self.pendCouple) { self.pendCouple = null; self.renderHot(); self.hooks.hover(null); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && self.sel < 0 && self.selComp) { e.preventDefault(); self.removeComp(self.selComp); }
        });
    };

    /* ================= Dibujos propios ================= */
    var MACH = {
        im: { grad: 'gMotor', dark: 'gMotorDark', title: 'MÁQUINA ASÍNCRONA', rows: [['m.U1', 'U1'], ['m.V1', 'V1'], ['m.W1', 'W1'], ['m.W2', 'W2'], ['m.U2', 'U2'], ['m.V2', 'V2']] },
        dcm: { grad: 'gDC', dark: 'gDCDark', title: 'MÁQUINA DE C.C.', rows: [['d.A1', 'A1'], ['d.D1', 'D1'], ['d.E1', 'E1'], ['d.A2', 'A2'], ['d.D2', 'D2'], ['d.E2', 'E2']] },
        sm: { grad: 'gSyn', dark: 'gSynDark', title: 'MÁQUINA SÍNCRONA', rows: [['m.U1', 'U1'], ['m.V1', 'V1'], ['m.W1', 'W1'], ['m.W2', 'W2'], ['m.U2', 'U2'], ['m.V2', 'V2'], ['m.F1', 'F1'], ['m.F2', 'F2']] }
    };
    FreeBench.prototype.drawMachine = function (v, g, c) {
        var M = MACH[c.type], P = c.P, i;
        /* placa de bornes */
        el('rect', { x: 0, y: 0, width: 184, height: 300, rx: 10, fill: 'url(#' + M.dark + ')', 'class': 'housing' }, g);
        el('rect', { x: 8, y: 36, width: 168, height: 256, rx: 7, fill: 'url(#gBoxIn)', 'class': 'box-in' }, g);
        txt(g, 12, 24, M.title, 'dev-title sm');
        var cols = c.type === 'dcm' ? ['#d0312d', '#d0312d', '#d0312d', '#1d1f22', '#1d1f22', '#1d1f22'] : ['#7b4a24', '#1d1f22', '#8a9097', '#8a9097', '#7b4a24', '#1d1f22', '#d0312d', '#1d1f22'];
        M.rows.forEach(function (r, k) {
            var col = k % 3, row = Math.floor(k / 3), x = 42 + col * 50, y = 82 + row * 74;
            if (k >= 6) { x = 67 + (k - 6) * 50; }
            v.socket(g, r[0], x, y, cols[k], r[1], 32);
        });
        if (c.type === 'dcm') txt(g, 92, 254, 'A inducido · D serie · E derivación', 'box-hint', { 'text-anchor': 'middle' });
        else if (c.type === 'sm') { txt(g, 92, 274, 'F1–F2: excitación (c.c.)', 'box-hint', { 'text-anchor': 'middle' }); }
        else txt(g, 92, 254, 'Estrella o triángulo con cables', 'box-hint', { 'text-anchor': 'middle' });
        if (c.type !== 'sm') txt(g, 92, 272, 'Bobinas: ' + (c.type === 'dcm' ? 'A1–A2, D1–D2, E1–E2' : 'U1–U2, V1–V2, W1–W2'), 'box-hint', { 'text-anchor': 'middle' });
        /* cuerpo */
        var b = el('g', null, g);
        el('path', { d: 'M236,236 h40 l6,40 h-52 z M352,236 h40 l6,40 h-52 z', fill: 'url(#' + M.dark + ')', 'class': 'mot-edge' }, b);
        el('rect', { x: 196, y: 96, width: 30, height: 120, rx: 12, fill: 'url(#' + M.dark + ')', 'class': 'mot-edge' }, b);
        el('rect', { x: 222, y: 80, width: 190, height: 156, rx: 12, fill: 'url(#' + M.grad + ')', 'class': 'mot-edge' }, b);
        for (i = 0; i < 9; i++) el('line', { x1: 232, y1: 92 + i * 16, x2: 402, y2: 92 + i * 16, 'class': c.type === 'dcm' ? 'dc-vent-l' : 'fin' }, b);
        el('rect', { x: 284, y: 60, width: 66, height: 24, rx: 4, fill: 'url(#' + M.dark + ')', 'class': 'mot-edge' }, b);
        el('rect', { x: 408, y: 100, width: 18, height: 116, rx: 6, fill: 'url(#' + M.dark + ')', 'class': 'mot-edge' }, b);
        el('rect', { x: 424, y: 148, width: 30, height: 16, fill: 'url(#gShaft)', 'class': 'shaft' }, b);
        el('rect', { x: 238, y: 118, width: 158, height: 80, rx: 4, fill: 'url(#gPlate)', 'class': 'plate' }, b);
        var y = 134, pl = el('g', { 'class': 'plate-txt' }, b);
        var L = [];
        if (c.type === 'im') L = [P.name + ' · ' + P.code, f(P.Pn / 1000, 1) + ' kW · ' + P.f + ' Hz', 'Δ ' + P.plate.Ud + ' V / Y ' + P.plate.Uy + ' V', f(P.plate.Id, 1) + ' / ' + f(P.plate.Iy, 2) + ' A · ' + P.plate.n + ' min⁻¹'];
        if (c.type === 'dcm') L = [P.name + ' · ' + P.code, f(P.Pn / 1000, 1) + ' kW · ' + P.Un + ' V · ' + f(P.In, 1) + ' A', P.nn + ' min⁻¹ (máx. ' + P.nmax + ')', P.exc === 'series' ? 'Exc. serie' : 'Exc. ' + P.Un + ' V · ' + f(P.Ifn, 2) + ' A'];
        if (c.type === 'sm') L = [P.name + ' · ' + P.code, f(P.Sn / 1000, 1) + ' kVA · cos φ 0,8 · ' + P.f + ' Hz', 'Δ ' + P.plate.Ud + ' V / Y ' + P.plate.Uy + ' V · ' + P.ns + ' min⁻¹', 'Exc. ' + Math.round(P.plate.Ufn) + ' V · ' + f(P.Ifn, 1) + ' A'];
        L.forEach(function (s, k) { txt(pl, 246, y + k * 15, s, k ? 'pl' : 'pl-h'); });
        /* tacómetro */
        el('rect', { x: 196, y: 4, width: 150, height: 44, rx: 5, 'class': 'bezel' }, g);
        el('rect', { x: 200, y: 8, width: 142, height: 36, rx: 3, 'class': 'lcd-led' }, g);
        txt(g, 206, 22, 'n', 'disp-lbl-s green');
        v.dN = new W.SevenSeg(g, 220, 14, 5, 22, 'green');
        txt(g, 338, 22, 'min⁻¹', 'disp-unit green', { 'text-anchor': 'end', 'font-size': 10 });
        /* sondas térmicas */
        v.thLeds = [];
        for (i = 0; i < 10; i++) v.thLeds.push(el('rect', { x: 356 + i * 10.5, y: 14, width: 8.5, height: 10, rx: 1.5, 'class': 'th-led ' + (i < 6 ? 'g' : i < 8 ? 'a' : 'r') }, g));
        txt(g, 356, 40, 'TEMP. (PTC)', 'mini-lbl');
        v.gMot = b;
    };

    FreeBench.prototype.drawDynoShaft = function (v, g) {
        el('rect', { x: 1150, y: 638, width: 26, height: 16, fill: 'url(#gShaft)', 'class': 'shaft' }, g);
    };

    FreeBench.prototype.drawTrafo = function (v, g, c) {
        v.buildBoard(g);
        var P = c.P;
        el('rect', { x: 20, y: 884, width: 740, height: 28, rx: 6, fill: 'url(#gPlate)', 'class': 'plate' }, g);
        txt(g, 390, 903, P.name + ' · ' + P.code + ' · ' + f(P.Sn / 1000, 0) + ' kVA · AT 3 × ' + f(P.U1, 0) + ' V (' + f(P.I1n, 2) + ' A) · BT 3 × 2 × ' + f(P.U2h, 1) + ' V (' + f(P.I2n, 2) + ' A) · ucc ' + f(P.ucc * 100, 1) + ' %', 'pl', { 'text-anchor': 'middle' });
    };

    /* ================= Animación y displays ================= */
    function frameMains(v) {
        var on = v.lab.on;
        if (!v.qLever) return;
        v.qLever.setAttribute('y', on ? 108 : 136);
        v.qLever.setAttribute('class', 'brk-lever' + (on ? ' on' : ''));
        v.qLeverTxt.setAttribute('y', on ? 127 : 155);
        v.qLeverTxt.textContent = on ? 'I' : 'O';
        v.lampOn.setAttribute('class', 'lamp green' + (on ? ' lit' : ''));
        v.lampTrip.setAttribute('class', 'lamp red' + (v.lab.trip ? ' lit' : ''));
    }
    function rocker(sw, on, dx) {
        sw.lever.setAttribute('transform', on ? 'translate(' + (dx || 20) + ',0)' : '');
        sw.lever.setAttribute('class', 'rocker-lever' + (on ? ' on' : ''));
        sw.t.setAttribute('transform', on ? 'translate(' + (dx || 20) + ',0)' : '');
    }
    function lever(v, on, yOff, yOn, tOff, tOn) {
        v.ldLever.setAttribute('y', on ? yOn : yOff);
        v.ldLever.setAttribute('class', 'lock-lever' + (on ? ' on' : ''));
        v.ldLeverTxt.setAttribute('y', on ? tOn : tOff);
        v.ldLeverTxt.textContent = on ? 'ON' : 'OFF';
        v.ldLamp.setAttribute('class', 'lamp amber' + (on ? ' lit' : ''));
    }

    FreeBench.prototype.frame = function (dt, rd) {
        var self = this, lab = this.lab;
        this.phase = (this.phase || 0);
        lab.comps.forEach(function (c) {
            var v = self.views[c.id], st = c.st, r = rd && rd.comps[c.id];
            if (!v) return;
            switch (c.type) {
                case 'ac3': frameMains(v); break;
                case 'dc2':
                    frameMains(v);
                    ['A', 'F'].forEach(function (k) {
                        var sw = v.swOut[k]; rocker(sw, st.out[k]); sw.t.textContent = st.out[k] ? 'I' : '0';
                        v.lampOut[k].setAttribute('class', 'lamp green' + (st.on && st.out[k] ? ' lit' : ''));
                    });
                    break;
                case 'exc':
                    rocker(v.swEx, st.ex.on); v.swEx.t.textContent = st.ex.on ? 'I' : '0';
                    v.lampEx.setAttribute('class', 'lamp green' + (st.ex.on ? ' lit' : ''));
                    break;
                case 'rlc': lever(v, st.load.on, 456, 498, 480, 522); break;
                case 'rdc': lever(v, st.load.on, 456, 500, 481, 525); break;
                case 'syncp': {
                    var rot = st.lampMode === 'rot', ls = v.gLampSw;
                    ls.lever.setAttribute('transform', rot ? 'translate(36,0)' : '');
                    ls.t.setAttribute('transform', rot ? 'translate(36,0)' : '');
                    ls.t.textContent = rot ? 'GIRAT.' : 'APAG.';
                    var lbl = rot ? ['L1–G1', 'L2–G3', 'L3–G2'] : ['L1–G1', 'L2–G2', 'L3–G3'];
                    for (var i = 0; i < 3; i++) {
                        v.syLampLbl[i].textContent = lbl[i];
                        var bb = r ? Math.min(1, Math.pow(r.lamps[i], 1.6)) : 0;
                        v.syLamps[i].style.fill = 'rgba(255,' + Math.round(170 + 70 * bb) + ',' + Math.round(60 + 120 * bb) + ',' + (0.12 + 0.88 * bb).toFixed(2) + ')';
                        v.syLamps[i].style.filter = bb > 0.15 ? 'drop-shadow(0 0 ' + (2 + 8 * bb).toFixed(1) + 'px #ffc233)' : '';
                    }
                    var ang = r && r.sync ? r.phi * 180 / Math.PI : 0;
                    v.synPtr.setAttribute('transform', 'rotate(' + ang.toFixed(1) + ' ' + v.synCx + ' ' + v.synCy + ')');
                    v.synPtr.setAttribute('opacity', r && r.sync ? 1 : 0.35);
                    var q = st.q2;
                    v.q2Lever.setAttribute('x', q ? 498 : 442); v.q2Lever.setAttribute('class', 'brk-lever' + (q ? ' on' : ''));
                    v.q2Txt.setAttribute('x', q ? 526 : 470); v.q2Txt.textContent = q ? 'I' : 'O';
                    break;
                }
                case 'dyno': {
                    var rr = r ? { n: r.n, T: r.T, thermal: r.thermal } : null;
                    v.frameDyno(dt, rr);
                    break;
                }
                case 'ctl': case 'qm': case 'km': case 'fr': case 'kt': case 'pbno': case 'pbnc': case 'estop': case 'sel': case 'lamp':
                    frameApar(v, c, r);
                    break;
                case 'im': case 'dcm': case 'sm':
                    if (r) { var th = r.thermal * 10; for (var j = 0; j < 10; j++) v.thLeds[j].classList.toggle('lit', j < th); }
                    break;
            }
        });
        /* giro de los ejes */
        this.lab.comps.forEach(function (c) {
            var m = self.handleMarks && self.handleMarks[c.id];
            if (!m) return;
            c.ph = (c.ph || 0) + (c.st.w || 0) * dt * 0.055 * 3;
            var p = self.shaftPos[c.id];
            m.setAttribute('transform', 'rotate(' + ((c.ph * 180 / Math.PI) % 360).toFixed(1) + ' ' + p.x + ' ' + p.y + ')');
        });
    };

    FreeBench.prototype.displays = function (rd) {
        var self = this, f7 = W.fmt7, shown = {};
        if (!rd) return shown;
        function meter(d, v, range, dec, rel) {
            if (Math.abs(v) > range) { d.set(v < 0 ? '-OL' : 'OL'); return; }
            var x = noisy(v, rel);
            if (Math.abs(x) < Math.pow(10, -dec) / 2) x = 0;
            d.set(f7(x, 5, dec));
        }
        this.lab.comps.forEach(function (c) {
            var v = self.views[c.id], r = rd.comps[c.id], st = c.st;
            if (!v || !r) return;
            switch (c.type) {
                case 'ac3': v.dSrc.set(f7(r.U < 0.5 ? 0 : noisy(r.U, 0.0008), 4, 0)); break;
                case 'dc2':
                    v.dOut.A.set(f7(Math.abs(r.uA) < 0.5 ? 0 : noisy(r.uA, 0.0008), 4, 1));
                    v.dOut.F.set(f7(Math.abs(r.uF) < 0.5 ? 0 : noisy(r.uF, 0.0008), 4, 1));
                    break;
                case 'exc':
                    v.dExU.set(f7(r.U < 0.05 ? 0 : noisy(r.U, 0.0008), 4, 1));
                    v.dExI.set(f7(Math.abs(r.I) < 0.0005 ? 0 : noisy(Math.abs(r.I), 0.001), 4, 3));
                    break;
                case 'wm': v.dw.set(r.I > 20 || r.U > 600 ? 'OL' : f7(Math.abs(r.P) < 0.05 ? 0 : noisy(r.P, 0.0015), 6, 1)); break;
                case 'am': v.dam.set(r.v > 20 ? 'OL' : f7(r.v < 0.0005 ? 0 : noisy(r.v, 0.001), 5, 3)); break;
                case 'vm': v.dvm.set(r.v > 600 ? 'OL' : f7(r.v < 0.05 ? 0 : noisy(r.v, 0.0008), 5, 1)); break;
                case 'adc': meter(v.dad, r.v, 30, 2, 0.001); break;
                case 'adc3': meter(v.dad, r.v, 3, 3, 0.001); break;
                case 'vdc': meter(v.dvd, r.v, 600, 1, 0.0008); break;
                case 'mm':
                    if (r.mm.live) { v.dmm.set('Err'); v.mmUnit.textContent = 'V !'; }
                    else {
                        var R = r.mm.R;
                        if (!isFinite(R) || R > 40e6 || R < 0) { v.dmm.set('OL'); v.mmUnit.textContent = 'Ω'; }
                        else if (R >= 1e6) { v.dmm.set(f7(R / 1e6, 5, 3)); v.mmUnit.textContent = 'MΩ'; }
                        else if (R >= 1e3) { v.dmm.set(f7(R / 1e3, 5, 3)); v.mmUnit.textContent = 'kΩ'; }
                        else { v.dmm.set(f7(R < 0.005 ? 0 : noisy(R, 0.0005), 5, 3)); v.mmUnit.textContent = 'Ω'; }
                    }
                    break;
                case 'syncp':
                    v.dSy.uL.set(f7(r.uL < 0.5 ? 0 : noisy(r.uL, 0.0008), 4, 0));
                    v.dSy.uG.set(f7(r.uG < 0.5 ? 0 : noisy(r.uG, 0.0008), 4, 0));
                    v.dSy.fL.set(r.fL ? f7(r.fL, 4, 2) : '----');
                    v.dSy.fG.set(r.fG ? f7(r.fG + (Math.random() - 0.5) * 0.004, 4, 2) : '----');
                    break;
                case 'dyno': v.displaysDyno({ n: r.n, T: r.T }, {}); break;
                case 'im': case 'dcm': case 'sm': {
                    var n = Math.abs(r.n) < 0.5 ? 0 : noisy(r.n, 0.0002);
                    v.dN.set(f7(n, 5, 0));
                    break;
                }
            }
            void st;
        });
        return shown;
    };
    FreeBench.prototype.dynoChanged = function () {
        var self = this;
        this.lab.comps.forEach(function (c) { if (c.type === 'dyno' && self.views[c.id]) self.views[c.id].buildDynoKnob(); });
    };

    /* ================= Aparamenta ================= */
    var PH_COL = ['#7b4a24', '#1d1f22', '#8a9097'], AUX = '#5b6470', COILC = '#1f5fbf';
    function body(g, w, h, title, sub, cls) {
        el('rect', { x: 0, y: 0, width: w, height: h, rx: 8, 'class': 'ap-body ' + (cls || '') }, g);
        el('rect', { x: 0, y: 0, width: w, height: 64, rx: 8, 'class': 'ap-strip' }, g);
        el('rect', { x: 0, y: h - 64, width: w, height: 64, rx: 8, 'class': 'ap-strip' }, g);
        el('rect', { x: 10, y: 74, width: w - 20, height: h - 148, rx: 5, 'class': 'ap-face' }, g);
        txt(g, w / 2, 92, title, 'ap-title', { 'text-anchor': 'middle' });
        if (sub) txt(g, w / 2, 106, sub, 'ap-sub', { 'text-anchor': 'middle' });
    }
    /* fila de bornes: ids, etiquetas, colores, y (borde), arriba o abajo */
    function row(v, g, ids, lbls, cols, x0, dx, y, top) {
        ids.forEach(function (id, i) {
            var x = x0 + i * dx;
            v.socket(g, id, x, y, cols[i], lbls[i], top ? -18 : 28);
        });
    }
    function btn(g, cb, title) {
        var b = el('g', { 'class': 'ap-btn', tabindex: 0, role: 'button' }, g);
        if (title) W.title(b, title);
        b.addEventListener('pointerdown', function (e) { if (e.button === 0) { e.stopPropagation(); cb('down', e); } });
        b.addEventListener('pointerup', function (e) { cb('up', e); });
        b.addEventListener('pointercancel', function (e) { cb('up', e); });
        b.addEventListener('pointerleave', function (e) { cb('leave', e); });
        b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cb('key', e); } });
        return b;
    }
    var APAR = {
        ctl: function (v, g, c) {
            var self = this, lab = this.lab;
            body(g, 170, 240, 'MANDO', '230 V ~ · 2 A');
            txt(g, 85, 26, 'FUENTE DE MANDO', 'ap-head dark', { 'text-anchor': 'middle' });
            var sw = v.sw = btn(g, function (k) {
                if (k === 'up' || k === 'leave') return;
                if (!lab.compSwitch(c, !c.st.on)) return;
                self.hooks.log(lab.label(c) + (c.st.on ? ' conectada (230 V ~).' : ' desconectada.'));
                self.hooks.changed(false);
            }, 'Interruptor de la fuente de mando');
            el('rect', { x: 45, y: 118, width: 80, height: 40, rx: 6, 'class': 'rocker-body' }, sw);
            sw.lever = el('rect', { x: 50, y: 123, width: 35, height: 30, rx: 4, 'class': 'rocker-lever' }, sw);
            sw.t = txt(sw, 67, 144, '0', 'rocker-txt', { 'text-anchor': 'middle' });
            v.lampOn = v.lamp(g, 85, 160 + 0, 'green');
            row(v, g, ['cs.L', 'cs.N'], ['L', 'N'], ['#7b4a24', '#1f5fbf'], 55, 60, 206, false);
        },
        qm: function (v, g, c) {
            var self = this, lab = this.lab;
            body(g, 140, 250, 'Q', null);
            v.inTxt = txt(g, 70, 106, '', 'ap-sub', { 'text-anchor': 'middle' });
            row(v, g, ['q.1', 'q.3', 'q.5'], ['1', '3', '5'], PH_COL, 34, 36, 40, true);
            row(v, g, ['q.2', 'q.4', 'q.6'], ['2', '4', '6'], PH_COL, 34, 36, 210, false);
            var lv = btn(g, function (k) {
                if (k !== 'down' && k !== 'key') return;
                c.st.on = !c.st.on; c.st.th = c.st.on ? c.st.th : 0;
                self.hooks.log(lab.label(c) + (c.st.on ? ' cerrado.' : ' abierto.'));
                self.hooks.changed(false);
            }, 'Palanca del magnetotérmico (I cerrar / O abrir)');
            el('rect', { x: 48, y: 116, width: 44, height: 62, rx: 5, 'class': 'brk-slot' }, lv);
            v.qLev = el('rect', { x: 52, y: 120, width: 36, height: 26, rx: 3, 'class': 'brk-lever' }, lv);
            v.qTxt = txt(lv, 70, 138, 'O', 'brk-lever-txt', { 'text-anchor': 'middle' });
            var ib = btn(g, function (k) {
                if (k !== 'down' && k !== 'key') return;
                if (c.st.on) { self.hooks.toast('Abre el magnetotérmico antes de cambiar su calibre.', 'warn'); return; }
                var L = [2, 4, 6, 10, 16]; c.st.In = L[(L.indexOf(c.st.In) + 1) % L.length];
                self.hooks.changed(false);
            }, 'Calibre: pulsa para cambiarlo (2, 4, 6, 10 o 16 A, curva C)');
            el('rect', { x: 36, y: 96, width: 68, height: 14, rx: 3, 'class': 'ap-tag' }, ib);
        },
        km: function (v, g, c) {
            body(g, 240, 250, 'KM', 'contactor · bobina 230 V ~');
            row(v, g, ['k.1', 'k.3', 'k.5', 'k.13', 'k.21', 'k.A1'], ['1', '3', '5', '13', '21', 'A1'], PH_COL.concat([AUX, AUX, COILC]), 30, 36, 40, true);
            row(v, g, ['k.2', 'k.4', 'k.6', 'k.14', 'k.22', 'k.A2'], ['2', '4', '6', '14', '22', 'A2'], PH_COL.concat([AUX, AUX, COILC]), 30, 36, 210, false);
            /* esquema serigrafiado */
            var s = el('g', { 'class': 'ap-sch' }, g);
            [30, 66, 102].forEach(function (x) { el('path', { d: 'M' + x + ',116 v14 l10,-12 M' + x + ',134 v14', 'class': 'ap-ln' }, s); });
            el('path', { d: 'M138,116 v14 l10,-12 M138,134 v14 M174,116 v14 M174,118 l10,14 M174,134 v14', 'class': 'ap-ln' }, s);
            el('rect', { x: 202, y: 122, width: 16, height: 20, 'class': 'ap-ln' }, s);
            /* indicador mecánico de posición */
            el('rect', { x: 86, y: 154, width: 68, height: 26, rx: 4, 'class': 'ap-win' }, g);
            v.flag = el('rect', { x: 89, y: 157, width: 62, height: 20, rx: 3, 'class': 'ap-flag' }, g);
            v.flagT = txt(g, 120, 172, 'O', 'ap-flag-t', { 'text-anchor': 'middle' });
        },
        fr: function (v, g, c) {
            var self = this, lab = this.lab;
            body(g, 210, 250, 'F', null); txt(g, 196, 112, 'clase 10', 'ap-sub', { 'text-anchor': 'end' });
            row(v, g, ['f.1', 'f.3', 'f.5', 'f.95', 'f.97'], ['1', '3', '5', '95', '97'], PH_COL.concat([AUX, AUX]), 30, 36, 40, true);
            row(v, g, ['f.2', 'f.4', 'f.6', 'f.96', 'f.98'], ['2', '4', '6', '96', '98'], PH_COL.concat([AUX, AUX]), 30, 36, 210, false);
            var ticks = []; for (var x = 1; x <= 16; x++) ticks.push(x);
            v.kIr = new W.Knob(g, {
                cx: 62, cy: 146, r: 20, min: 1, max: 16, value: c.st.Ir, step: 0.1, wheel: 0.5, keyStep: 0.1, sweep: 270,
                ticks: ticks, major: 5, fmt: null, label: 'Corriente de ajuste del relé térmico (A)',
                onChange: function (q) { c.st.Ir = q; self.hooks.changed(false); }
            });
            v.irTxt = txt(g, 62, 180, '', 'ap-sub', { 'text-anchor': 'middle' });
            el('rect', { x: 118, y: 120, width: 72, height: 22, rx: 4, 'class': 'ap-win' }, g);
            v.flag = el('rect', { x: 121, y: 123, width: 66, height: 16, rx: 3, 'class': 'ap-flag' }, g);
            v.flagT = txt(g, 154, 135, '', 'ap-flag-t sm', { 'text-anchor': 'middle' });
            var rb = btn(g, function (k) {
                if (k !== 'down' && k !== 'key') return;
                if (!c.st.tripped) return;
                if (c.st.th > 75) { self.hooks.toast('El relé térmico todavía está caliente: espera un poco para rearmarlo.', 'warn'); return; }
                c.st.tripped = false; self.hooks.log(lab.label(c) + ' rearmado.'); self.hooks.changed(false);
            }, 'Rearme (RESET) del relé térmico');
            el('rect', { x: 124, y: 148, width: 60, height: 26, rx: 13, 'class': 'ap-reset' }, rb);
            txt(rb, 154, 166, 'RESET', 'ap-reset-t', { 'text-anchor': 'middle' });
        },
        kt: function (v, g, c) {
            var self = this;
            body(g, 170, 250, 'KT', null); txt(g, 156, 112, 'a la conexión', 'ap-sub', { 'text-anchor': 'end' });
            row(v, g, ['kt.A1', 'kt.15'], ['A1', '15'], [COILC, AUX], 46, 78, 40, true);
            row(v, g, ['kt.A2', 'kt.16', 'kt.18'], ['A2', '16', '18'], [COILC, AUX, AUX], 46, 39, 210, false);
            var ticks = []; for (var x = 0; x <= 30; x += 1) ticks.push(x);
            new W.Knob(g, {
                cx: 60, cy: 146, r: 20, min: 0.5, max: 30, value: c.st.T, step: 0.5, wheel: 1, keyStep: 0.5, sweep: 270,
                ticks: ticks, major: 10, fmt: null, label: 'Tiempo del temporizador (s)',
                onChange: function (q) { c.st.T = q; self.hooks.changed(false); }
            });
            v.tTxt = txt(g, 60, 180, '', 'ap-sub', { 'text-anchor': 'middle' });
            v.ledU = v.lamp(g, 124, 128, 'green'); txt(g, 124, 148, 'U', 'ap-sub', { 'text-anchor': 'middle' });
            v.ledR = v.lamp(g, 124, 160, 'amber'); txt(g, 124, 180, 'R', 'ap-sub', { 'text-anchor': 'middle' });
        },
        pbno: function (v, g, c) { pushDraw.call(this, v, g, c, 'pbg', 'I', ['pb.13', 'pb.14'], ['13', '14'], 'MARCHA', false); },
        pbnc: function (v, g, c) { pushDraw.call(this, v, g, c, 'pbr', 'O', ['pb.11', 'pb.12'], ['11', '12'], 'PARO', false); },
        estop: function (v, g, c) { pushDraw.call(this, v, g, c, 'pbe', '', ['pb.11', 'pb.12'], ['11', '12'], 'EMERGENCIA', true); },
        sel: function (v, g, c) {
            var self = this;
            el('rect', { x: 0, y: 0, width: 110, height: 170, rx: 10, 'class': 'ap-box' }, g);
            txt(g, 55, 20, 'SELECTOR', 'ap-head', { 'text-anchor': 'middle' });
            txt(g, 30, 48, '0', 'ap-sel-t', { 'text-anchor': 'middle' }); txt(g, 80, 48, '1', 'ap-sel-t', { 'text-anchor': 'middle' });
            var b = btn(g, function (k) {
                if (k !== 'down' && k !== 'key') return;
                c.st.pressed = !c.st.pressed; self.hooks.changed(false);
            }, 'Selector de dos posiciones (contacto NA 13-14 cerrado en 1)');
            el('circle', { cx: 55, cy: 74, r: 28, 'class': 'ap-sel-ring' }, b);
            v.selH = el('rect', { x: 49, y: 50, width: 12, height: 48, rx: 6, 'class': 'ap-sel-h' }, b);
            row(v, g, ['pb.13', 'pb.14'], ['13', '14'], [AUX, AUX], 30, 50, 130, false);
        },
        lamp: function (v, g, c) {
            var col = (VEM.Free.LAMPS.filter(function (l) { return l.id === c.model; })[0] || {}).c || '#4dff88';
            el('rect', { x: 0, y: 0, width: 110, height: 170, rx: 10, 'class': 'ap-box' }, g);
            txt(g, 55, 20, 'PILOTO 230 V', 'ap-head', { 'text-anchor': 'middle' });
            el('circle', { cx: 55, cy: 70, r: 30, 'class': 'ap-lamp-ring' }, g);
            v.dome = el('circle', { cx: 55, cy: 70, r: 23, fill: col, 'class': 'ap-dome' }, g);
            v.domeCol = col;
            row(v, g, ['h.X1', 'h.X2'], ['X1', 'X2'], [AUX, AUX], 30, 50, 130, false);
        }
    };
    function pushDraw(v, g, c, cls, sym, ids, lbls, name, latch) {
        var self = this;
        el('rect', { x: 0, y: 0, width: 110, height: 170, rx: 10, 'class': 'ap-box' }, g);
        txt(g, 55, 20, name, 'ap-head', { 'text-anchor': 'middle' });
        var b = btn(g, function (k) {
            if (latch) {
                if (k !== 'down' && k !== 'key') return;
                c.st.pressed = !c.st.pressed;
                self.hooks.log(self.lab.label(c) + (c.st.pressed ? ' pulsada (enclavada).' : ' desenclavada.'), c.st.pressed ? 'warn' : '');
                self.hooks.changed(false);
                return;
            }
            if (k === 'down') c.st.pressed = true;
            else if (k === 'key') { c.st.pressed = true; setTimeout(function () { c.st.pressed = false; }, 250); }
            else c.st.pressed = false;
        }, latch ? 'Seta de emergencia: pulsa para enclavarla y otra vez para soltarla (contacto NC 11-12)' : 'Pulsador ' + (cls === 'pbg' ? 'NA 13-14: cierra mientras se mantiene pulsado' : 'NC 11-12: abre mientras se mantiene pulsado'));
        el('circle', { cx: 55, cy: 72, r: latch ? 36 : 30, 'class': 'ap-pb-ring' + (latch ? ' e' : '') }, b);
        v.pbHead = el('g', null, b);
        el('circle', { cx: 55, cy: 70, r: latch ? 28 : 22, 'class': 'ap-pb ' + cls }, v.pbHead);
        if (sym) txt(v.pbHead, 55, 77, sym, 'ap-pb-t', { 'text-anchor': 'middle' });
        row(v, g, ids, lbls, [AUX, AUX], 30, 50, 130, false);
    }
    function frameApar(v, c, r) {
        var st = c.st;
        switch (c.type) {
            case 'ctl': {
                var on = st.on, sw = v.sw;
                sw.lever.setAttribute('transform', on ? 'translate(35,0)' : '');
                sw.lever.setAttribute('class', 'rocker-lever' + (on ? ' on' : ''));
                sw.t.setAttribute('transform', on ? 'translate(35,0)' : ''); sw.t.textContent = on ? 'I' : '0';
                v.lampOn.setAttribute('class', 'lamp green' + (on ? ' lit' : ''));
                break;
            }
            case 'qm':
                v.qLev.setAttribute('y', st.on ? 120 : 148); v.qLev.setAttribute('class', 'brk-lever' + (st.on ? ' on' : ''));
                v.qTxt.setAttribute('y', st.on ? 138 : 166); v.qTxt.textContent = st.on ? 'I' : 'O';
                v.inTxt.textContent = 'C' + st.In + ' · ' + st.In + ' A';
                break;
            case 'km':
                v.flag.setAttribute('class', 'ap-flag' + (st.closed ? ' on' : ''));
                v.flagT.textContent = st.closed ? 'I' : 'O';
                break;
            case 'fr':
                v.flag.setAttribute('class', 'ap-flag' + (st.tripped ? ' trip' : ''));
                v.flagT.textContent = st.tripped ? 'DISPARADO' : 'OK';
                v.irTxt.textContent = 'Ir = ' + f(st.Ir, 1) + ' A';
                break;
            case 'kt':
                v.ledU.setAttribute('class', 'lamp green' + (st.t > 0 ? ' lit' : ''));
                v.ledR.setAttribute('class', 'lamp amber' + (st.out ? ' lit' : ''));
                v.tTxt.textContent = st.t > 0 && !st.out ? f(st.t, 1) + ' / ' + f(st.T, 1) + ' s' : 't = ' + f(st.T, 1) + ' s';
                break;
            case 'pbno': case 'pbnc': case 'estop':
                v.pbHead.setAttribute('transform', st.pressed ? 'translate(55,71) scale(0.9) translate(-55,-71)' : '');
                v.pbHead.setAttribute('class', st.pressed ? 'pressed' : '');
                break;
            case 'sel': v.selH.setAttribute('transform', st.pressed ? 'rotate(45 55 74)' : 'rotate(-45 55 74)'); break;
            case 'lamp': {
                var b = r ? Math.max(0, Math.min(1.2, r.b)) : 0, k = Math.min(1, b * b);
                v.dome.setAttribute('opacity', (0.18 + 0.82 * k).toFixed(2));
                v.dome.style.filter = k > 0.2 ? 'drop-shadow(0 0 ' + (4 + 12 * k).toFixed(1) + 'px ' + v.domeCol + ')' : '';
                break;
            }
        }
    }

    /* ================= Plantillas ================= */
    FreeBench.TEMPLATES = [
        { id: 'empty', name: 'Lienzo vacío', data: { comps: [], cables: [], couplings: [] } },
        {
            id: 'dol', name: 'Arranque directo con contactor y relé térmico (sin cablear)', data: {
                comps: [
                    { id: 'c1', type: 'ac3', x: 0, y: 0 }, { id: 'c2', type: 'ctl', x: 460, y: 0 }, { id: 'c3', type: 'qm', x: 670, y: 0 },
                    { id: 'c4', type: 'km', x: 850, y: 0 }, { id: 'c5', type: 'fr', x: 1130, y: 0 },
                    { id: 'c6', type: 'pbnc', x: 460, y: 320 }, { id: 'c7', type: 'pbno', x: 600, y: 320 }, { id: 'c8', type: 'lamp', model: 'G', x: 740, y: 320 }, { id: 'c9', type: 'lamp', model: 'R', x: 880, y: 320 },
                    { id: 'c10', type: 'am', x: 1380, y: 0 }, { id: 'c11', type: 'im', model: 'M2', x: 1020, y: 320 }, { id: 'c12', type: 'dyno', x: 1560, y: 220 }
                ], cables: [], couplings: [{ a: 'c11', b: 'c12' }]
            }
        },
        {
            id: 'yd', name: 'Arranque estrella-triángulo automático (sin cablear)', data: {
                comps: [
                    { id: 'c1', type: 'ac3', x: 0, y: 0 }, { id: 'c2', type: 'ctl', x: 460, y: 0 }, { id: 'c3', type: 'qm', x: 670, y: 0 }, { id: 'c4', type: 'fr', x: 850, y: 0 },
                    { id: 'c5', type: 'km', x: 0, y: 400 }, { id: 'c6', type: 'km', x: 280, y: 400 }, { id: 'c7', type: 'km', x: 560, y: 400 }, { id: 'c8', type: 'kt', x: 840, y: 400 },
                    { id: 'c9', type: 'pbnc', x: 1100, y: 0 }, { id: 'c10', type: 'pbno', x: 1240, y: 0 }, { id: 'c11', type: 'am', x: 1380, y: 0 },
                    { id: 'c12', type: 'im', model: 'M1', x: 1050, y: 420 }, { id: 'c13', type: 'dyno', x: 1600, y: 340 }
                ], cables: [], couplings: [{ a: 'c12', b: 'c13' }]
            }
        },
        {
            id: 'ccalt', name: 'Motor de c.c. → alternador → red (sin cablear)', data: {
                comps: [
                    { id: 'c1', type: 'ac3', x: 0, y: 0 }, { id: 'c2', type: 'wm', x: 450, y: 0 }, { id: 'c3', type: 'wm', x: 700, y: 0 },
                    { id: 'c4', type: 'am', x: 950, y: 0 }, { id: 'c5', type: 'vm', x: 1135, y: 0 }, { id: 'c6', type: 'syncp', x: 1340, y: 0 },
                    { id: 'c7', type: 'dc2', x: 0, y: 440 }, { id: 'c8', type: 'dcm', model: 'CA', x: 460, y: 560 }, { id: 'c9', type: 'sm', model: 'S1', x: 1060, y: 560 },
                    { id: 'c10', type: 'exc', x: 1680, y: 0 }, { id: 'c11', type: 'adc', x: 0, y: 840 }, { id: 'c12', type: 'adc3', x: 210, y: 840 }
                ], cables: [], couplings: [{ a: 'c8', b: 'c9' }]
            }
        },
        {
            id: 'imdyn', name: 'Motor asíncrono → dinamo con carga (sin cablear)', data: {
                comps: [
                    { id: 'c1', type: 'ac3', x: 0, y: 0 }, { id: 'c2', type: 'wm', x: 450, y: 0 }, { id: 'c3', type: 'wm', x: 700, y: 0 },
                    { id: 'c4', type: 'am', x: 950, y: 0 }, { id: 'c5', type: 'vm', x: 1135, y: 0 },
                    { id: 'c6', type: 'im', model: 'M2', x: 0, y: 440 }, { id: 'c7', type: 'dcm', model: 'CA', x: 620, y: 440 },
                    { id: 'c8', type: 'dc2', x: 1330, y: 0 }, { id: 'c9', type: 'rdc', x: 620, y: 800 }, { id: 'c10', type: 'adc', x: 1300, y: 440 }, { id: 'c11', type: 'vdc', x: 1510, y: 440 },
                    { id: 'c12', type: 'rh', x: 1740, y: 400 }
                ], cables: [], couplings: [{ a: 'c6', b: 'c7' }]
            }
        },
        {
            id: 'trload', name: 'Transformador con carga (sin cablear)', data: {
                comps: [
                    { id: 'c1', type: 'ac3', x: 0, y: 0 }, { id: 'c2', type: 'wm', x: 450, y: 0 }, { id: 'c3', type: 'wm', x: 700, y: 0 },
                    { id: 'c4', type: 'am', x: 950, y: 0 }, { id: 'c5', type: 'vm', x: 1135, y: 0 },
                    { id: 'c6', type: 'tr', model: 'TA', x: 0, y: 420 }, { id: 'c7', type: 'rlc', x: 800, y: 440 }, { id: 'c8', type: 'am', x: 1330, y: 0 }, { id: 'c9', type: 'vm', x: 1515, y: 0 }
                ], cables: [], couplings: []
            }
        },
        {
            id: 'twoim', name: 'Dos máquinas asíncronas acopladas (motor y generador)', data: {
                comps: [
                    { id: 'c1', type: 'ac3', x: 0, y: 0 }, { id: 'c2', type: 'wm', x: 450, y: 0 }, { id: 'c3', type: 'wm', x: 700, y: 0 }, { id: 'c4', type: 'am', x: 950, y: 0 },
                    { id: 'c5', type: 'im', model: 'M1', x: 0, y: 440 }, { id: 'c6', type: 'im', model: 'M2', x: 620, y: 440 }, { id: 'c7', type: 'dyno', x: 1200, y: 400 }
                ], cables: [], couplings: [{ a: 'c5', b: 'c6' }]
            }
        }
    ];

    VEM.FreeBench = FreeBench;
    VEM.FreeGEO = GEO;
})();
