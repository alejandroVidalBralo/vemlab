/* =====================================================================
   VEMLAB · Banco de ensayos (SVG interactivo)
   Fuente trifásica regulable, vatímetros, amperímetro, voltímetro,
   polímetro, caja de bornes con puentes, motor, freno y panel de
   medida mecánica. El alumno tiende los cables pulsando bornes.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, W = VEM.W, el = W.el, txt = W.txt;

    var CABLE_COLORS = [
        { id: 'red', name: 'Rojo', c: '#d0312d' }, { id: 'black', name: 'Negro', c: '#24272c' },
        { id: 'blue', name: 'Azul', c: '#1f63c6' }, { id: 'yellow', name: 'Amarillo', c: '#e8b90c' },
        { id: 'green', name: 'Verde', c: '#2c9a4f' }, { id: 'brown', name: 'Marrón', c: '#80522a' },
        { id: 'grey', name: 'Gris', c: '#8c929b' }
    ];
    var COLOR = {}; CABLE_COLORS.forEach(function (c) { COLOR[c.id] = c.c; });

    var INFO = {
        'src.L1': 'Fuente · fase L1', 'src.L2': 'Fuente · fase L2', 'src.L3': 'Fuente · fase L3', 'src.N': 'Fuente · neutro N',
        'am.a': 'Amperímetro · borne A', 'am.b': 'Amperímetro · borne COM',
        'vm.a': 'Voltímetro · borne V', 'vm.b': 'Voltímetro · borne COM',
        'mm.a': 'Polímetro (óhmetro) · borne Ω', 'mm.b': 'Polímetro (óhmetro) · borne COM'
    };
    ['w1', 'w2'].forEach(function (w) {
        var N = w.toUpperCase();
        INFO[w + '.Ia'] = 'Vatímetro ' + N + ' · entrada de corriente I* (polaridad)';
        INFO[w + '.Ib'] = 'Vatímetro ' + N + ' · salida de corriente I';
        INFO[w + '.Ua'] = 'Vatímetro ' + N + ' · tensión U* (polaridad)';
        INFO[w + '.Ub'] = 'Vatímetro ' + N + ' · tensión U';
    });
    [['U', 'U'], ['V', 'V'], ['W', 'W']].forEach(function (b) {
        INFO['m.' + b[0] + '1'] = 'Motor · borne ' + b[0] + '1 (principio de la bobina ' + b[1] + ')';
        INFO['m.' + b[0] + '2'] = 'Motor · borne ' + b[0] + '2 (final de la bobina ' + b[1] + ')';
    });

    function Bench(svg, lab, hooks) {
        this.svg = svg; this.lab = lab; this.hooks = hooks;
        this.pos = {};
        this.color = 'red';
        this.sel = -1;
        this.pending = null;
        this.phase = 0;
        this.history = [];
        this.build();
        this.bindWiring();
    }
    Bench.COLORS = CABLE_COLORS;
    Bench.INFO = INFO;

    /* ================= Construcción ================= */
    Bench.prototype.build = function () {
        var svg = this.svg, self = this;
        svg.setAttribute('viewBox', '0 0 1500 900');
        svg.innerHTML = '';
        this.defs(svg);
        /* fondo */
        el('rect', { x: 0, y: 0, width: 1500, height: 372, 'class': 'wall' }, svg);
        el('rect', { x: 0, y: 372, width: 1500, height: 528, fill: 'url(#gBench)' }, svg);
        el('rect', { x: 0, y: 368, width: 1500, height: 8, 'class': 'bench-edge' }, svg);
        this.gDev = el('g', null, svg);
        this.buildSource(this.gDev);
        this.buildWattmeter(this.gDev, 'w1', 'W1', 460);
        this.buildWattmeter(this.gDev, 'w2', 'W2', 705);
        this.buildMeter(this.gDev, 'am', 950, 'AMPERÍMETRO', 'A', 'A', '20 A ~', 'red');
        this.buildMeter(this.gDev, 'vm', 1130, 'VOLTÍMETRO', 'V', 'V', '600 V ~', 'green');
        this.buildMultimeter(this.gDev, 1310);
        this.buildMotor(this.gDev);
        this.buildBox(this.gDev);
        this.buildBrakePanel(this.gDev);
        this.gCables = el('g', { 'class': 'cables' }, svg);
        this.gTemp = el('g', { 'class': 'cable-temp' }, svg);
        /* bornes por encima de los cables para poder pinchar siempre */
        this.gHot = el('g', { 'class': 'hot' }, svg);
        Object.keys(this.pos).forEach(function (id) {
            var p = self.pos[id];
            var c = el('circle', { cx: p.x, cy: p.y, r: p.r || 17, 'class': 'term-hit', 'data-term': id }, self.gHot);
            W.title(c, INFO[id] || id);
        });
        this.renderBridges();
        this.renderCables();
    };

    Bench.prototype.defs = function (svg) {
        var d = el('defs', null, svg);
        function lin(id, stops, vertical) {
            var g = el('linearGradient', { id: id, x1: 0, y1: 0, x2: vertical === false ? 1 : 0, y2: vertical === false ? 0 : 1 }, d);
            stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
        }
        function rad(id, stops, cx, cy) {
            var g = el('radialGradient', { id: id, cx: cx || 0.4, cy: cy || 0.35, r: 0.75 }, d);
            stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
        }
        lin('gHousing', [[0, '#434a54'], [0.08, '#353b44'], [1, '#1e2228']]);
        lin('gPanel', [[0, '#eceeeb'], [1, '#c8cbc6']]);
        lin('gBench', [[0, '#7c8590'], [0.03, '#9aa2ab'], [1, '#6f7781']]);
        lin('gMotor', [[0, '#18334f'], [0.18, '#3f74a8'], [0.32, '#6a9bcb'], [0.5, '#2f5f8f'], [1, '#132a42']]);
        lin('gMotorDark', [[0, '#14283d'], [0.3, '#2c5481'], [1, '#10233a']]);
        lin('gSteel', [[0, '#dfe3e8'], [0.5, '#9ca4ae'], [1, '#626a74']]);
        lin('gShaft', [[0, '#f4f6f8'], [0.35, '#c3c9d0'], [1, '#5c636b']]);
        lin('gBrake', [[0, '#2c3036'], [0.2, '#6b7179'], [0.35, '#8e949c'], [0.6, '#4a4f56'], [1, '#202327']]);
        lin('gCoupling', [[0, '#3a2b0e'], [0.25, '#d2a43c'], [0.45, '#f2d58a'], [0.7, '#a77a22'], [1, '#3b2a08']]);
        lin('gBrass', [[0, '#fbe7a6'], [0.5, '#c9973a'], [1, '#7d5714']]);
        lin('gCopper', [[0, '#f6c08e'], [0.5, '#c46d2f'], [1, '#7b3b12']]);
        lin('gBoxIn', [[0, '#2b3036'], [1, '#1b1e22']]);
        lin('gLcd', [[0, '#c9d6b3'], [1, '#a7b78f']]);
        lin('gPlate', [[0, '#f1f2ef'], [1, '#c9ccc6']]);
        rad('gKnob', [[0, '#5a5f66'], [1, '#121417']]);
        rad('gKnobTop', [[0, '#8a9099'], [0.6, '#3a3f46'], [1, '#202328']]);
        rad('gStop', [[0, '#ff6b5e'], [0.6, '#d0231b'], [1, '#7c0d08']]);
        rad('gHole', [[0, '#000'], [1, '#2a2d31']], 0.5, 0.5);
        var f = el('filter', { id: 'fShadow', x: '-10%', y: '-10%', width: '130%', height: '140%' }, d);
        el('feDropShadow', { dx: 0, dy: 3, stdDeviation: 3, 'flood-color': '#000', 'flood-opacity': 0.35 }, f);
        var cp = el('clipPath', { id: 'cpCoupling' }, d);
        el('rect', { x: 885, y: 562, width: 60, height: 76, rx: 6 }, cp);
        var cp2 = el('clipPath', { id: 'cpBrake' }, d);
        el('rect', { x: 948, y: 520, width: 186, height: 170, rx: 14 }, cp2);
    };

    /* Borne tipo hembra de seguridad 4 mm */
    Bench.prototype.socket = function (g, id, x, y, color, label, dy) {
        this.pos[id] = { x: x, y: y };
        el('circle', { cx: x, cy: y + 1.5, r: 13, 'class': 'sock-shadow' }, g);
        el('circle', { cx: x, cy: y, r: 12.5, fill: color, 'class': 'sock-ring' }, g);
        el('circle', { cx: x, cy: y, r: 6.5, fill: 'url(#gHole)', 'class': 'sock-hole' }, g);
        el('circle', { cx: x, cy: y, r: 2.4, 'class': 'sock-pin' }, g);
        if (label) txt(g, x, y + (dy || 29), label, 'sock-lbl', { 'text-anchor': 'middle' });
    };

    Bench.prototype.lamp = function (g, x, y, cls) {
        el('circle', { cx: x, cy: y, r: 9, 'class': 'lamp-rim' }, g);
        return el('circle', { cx: x, cy: y, r: 6.5, 'class': 'lamp ' + cls }, g);
    };

    /* ---------------- Fuente ---------------- */
    Bench.prototype.buildSource = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev src', filter: 'url(#fShadow)' }, p);
        el('rect', { x: 20, y: 20, width: 420, height: 335, rx: 10, fill: 'url(#gPanel)', 'class': 'panel-light' }, g);
        el('rect', { x: 20, y: 20, width: 420, height: 38, rx: 10, 'class': 'panel-band' }, g);
        el('rect', { x: 20, y: 46, width: 420, height: 12, 'class': 'panel-band' }, g);
        txt(g, 36, 44, 'FUENTE TRIFÁSICA REGULABLE', 'dev-title light');
        txt(g, 424, 44, '0–440 V · 50 Hz · 16 A', 'dev-sub light', { 'text-anchor': 'end' });
        /* tornillos */
        [[32, 70], [428, 70], [32, 343], [428, 343]].forEach(function (s) { el('circle', { cx: s[0], cy: s[1], r: 3.5, 'class': 'screw' }, g); });

        /* magnetotérmico Q1 */
        var q = this.qGroup = el('g', { 'class': 'breaker', tabindex: 0, role: 'switch', 'aria-label': 'Interruptor magnetotérmico Q1' }, g);
        el('rect', { x: 48, y: 74, width: 76, height: 122, rx: 5, 'class': 'brk-body' }, q);
        el('rect', { x: 48, y: 74, width: 76, height: 14, rx: 3, 'class': 'brk-top' }, q);
        txt(q, 86, 85, 'Q1 · C16', 'brk-txt', { 'text-anchor': 'middle' });
        el('rect', { x: 66, y: 104, width: 40, height: 64, rx: 4, 'class': 'brk-slot' }, q);
        this.qLever = el('rect', { x: 70, y: 108, width: 32, height: 28, rx: 3, 'class': 'brk-lever' }, q);
        this.qLeverTxt = txt(q, 86, 127, 'O', 'brk-lever-txt', { 'text-anchor': 'middle' });
        txt(q, 86, 186, 'I ON / O OFF', 'brk-txt', { 'text-anchor': 'middle' });
        W.title(q, 'Interruptor magnetotérmico Q1 (pulsa para conectar / desconectar)');
        function toggle() {
            if (lab.on) { lab.switchOff(); self.hooks.log('Interruptor Q1 abierto: fuente desconectada.'); }
            else if (lab.switchOn()) self.hooks.log('Interruptor Q1 cerrado: fuente conectada a ' + Math.round(lab.variac * VEM.Lab.U_MAX) + ' V.');
            self.hooks.changed(false);
        }
        q.addEventListener('pointerdown', function (e) { e.stopPropagation(); toggle(); });
        q.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });

        /* pilotos */
        this.lampOn = this.lamp(g, 58, 218, 'green');
        this.lampTrip = this.lamp(g, 116, 218, 'red');
        txt(g, 58, 240, 'RED', 'mini-lbl', { 'text-anchor': 'middle' });
        txt(g, 116, 240, 'DISPARO', 'mini-lbl', { 'text-anchor': 'middle' });

        /* parada de emergencia */
        var es = el('g', { 'class': 'estop', tabindex: 0, role: 'button', 'aria-label': 'Parada de emergencia' }, g);
        el('circle', { cx: 86, cy: 292, r: 34, 'class': 'estop-base' }, es);
        el('circle', { cx: 86, cy: 292, r: 23, fill: 'url(#gStop)', 'class': 'estop-head' }, es);
        txt(g, 86, 342, 'PARADA EMERG.', 'mini-lbl', { 'text-anchor': 'middle' });
        W.title(es, 'Seta de parada de emergencia');
        function estop(e) { if (e) e.stopPropagation(); if (lab.on) { lab.switchOff(); self.hooks.log('Parada de emergencia pulsada.', 'warn'); self.hooks.changed(false); } }
        es.addEventListener('pointerdown', estop);
        es.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); estop(); } });

        /* display de tensión */
        el('rect', { x: 160, y: 70, width: 262, height: 66, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: 166, y: 76, width: 250, height: 54, rx: 3, 'class': 'lcd-led' }, g);
        txt(g, 176, 94, 'U', 'disp-lbl amber');
        txt(g, 176, 108, 'L1-L2', 'disp-lbl-s amber');
        this.dSrc = new W.SevenSeg(g, 250, 85, 4, 36, 'amber');
        txt(g, 404, 121, 'V', 'disp-unit amber', { 'text-anchor': 'end' });

        /* autotransformador */
        var ticks = []; for (var v = 0; v <= 440; v += 20) ticks.push(v);
        this.kVariac = new W.Knob(g, {
            cx: 292, cy: 236, r: 44, min: 0, max: 440, value: lab.variac * 440, step: 1, sweep: 280,
            ticks: ticks, major: 5, fmt: function (v) { return String(v); }, label: 'Autotransformador: tensión de salida',
            onChange: function (v) { lab.variac = v / 440; self.hooks.changed(false); }
        });
        txt(g, 292, 300, 'AUTOTRANSFORMADOR', 'mini-lbl', { 'text-anchor': 'middle' });
        W.PushButton(g, 168, 270, 30, 24, '−', function () { self.kVariac.set(self.kVariac.value - 1, true); }, 'small', true);
        W.PushButton(g, 386, 270, 30, 24, '+', function () { self.kVariac.set(self.kVariac.value + 1, true); }, 'small', true);

        /* bornes de salida */
        var cols = [['src.L1', '#7b4a24', 'L1'], ['src.L2', '#1d1f22', 'L2'], ['src.L3', '#8a9097', 'L3'], ['src.N', '#1f5fbf', 'N']];
        el('rect', { x: 160, y: 309, width: 262, height: 40, rx: 6, 'class': 'sock-strip' }, g);
        cols.forEach(function (c, i) { self.socket(g, c[0], 190 + i * 68, 324, c[1], null); txt(g, 212 + i * 68, 329, c[2], 'sock-lbl strong'); });
    };

    /* ---------------- Vatímetro ---------------- */
    Bench.prototype.housing = function (g, x, w, name, sub) {
        el('rect', { x: x, y: 20, width: w, height: 335, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 26, width: w - 12, height: 323, rx: 7, 'class': 'housing-inner' }, g);
        txt(g, x + 16, 48, name, 'dev-title');
        if (sub) txt(g, x + w - 14, 48, sub, 'dev-sub', { 'text-anchor': 'end' });
    };
    Bench.prototype.buildWattmeter = function (p, id, name, x) {
        var g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), w = 230;
        this.housing(g, x, w, 'VATÍMETRO ' + name, 'digital');
        el('rect', { x: x + 15, y: 62, width: w - 30, height: 92, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: x + 21, y: 68, width: w - 42, height: 80, rx: 3, 'class': 'lcd-led' }, g);
        this['d' + id] = new W.SevenSeg(g, x + 34, 84, 6, 36, 'red');
        txt(g, x + w - 30, 140, 'W', 'disp-unit red', { 'text-anchor': 'end' });
        txt(g, x + 30, 140, 'P', 'disp-lbl-s red');
        txt(g, x + w / 2, 180, '20 A · 600 V · cos φ 0–1', 'spec', { 'text-anchor': 'middle' });
        /* esquema del vatímetro */
        var sx = x + 30;
        el('path', { d: 'M' + (sx + 10) + ',214 h40 M' + (sx + 120) + ',203 v22', 'class': 'mini-sch' }, g);
        el('rect', { x: sx + 18, y: 209, width: 24, height: 10, rx: 2, 'class': 'mini-coil' }, g);
        el('circle', { cx: sx + 120, cy: 214, r: 9, 'class': 'mini-coil' }, g);
        txt(g, sx + 30, 240, 'CORRIENTE', 'mini-lbl', { 'text-anchor': 'middle' });
        txt(g, sx + 120, 240, 'TENSIÓN', 'mini-lbl', { 'text-anchor': 'middle' });
        el('rect', { x: x + 15, y: 252, width: w - 30, height: 88, rx: 6, 'class': 'sock-strip' }, g);
        this.socket(g, id + '.Ia', x + 45, 282, '#d0312d', 'I*');
        this.socket(g, id + '.Ib', x + 95, 282, '#1d1f22', 'I');
        this.socket(g, id + '.Ua', x + 140, 282, '#d0312d', 'U*');
        this.socket(g, id + '.Ub', x + 190, 282, '#1d1f22', 'U');
        el('line', { x1: x + 117, y1: 262, x2: x + 117, y2: 330, 'class': 'sep' }, g);
    };

    Bench.prototype.buildMeter = function (p, id, x, name, sym, unit, spec, color) {
        var g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), w = 165;
        this.housing(g, x, w, name, null);
        el('rect', { x: x + 13, y: 62, width: w - 26, height: 92, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: x + 19, y: 68, width: w - 38, height: 80, rx: 3, 'class': 'lcd-led' }, g);
        this['d' + id] = new W.SevenSeg(g, x + 27, 88, 5, 30, color);
        txt(g, x + w - 28, 140, unit + ' ~', 'disp-unit ' + color, { 'text-anchor': 'end' });
        txt(g, x + w / 2, 180, spec, 'spec', { 'text-anchor': 'middle' });
        el('circle', { cx: x + w / 2, cy: 214, r: 16, 'class': 'mini-coil' }, g);
        txt(g, x + w / 2, 220, sym, 'mini-sym', { 'text-anchor': 'middle' });
        el('rect', { x: x + 13, y: 252, width: w - 26, height: 88, rx: 6, 'class': 'sock-strip' }, g);
        this.socket(g, id + '.a', x + 50, 282, '#d0312d', sym);
        this.socket(g, id + '.b', x + 115, 282, '#1d1f22', 'COM');
    };

    Bench.prototype.buildMultimeter = function (p, x) {
        var g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), w = 170;
        el('rect', { x: x, y: 20, width: w, height: 335, rx: 16, 'class': 'mm-body' }, g);
        el('rect', { x: x + 8, y: 28, width: w - 16, height: 319, rx: 12, 'class': 'mm-face' }, g);
        txt(g, x + 20, 50, 'POLÍMETRO', 'dev-title');
        el('rect', { x: x + 18, y: 62, width: w - 36, height: 92, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: x + 23, y: 67, width: w - 46, height: 82, rx: 3, fill: 'url(#gLcd)' }, g);
        this.dmm = new W.SevenSeg(g, x + 30, 84, 5, 30, 'lcd');
        this.mmUnit = txt(g, x + w - 28, 142, 'Ω', 'disp-unit lcd', { 'text-anchor': 'end' });
        /* selector (fijo en Ω) */
        el('circle', { cx: x + w / 2, cy: 205, r: 28, 'class': 'mm-dial' }, g);
        el('line', { x1: x + w / 2, y1: 205, x2: x + w / 2 + 20, y2: 190, 'class': 'mm-ptr' }, g);
        txt(g, x + w / 2 - 44, 192, 'V~', 'mini-lbl', { 'text-anchor': 'middle' });
        txt(g, x + w / 2 + 40, 182, 'Ω', 'mini-lbl on', { 'text-anchor': 'middle' });
        txt(g, x + w / 2 + 44, 228, 'OFF', 'mini-lbl', { 'text-anchor': 'middle' });
        txt(g, x + w / 2, 247, 'Mide sin tensión', 'spec', { 'text-anchor': 'middle' });
        el('rect', { x: x + 18, y: 256, width: w - 36, height: 84, rx: 6, 'class': 'sock-strip' }, g);
        this.socket(g, 'mm.a', x + 55, 284, '#d0312d', 'Ω');
        this.socket(g, 'mm.b', x + 115, 284, '#1d1f22', 'COM');
    };

    /* ---------------- Motor, acoplamiento y freno ---------------- */
    Bench.prototype.buildMotor = function (p) {
        var g = el('g', { 'class': 'machine' }, p), self = this;
        /* bancada */
        el('rect', { x: 466, y: 762, width: 690, height: 30, rx: 4, fill: 'url(#gSteel)', 'class': 'base' }, g);
        el('rect', { x: 466, y: 792, width: 690, height: 10, 'class': 'base-shadow' }, g);
        this.gMot = el('g', null, g);
        var m = this.gMot;
        /* patas */
        el('path', { d: 'M585,700 h50 l8,62 h-66 z M760,700 h50 l8,62 h-66 z', fill: 'url(#gMotorDark)', 'class': 'mot-edge' }, m);
        /* tapa del ventilador */
        el('rect', { x: 478, y: 522, width: 72, height: 156, rx: 22, fill: 'url(#gMotorDark)', 'class': 'mot-edge' }, m);
        for (var i = 0; i < 9; i++) el('line', { x1: 490, y1: 540 + i * 15, x2: 538, y2: 540 + i * 15, 'class': 'vent' }, m);
        /* carcasa con aletas */
        el('rect', { x: 548, y: 505, width: 282, height: 196, rx: 10, fill: 'url(#gMotor)', 'class': 'mot-edge' }, m);
        for (i = 0; i < 15; i++) el('line', { x1: 566, y1: 515 + i * 12.6, x2: 812, y2: 515 + i * 12.6, 'class': 'fin' }, m);
        el('rect', { x: 548, y: 505, width: 18, height: 196, rx: 6, fill: 'url(#gMotorDark)' }, m);
        el('rect', { x: 812, y: 505, width: 18, height: 196, rx: 6, fill: 'url(#gMotorDark)' }, m);
        /* caja de bornes */
        el('rect', { x: 640, y: 466, width: 104, height: 42, rx: 5, fill: 'url(#gMotorDark)', 'class': 'mot-edge' }, m);
        el('rect', { x: 648, y: 472, width: 88, height: 30, rx: 3, 'class': 'tbox-lid' }, m);
        [[653, 477], [731, 477], [653, 497], [731, 497]].forEach(function (s) { el('circle', { cx: s[0], cy: s[1], r: 2.4, 'class': 'screw' }, m); });
        /* placa de características */
        el('rect', { x: 592, y: 560, width: 196, height: 96, rx: 4, fill: 'url(#gPlate)', 'class': 'plate' }, m);
        this.plateTxt = el('g', { 'class': 'plate-txt' }, m);
        /* eje */
        el('rect', { x: 830, y: 589, width: 58, height: 22, fill: 'url(#gShaft)', 'class': 'shaft' }, g);
        /* acoplamiento */
        el('rect', { x: 885, y: 562, width: 60, height: 76, rx: 6, fill: 'url(#gCoupling)', 'class': 'coupling' }, g);
        this.gMarks = el('g', { 'clip-path': 'url(#cpCoupling)' }, g);
        this.marks = [];
        for (i = 0; i < 6; i++) this.marks.push(el('rect', { x: 885, y: 598, width: 60, height: 5, 'class': 'cmark' }, this.gMarks));
        el('rect', { x: 885, y: 562, width: 60, height: 76, rx: 6, 'class': 'coupling-gloss' }, g);
        /* freno */
        el('path', { d: 'M965,690 h150 l14,72 h-178 z', fill: 'url(#gBrake)', 'class': 'mot-edge' }, g);
        el('rect', { x: 948, y: 520, width: 186, height: 170, rx: 14, fill: 'url(#gBrake)', 'class': 'mot-edge' }, g);
        this.gBMarks = el('g', { 'clip-path': 'url(#cpBrake)' }, g);
        this.bmarks = [];
        for (i = 0; i < 10; i++) this.bmarks.push(el('rect', { x: 960, y: 600, width: 3, height: 170, 'class': 'bmark' }, this.gBMarks));
        for (i = 0; i < 9; i++) el('line', { x1: 965 + i * 19, y1: 526, x2: 965 + i * 19, y2: 684, 'class': 'rib' }, g);
        el('rect', { x: 990, y: 588, width: 104, height: 26, rx: 4, 'class': 'brake-label' }, g);
        txt(g, 1042, 606, 'FRENO', 'brake-txt', { 'text-anchor': 'middle' });
        /* célula de carga */
        el('rect', { x: 1134, y: 652, width: 22, height: 30, rx: 3, 'class': 'loadcell' }, g);
        el('path', { d: 'M1156,667 C1162,667 1164,690 1172,690', 'class': 'wire-deco' }, g);
        /* pasador de bloqueo */
        this.gLock = el('g', { 'class': 'lockpin' }, g);
        el('rect', { x: 906, y: 470, width: 18, height: 100, rx: 3, 'class': 'pin' }, this.gLock);
        el('rect', { x: 896, y: 462, width: 38, height: 16, rx: 5, 'class': 'pin-handle' }, this.gLock);
        el('rect', { x: 892, y: 528, width: 46, height: 10, rx: 2, 'class': 'pin-guide' }, g);
        /* línea de llamada a la caja de bornes ampliada */
        el('path', { d: 'M640,470 L452,398 M640,506 L452,798', 'class': 'callout' }, g);
        this.setPlate();
    };

    Bench.prototype.setPlate = function () {
        var P = this.lab.P, pl = P.plate, g = this.plateTxt, f = VEM.fmtN;
        g.innerHTML = '';
        var y = 575, x = 601, x2 = 779;
        txt(g, x, y, 'Mot. 3~  ' + P.code, 'pl-h'); txt(g, x2, y, P.name, 'pl-h', { 'text-anchor': 'end' }); y += 16;
        txt(g, x, y, f(pl.Pn / 1000, 1) + ' kW', 'pl'); txt(g, x2, y, pl.f + ' Hz · S1', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'Δ ' + pl.Ud + ' V', 'pl'); txt(g, x2, y, f(pl.Id, 1) + ' A', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'Y ' + pl.Uy + ' V', 'pl'); txt(g, x2, y, f(pl.Iy, 2) + ' A', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, pl.n + ' min⁻¹', 'pl'); txt(g, x2, y, 'cos φ ' + f(pl.cos, 2), 'pl', { 'text-anchor': 'end' });
    };

    /* ---------------- Caja de bornes ampliada ---------------- */
    var STUDS = { 'm.U1': [135, 520, 'U1'], 'm.V1': [240, 520, 'V1'], 'm.W1': [345, 520, 'W1'], 'm.W2': [135, 660, 'W2'], 'm.U2': [240, 660, 'U2'], 'm.V2': [345, 660, 'V2'] };
    var SLOT = {
        'U1-W2': { x: 135, y: 590, v: true }, 'V1-U2': { x: 240, y: 590, v: true }, 'W1-V2': { x: 345, y: 590, v: true },
        'W2-U2': { x: 187.5, y: 660, v: false }, 'U2-V2': { x: 292.5, y: 660, v: false }
    };

    Bench.prototype.buildBox = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'tbox', filter: 'url(#fShadow)' }, p);
        el('rect', { x: 30, y: 396, width: 420, height: 402, rx: 14, fill: 'url(#gMotorDark)', 'class': 'mot-edge' }, g);
        el('rect', { x: 46, y: 440, width: 388, height: 300, rx: 8, fill: 'url(#gBoxIn)', 'class': 'box-in' }, g);
        txt(g, 48, 425, 'CAJA DE BORNES', 'dev-title');
        txt(g, 432, 425, 'vista ampliada', 'dev-sub', { 'text-anchor': 'end' });
        /* zócalo aislante */
        el('rect', { x: 84, y: 470, width: 312, height: 240, rx: 10, 'class': 'box-base' }, g);
        /* ranuras de puente (huecos clicables) */
        this.gSlots = el('g', null, g);
        Object.keys(SLOT).forEach(function (k) {
            var s = SLOT[k];
            var r = s.v ? { x: s.x - 15, y: s.y - 46, width: 30, height: 92 } : { x: s.x - 30, y: s.y - 15, width: 60, height: 30 };
            var slot = el('rect', Object.assign({ rx: 6, 'class': 'slot', 'data-bridge': k, tabindex: 0, role: 'button', 'aria-label': 'Puente ' + k }, r), self.gSlots);
            W.title(slot, 'Poner / quitar puente ' + k.replace('-', '–'));
            function tog(e) { if (e) e.stopPropagation(); self.toggleBridge(k); }
            slot.addEventListener('pointerdown', function (e) { if (e.button === 0) tog(e); });
            slot.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
        });
        this.gBridges = el('g', { 'class': 'bridges' }, g);
        /* espárragos */
        this.gStuds = el('g', null, g);
        Object.keys(STUDS).forEach(function (id) {
            var s = STUDS[id];
            self.pos[id] = { x: s[0], y: s[1], r: 20 };
            txt(g, s[0], s[1] + (s[1] < 600 ? -30 : 44), s[2], 'stud-lbl', { 'text-anchor': 'middle' });
        });
        this.drawStuds();
        /* botones rápidos */
        var by = 752;
        W.PushButton(g, 58, by, 116, 30, 'Estrella  Y', function () { self.setBridges('Y'); }, 'tool');
        W.PushButton(g, 182, by, 116, 30, 'Triángulo  Δ', function () { self.setBridges('D'); }, 'tool');
        W.PushButton(g, 306, by, 128, 30, 'Quitar puentes', function () { self.setBridges(null); }, 'tool');
        txt(g, 240, 732, 'Bobinas: U1–U2 · V1–V2 · W1–W2   (pulsa entre bornes para poner o quitar un puente)', 'box-hint', { 'text-anchor': 'middle' });
    };

    Bench.prototype.drawStuds = function () {
        var g = this.gStuds; g.innerHTML = '';
        Object.keys(STUDS).forEach(function (id) {
            var s = STUDS[id], x = s[0], y = s[1], hex = [];
            for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; hex.push((x + 17 * Math.cos(a)).toFixed(1) + ',' + (y + 17 * Math.sin(a)).toFixed(1)); }
            el('circle', { cx: x, cy: y + 2, r: 21, 'class': 'sock-shadow' }, g);
            el('polygon', { points: hex.join(' '), fill: 'url(#gBrass)', 'class': 'nut' }, g);
            el('circle', { cx: x, cy: y, r: 8, fill: 'url(#gBrass)', 'class': 'stud' }, g);
            el('circle', { cx: x, cy: y, r: 3, 'class': 'stud-hole' }, g);
        });
    };

    Bench.prototype.renderBridges = function () {
        var g = this.gBridges, br = this.lab.bridges;
        g.innerHTML = '';
        Object.keys(SLOT).forEach(function (k) {
            if (!br[k]) return;
            var s = SLOT[k], a = STUDS['m.' + k.split('-')[0]], b = STUDS['m.' + k.split('-')[1]];
            var x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
            var r = s.v ? { x: x0 - 13, y: y0 - 13, width: 26, height: Math.abs(b[1] - a[1]) + 26 } : { x: x0 - 13, y: y0 - 13, width: Math.abs(b[0] - a[0]) + 26, height: 26 };
            el('rect', Object.assign({ rx: 7, fill: 'url(#gCopper)', 'class': 'bridge' }, r), g);
        });
        this.gSlots.querySelectorAll('.slot').forEach(function (s) { s.classList.toggle('on', !!br[s.getAttribute('data-bridge')]); });
    };

    /* ---------------- Panel del freno ---------------- */
    Bench.prototype.buildBrakePanel = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), x = 1172, w = 308;
        el('rect', { x: x, y: 396, width: w, height: 480, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 402, width: w - 12, height: 468, rx: 7, 'class': 'housing-inner' }, g);
        txt(g, x + 16, 426, 'FRENO · MEDIDA MECÁNICA', 'dev-title');
        /* par */
        el('rect', { x: x + 16, y: 440, width: w - 32, height: 78, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: x + 22, y: 446, width: w - 44, height: 66, rx: 3, 'class': 'lcd-led' }, g);
        txt(g, x + 32, 466, 'PAR', 'disp-lbl amber'); txt(g, x + 32, 480, 'T', 'disp-lbl-s amber');
        this.dT = new W.SevenSeg(g, x + 98, 458, 5, 34, 'amber');
        txt(g, x + w - 30, 504, 'N·m', 'disp-unit amber', { 'text-anchor': 'end' });
        /* velocidad */
        el('rect', { x: x + 16, y: 528, width: w - 32, height: 78, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: x + 22, y: 534, width: w - 44, height: 66, rx: 3, 'class': 'lcd-led' }, g);
        txt(g, x + 32, 554, 'VELOC.', 'disp-lbl green'); txt(g, x + 32, 568, 'n', 'disp-lbl-s green');
        this.dN = new W.SevenSeg(g, x + 98, 546, 5, 34, 'green');
        txt(g, x + w - 30, 592, 'min⁻¹', 'disp-unit green', { 'text-anchor': 'end' });
        /* sentido de giro */
        this.ledCW = this.lamp(g, x + 36, 628, 'green');
        txt(g, x + 52, 632, 'horario', 'mini-lbl', { 'text-anchor': 'start' });
        this.ledCCW = this.lamp(g, x + 146, 628, 'amber');
        txt(g, x + 162, 632, 'antihorario', 'mini-lbl', { 'text-anchor': 'start' });
        /* consigna de par */
        this.Tmax = 1;
        this.gBrakeKnob = el('g', null, g);
        this.buildBrakeKnob();
        /* bloqueo */
        var lk = this.gLockSw = el('g', { 'class': 'locksw', tabindex: 0, role: 'switch', 'aria-label': 'Bloqueo del rotor' }, g);
        el('rect', { x: x + 212, y: 664, width: 70, height: 110, rx: 8, 'class': 'lock-body' }, lk);
        this.lockLever = el('rect', { x: x + 228, y: 676, width: 38, height: 44, rx: 6, 'class': 'lock-lever' }, lk);
        this.lockTxt = txt(lk, x + 247, 703, 'LIBRE', 'lock-txt', { 'text-anchor': 'middle' });
        txt(g, x + 247, 792, 'BLOQUEO', 'mini-lbl', { 'text-anchor': 'middle' });
        txt(g, x + 247, 805, 'DEL ROTOR', 'mini-lbl', { 'text-anchor': 'middle' });
        W.title(lk, 'Bloqueo del rotor (solo con el motor parado)');
        function tl(e) {
            if (e) e.stopPropagation();
            if (!lab.locked && Math.abs(lab.w) > 0.5) { self.hooks.toast('Espera a que el motor se pare antes de bloquear el rotor (puedes frenarlo con la consigna de par).', 'warn'); return; }
            lab.locked = !lab.locked;
            self.hooks.log(lab.locked ? 'Rotor bloqueado.' : 'Rotor desbloqueado.');
            self.hooks.changed(false);
        }
        lk.addEventListener('pointerdown', function (e) { if (e.button === 0) tl(e); });
        lk.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tl(); } });
        /* temperatura de devanados */
        txt(g, x + 16, 838, 'TEMPERATURA DEVANADOS (PTC)', 'mini-lbl');
        this.thLeds = [];
        for (var i = 0; i < 12; i++) this.thLeds.push(el('rect', { x: x + 16 + i * 23, y: 846, width: 19, height: 12, rx: 2, 'class': 'th-led ' + (i < 7 ? 'g' : i < 10 ? 'a' : 'r') }, g));
    };

    Bench.prototype.buildBrakeKnob = function () {
        var self = this, lab = this.lab, g = this.gBrakeKnob, x = 1172;
        g.innerHTML = '';
        var Tn = lab.P.plate.Tn, step = Tn > 20 ? 10 : 5, Tmax = Math.ceil(2 * Tn / step) * step;
        this.Tmax = Tmax;
        var ticks = []; for (var v = 0; v <= Tmax + 1e-9; v += step / 5) ticks.push(+v.toFixed(3));
        lab.brake = Math.min(lab.brake, Tmax);
        this.kBrake = new W.Knob(g, {
            cx: x + 96, cy: 726, r: 38, min: 0, max: Tmax, value: lab.brake, step: 0.05, sweep: 280,
            ticks: ticks, major: 5, fmt: function (v) { return String(Math.round(v)); }, label: 'Consigna de par del freno',
            onChange: function (v) { lab.brake = v; self.hooks.changed(false); }
        });
        txt(g, x + 96, 805, 'CONSIGNA DE PAR', 'mini-lbl', { 'text-anchor': 'middle' });
        W.PushButton(g, x + 20, 784, 28, 22, '−', function () { self.kBrake.set(self.kBrake.value - 0.1, true); }, 'small', true);
        W.PushButton(g, x + 144, 784, 28, 22, '+', function () { self.kBrake.set(self.kBrake.value + 0.1, true); }, 'small', true);
    };

    /* ================= Cableado ================= */
    Bench.prototype.cablePath = function (a, b) {
        var dx = b.x - a.x, dy = b.y - a.y, dist = Math.sqrt(dx * dx + dy * dy);
        var sag = 26 + dist * 0.22;
        return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx * 0.12) + ',' + (a.y + sag) + ' ' + (b.x - dx * 0.12) + ',' + (b.y + sag) + ' ' + b.x + ',' + b.y;
    };

    Bench.prototype.renderCables = function () {
        var self = this, g = this.gCables;
        g.innerHTML = '';
        this.lab.cables.forEach(function (c, i) {
            var a = self.pos[c.a], b = self.pos[c.b];
            if (!a || !b) return;
            var d = self.cablePath(a, b), col = COLOR[c.color] || COLOR.red;
            var cg = el('g', { 'class': 'cable' + (i === self.sel ? ' sel' : ''), 'data-i': i }, g);
            el('path', { d: d, 'class': 'cable-shadow' }, cg);
            el('path', { d: d, stroke: col, 'class': 'cable-core' }, cg);
            el('path', { d: d, 'class': 'cable-gloss' }, cg);
            [a, b].forEach(function (p) {
                el('circle', { cx: p.x, cy: p.y, r: 9.5, fill: col, 'class': 'plug' }, cg);
                el('circle', { cx: p.x - 2.5, cy: p.y - 2.5, r: 3, 'class': 'plug-gloss' }, cg);
            });
            var hit = el('path', { d: d, 'class': 'cable-hit' }, cg);
            W.title(hit, (INFO[c.a] || c.a) + '  ⟷  ' + (INFO[c.b] || c.b) + '\n(clic: seleccionar · doble clic o Supr: quitar)');
            hit.addEventListener('pointerdown', function (e) {
                if (e.button !== 0 || self.pending) return;
                e.stopPropagation();
                self.select(i);
            });
            hit.addEventListener('dblclick', function (e) { e.stopPropagation(); self.removeCable(i); });
            hit.addEventListener('contextmenu', function (e) { e.preventDefault(); self.removeCable(i); });
        });
        if (this.hooks.selection) this.hooks.selection(this.sel);
    };

    Bench.prototype.select = function (i) {
        this.sel = i;
        this.renderCables();
    };

    Bench.prototype.canEdit = function () {
        if (this.lab.on) {
            this.hooks.toast('Norma de seguridad: abre el interruptor Q1 antes de modificar el montaje.', 'warn');
            return false;
        }
        return true;
    };

    Bench.prototype.snapshot = function () {
        this.history.push(JSON.stringify({ cables: this.lab.cables, bridges: this.lab.bridges }));
        if (this.history.length > 60) this.history.shift();
    };
    Bench.prototype.undo = function () {
        if (!this.history.length || !this.canEdit()) return;
        var s = JSON.parse(this.history.pop());
        this.lab.cables = s.cables; this.lab.bridges = s.bridges;
        this.sel = -1;
        this.afterWiring();
    };
    Bench.prototype.afterWiring = function () {
        this.lab.rewire();
        this.renderCables(); this.renderBridges();
        this.hooks.changed(true);
    };

    Bench.prototype.addCable = function (a, b) {
        if (a === b) return;
        var dup = this.lab.cables.some(function (c) { return (c.a === a && c.b === b) || (c.a === b && c.b === a); });
        if (dup) { this.hooks.toast('Ya hay un cable entre esos dos bornes.', 'warn'); return; }
        if (!this.canEdit()) return;
        this.snapshot();
        this.lab.cables.push({ a: a, b: b, color: this.color });
        this.sel = -1;
        this.afterWiring();
    };
    Bench.prototype.removeCable = function (i) {
        if (i < 0 || i >= this.lab.cables.length || !this.canEdit()) return;
        this.snapshot();
        this.lab.cables.splice(i, 1);
        this.sel = -1;
        this.afterWiring();
    };
    Bench.prototype.clearCables = function () {
        if (!this.lab.cables.length || !this.canEdit()) return;
        this.snapshot();
        this.lab.cables = []; this.sel = -1;
        this.afterWiring();
    };
    Bench.prototype.setWiring = function (cables, bridges) {
        if (!this.canEdit()) return false;
        this.snapshot();
        this.lab.cables = cables; this.lab.bridges = bridges; this.sel = -1;
        this.afterWiring();
        return true;
    };
    Bench.prototype.toggleBridge = function (k) {
        if (!this.canEdit()) return;
        this.snapshot();
        var b = Object.assign({}, this.lab.bridges);
        if (b[k]) delete b[k]; else b[k] = 1;
        this.lab.bridges = b;
        this.afterWiring();
    };
    Bench.prototype.setBridges = function (type) {
        if (!this.canEdit()) return;
        this.snapshot();
        this.lab.bridges = type === 'Y' ? { 'W2-U2': 1, 'U2-V2': 1 } : type === 'D' ? { 'U1-W2': 1, 'V1-U2': 1, 'W1-V2': 1 } : {};
        this.afterWiring();
    };
    Bench.prototype.setColor = function (c) {
        this.color = c;
        if (this.sel >= 0 && this.lab.cables[this.sel]) {
            this.lab.cables[this.sel].color = c;
            this.renderCables();
            this.hooks.changed(true);
        }
    };

    Bench.prototype.bindWiring = function () {
        var self = this, svg = this.svg;
        function termAt(e) {
            var t = document.elementFromPoint(e.clientX, e.clientY);
            return t && t.getAttribute && t.getAttribute('data-term');
        }
        function drawTemp(p) {
            var a = self.pos[self.pending.from];
            self.gTemp.innerHTML = '';
            var col = COLOR[self.color];
            el('path', { d: self.cablePath(a, p), stroke: col, 'class': 'cable-core temp' }, self.gTemp);
            el('circle', { cx: a.x, cy: a.y, r: 9.5, fill: col, 'class': 'plug' }, self.gTemp);
            el('circle', { cx: p.x, cy: p.y, r: 8, fill: col, 'class': 'plug temp' }, self.gTemp);
        }
        function cancel() {
            self.pending = null; self.gTemp.innerHTML = '';
            svg.classList.remove('wiring');
            self.svg.querySelectorAll('.term-hit.src').forEach(function (n) { n.classList.remove('src'); });
        }
        this.cancelPending = cancel;
        svg.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            var id = e.target.getAttribute && e.target.getAttribute('data-term');
            if (self.pending) {
                if (id && id !== self.pending.from) { var f = self.pending.from; cancel(); self.addCable(f, id); }
                else cancel();
                e.preventDefault();
                return;
            }
            if (id) {
                e.preventDefault();
                if (self.lab.on) { self.canEdit(); return; }
                self.pending = { from: id, drag: true, x0: e.clientX, y0: e.clientY, moved: false };
                e.target.classList.add('src');
                svg.classList.add('wiring');
                drawTemp(self.pos[id]);
                return;
            }
            if (self.sel >= 0) self.select(-1);
        });
        window.addEventListener('pointermove', function (e) {
            if (!self.pending) return;
            if (Math.abs(e.clientX - self.pending.x0) + Math.abs(e.clientY - self.pending.y0) > 6) self.pending.moved = true;
            var p = VEM.svgPoint(svg, e.clientX, e.clientY), t = termAt(e);
            if (t && self.pos[t]) p = self.pos[t];
            drawTemp(p);
        });
        window.addEventListener('pointerup', function (e) {
            if (!self.pending || !self.pending.drag) return;
            var t = termAt(e);
            if (t && t !== self.pending.from) { var f = self.pending.from; cancel(); self.addCable(f, t); return; }
            if (!self.pending.moved) { self.pending.drag = false; return; }   /* modo clic-clic */
            cancel();
        });
        window.addEventListener('keydown', function (e) {
            if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
            if (e.key === 'Escape') { cancel(); if (self.sel >= 0) self.select(-1); }
            if ((e.key === 'Delete' || e.key === 'Backspace') && self.sel >= 0) { e.preventDefault(); self.removeCable(self.sel); }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); self.undo(); }
        });
        /* resaltar bornes conectados al pasar por encima */
        svg.addEventListener('pointerover', function (e) {
            var id = e.target.getAttribute && e.target.getAttribute('data-term');
            if (self.hooks.hover) self.hooks.hover(id ? INFO[id] : null);
        });
    };

    /* ================= Animación y displays ================= */
    function noisy(v, rel) {
        var g = (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
        return v * (1 + rel * g);
    }

    Bench.prototype.frame = function (dt, rd) {
        var lab = this.lab, ws = VEM.Motor.ws(lab.P), i;
        /* giro: marcas del acoplamiento y del freno */
        this.phase += lab.w * dt * 0.055;
        for (i = 0; i < this.marks.length; i++) {
            var a = this.phase + i * Math.PI * 2 / this.marks.length, c = Math.cos(a);
            this.marks[i].setAttribute('y', (600 - 34 * Math.sin(a) - 2.5).toFixed(2));
            this.marks[i].setAttribute('opacity', c > 0 ? (0.25 + 0.75 * c).toFixed(2) : 0);
        }
        for (i = 0; i < this.bmarks.length; i++) {
            var b = this.phase + i * Math.PI * 2 / this.bmarks.length, cb = Math.cos(b);
            this.bmarks[i].setAttribute('y', (605 - 80 * Math.sin(b) - 1.5).toFixed(2));
            this.bmarks[i].setAttribute('height', 3);
            this.bmarks[i].setAttribute('x', 950);
            this.bmarks[i].setAttribute('width', 182);
            this.bmarks[i].setAttribute('opacity', cb > 0 ? (0.08 + 0.25 * cb).toFixed(2) : 0);
        }
        /* zumbido: motor alimentado y parado */
        var hum = lab.on && Math.abs(lab.w) < 0.5 && rd && Math.max(rd.Iw[0], rd.Iw[1], rd.Iw[2]) > 0.3 * lab.P.Iwn;
        this.gMot.setAttribute('transform', hum ? 'translate(' + (Math.random() - 0.5).toFixed(2) + ',' + (Math.random() - 0.5).toFixed(2) + ')' : '');
        /* estado de mandos */
        this.qLever.setAttribute('y', lab.on ? 108 : 136);
        this.qLever.setAttribute('class', 'brk-lever' + (lab.on ? ' on' : ''));
        this.qLeverTxt.setAttribute('y', lab.on ? 127 : 155);
        this.qLeverTxt.textContent = lab.on ? 'I' : 'O';
        this.lampOn.setAttribute('class', 'lamp green' + (lab.on ? ' lit' : ''));
        this.lampTrip.setAttribute('class', 'lamp red' + (lab.trip ? ' lit' : ''));
        this.gLock.setAttribute('transform', lab.locked ? 'translate(0,34)' : '');
        this.lockLever.setAttribute('y', lab.locked ? 716 : 676);
        this.lockLever.setAttribute('class', 'lock-lever' + (lab.locked ? ' on' : ''));
        this.lockTxt.setAttribute('y', lab.locked ? 743 : 703);
        this.lockTxt.textContent = lab.locked ? 'BLOQ.' : 'LIBRE';
        if (rd) {
            var th = rd.thermal * 12;
            for (i = 0; i < 12; i++) this.thLeds[i].classList.toggle('lit', i < th);
            this.ledCW.setAttribute('class', 'lamp green' + (rd.n > 1 ? ' lit' : ''));
            this.ledCCW.setAttribute('class', 'lamp amber' + (rd.n < -1 ? ' lit' : ''));
        }
    };

    /* Actualiza los displays (≈ 4 veces por segundo) y devuelve las lecturas mostradas */
    Bench.prototype.displays = function (rd) {
        var f7 = W.fmt7, shown = {};
        function wat(r) {
            if (r.I > 20 || r.U > 600) return { s: 'OL', v: NaN };
            var v = noisy(r.P, 0.0015);
            if (Math.abs(v) < 0.05) v = 0;
            return { s: f7(v, 6, 1), v: v };
        }
        var w1 = wat(rd.w1), w2 = wat(rd.w2);
        this.dw1.set(w1.s); this.dw2.set(w2.s);
        shown.W1 = w1.v; shown.W2 = w2.v;
        var I = rd.am > 20 ? NaN : noisy(rd.am, 0.001);
        this.dam.set(rd.am > 20 ? 'OL' : f7(I < 0.0005 ? 0 : I, 5, 3));
        shown.I = I;
        var U = rd.vm > 600 ? NaN : noisy(rd.vm, 0.0008);
        this.dvm.set(rd.vm > 600 ? 'OL' : f7(U < 0.05 ? 0 : U, 5, 1));
        shown.U = U;
        this.dSrc.set(f7(rd.Uout < 0.5 ? 0 : noisy(rd.Uout, 0.0008), 4, 0));
        /* polímetro */
        if (rd.mm.live) { this.dmm.set('Err'); this.mmUnit.textContent = 'V~ !'; }
        else {
            var R = rd.mm.R;
            if (!isFinite(R) || R > 40e6 || R < 0) { this.dmm.set('OL'); this.mmUnit.textContent = 'Ω'; }
            else if (R >= 1e6) { this.dmm.set(f7(R / 1e6, 5, 3)); this.mmUnit.textContent = 'MΩ'; }
            else if (R >= 1e3) { this.dmm.set(f7(R / 1e3, 5, 3)); this.mmUnit.textContent = 'kΩ'; }
            else { this.dmm.set(f7(R < 0.005 ? 0 : noisy(R, 0.0005), 5, 3)); this.mmUnit.textContent = 'Ω'; }
        }
        var n = Math.abs(rd.n) < 0.5 ? 0 : noisy(Math.abs(rd.n), 0.0002);
        this.dN.set(f7(n, 5, 0)); shown.n = rd.n < 0 ? -n : n;
        var T = rd.T < 0.005 ? 0 : noisy(rd.T, 0.0015);
        this.dT.set(f7(T, 5, 2)); shown.T = T;
        return shown;
    };

    VEM.Bench = Bench;
})();
