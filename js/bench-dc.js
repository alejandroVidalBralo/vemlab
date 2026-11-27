/* =====================================================================
   VEMLAB · Banco de la máquina de corriente continua (SVG interactivo)
   Fuente doble de c.c. (inducido y excitación) con contactores de
   salida, amperímetros y voltímetros de c.c. con signo, polímetro,
   caja de bornes A1–A2 / D1–D2 / E1–E2, reóstatos de arranque y de
   campo, carga resistiva y dinamómetro de cuatro cuadrantes.
   El panel del dinamómetro (buildDynoPanel) es común a los bancos que
   lo usan (continua, síncrona).
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, W = VEM.W, el = W.el, txt = W.txt, Bench = VEM.Bench, INFO = Bench.INFO;
    var SRC = VEM.DC.SRC, RH = VEM.DC.RH, LOAD = VEM.DC.LOAD, f = VEM.fmtN, noisy = Bench.noisy;

    Object.assign(INFO, {
        'ps.A+': 'Fuente de c.c. · salida de INDUCIDO · borne +', 'ps.A-': 'Fuente de c.c. · salida de INDUCIDO · borne −',
        'ps.F+': 'Fuente de c.c. · salida de EXCITACIÓN · borne +', 'ps.F-': 'Fuente de c.c. · salida de EXCITACIÓN · borne −',
        'a1.a': 'Amperímetro A1 (c.c., 30 A) · borne + (la corriente entra por aquí)', 'a1.b': 'Amperímetro A1 · borne COM',
        'a2.a': 'Amperímetro A2 (c.c., 3 A) · borne + (la corriente entra por aquí)', 'a2.b': 'Amperímetro A2 · borne COM',
        'v1.a': 'Voltímetro V1 (c.c.) · borne +', 'v1.b': 'Voltímetro V1 · borne COM',
        'v2.a': 'Voltímetro V2 (c.c.) · borne +', 'v2.b': 'Voltímetro V2 · borne COM',
        'd.A1': 'Máquina de c.c. · inducido · borne A1', 'd.A2': 'Máquina de c.c. · inducido · borne A2',
        'd.D1': 'Máquina de c.c. · excitación serie · borne D1', 'd.D2': 'Máquina de c.c. · excitación serie · borne D2',
        'd.E1': 'Máquina de c.c. · excitación derivación / independiente · borne E1', 'd.E2': 'Máquina de c.c. · excitación derivación / independiente · borne E2',
        'ra.1': 'Reóstato de arranque · borne 1', 'ra.2': 'Reóstato de arranque · borne 2',
        'rf.1': 'Reóstato de campo · borne 1', 'rf.2': 'Reóstato de campo · borne 2',
        'ld.+': 'Carga resistiva · borne +', 'ld.-': 'Carga resistiva · borne −'
    });

    function DCBench(svg, lab, hooks) { Bench.call(this, svg, lab, hooks); }
    DCBench.prototype = Object.create(Bench.prototype);
    DCBench.prototype.constructor = DCBench;

    DCBench.prototype.defs = function (svg) {
        Bench.prototype.defs.call(this, svg);
        var d = svg.querySelector('defs');
        function lin(id, stops) {
            var g = el('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, d);
            stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
        }
        lin('gDC', [[0, '#1d3329'], [0.18, '#3f6b55'], [0.33, '#6f9a83'], [0.5, '#355c49'], [1, '#14261d']]);
        lin('gDCDark', [[0, '#14241c'], [0.3, '#2c4a3b'], [1, '#0f1d16']]);
        lin('gComm', [[0, '#6b3a12'], [0.3, '#e9a062'], [0.5, '#f6c08e'], [0.75, '#b06424'], [1, '#5a2c0c']]);
        lin('gRheo', [[0, '#3a3f46'], [1, '#22262b']]);
    };

    DCBench.prototype.mainsOnMsg = function () {
        return 'Interruptor Q1 cerrado: fuente de c.c. preparada (inducido ' + Math.round(this.lab.U.A) + ' V, excitación ' + Math.round(this.lab.U.F) + ' V; activa cada salida con su contactor).';
    };

    /* ================= Fila superior ================= */
    DCBench.prototype.buildTop = function (g) {
        this.buildDCSource(g);
        var o = { w: 190, dc: true };
        this.buildMeter(g, 'a1', 460, 'AMPERÍMETRO A1', 'A', 'A', '30 A =  ·  lectura con signo', 'red', o);
        this.buildMeter(g, 'v1', 670, 'VOLTÍMETRO V1', 'V', 'V', '600 V =  ·  lectura con signo', 'green', o);
        this.buildMeter(g, 'a2', 880, 'AMPERÍMETRO A2', 'A', 'A', '3 A =  ·  lectura con signo', 'red', o);
        this.buildMeter(g, 'v2', 1090, 'VOLTÍMETRO V2', 'V', 'V', '600 V =  ·  lectura con signo', 'green', o);
        this.buildMultimeter(g, 1310);
    };

    DCBench.prototype.buildDCSource = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev src', filter: 'url(#fShadow)' }, p);
        el('rect', { x: 20, y: 20, width: 420, height: 335, rx: 10, fill: 'url(#gPanel)', 'class': 'panel-light' }, g);
        el('rect', { x: 20, y: 20, width: 420, height: 38, rx: 10, 'class': 'panel-band' }, g);
        el('rect', { x: 20, y: 46, width: 420, height: 12, 'class': 'panel-band' }, g);
        txt(g, 36, 44, 'FUENTE DE C.C. DOBLE', 'dev-title light');
        txt(g, 424, 44, '2 × 0–250 V =', 'dev-sub light', { 'text-anchor': 'end' });
        this.buildMains(g);
        el('line', { x1: 285, y1: 70, x2: 285, y2: 345, 'class': 'sep light' }, g);
        this.dOut = {}; this.kOut = {}; this.swOut = {}; this.lampOut = {};
        [['A', 213, 'INDUCIDO', SRC.A], ['F', 357, 'EXCITACIÓN', SRC.F]].forEach(function (o) {
            var k = o[0], cx = o[1], s = o[3];
            txt(g, cx, 76, o[2], 'mini-lbl', { 'text-anchor': 'middle' });
            el('rect', { x: cx - 62, y: 82, width: 124, height: 44, rx: 5, 'class': 'bezel' }, g);
            el('rect', { x: cx - 58, y: 86, width: 116, height: 36, rx: 3, 'class': 'lcd-led' }, g);
            self.dOut[k] = new W.SevenSeg(g, cx - 48, 92, 4, 24, 'amber');
            txt(g, cx + 52, 118, 'V', 'disp-unit amber', { 'text-anchor': 'end' });
            var ticks = []; for (var v = 0; v <= s.Umax; v += 10) ticks.push(v);
            self.kOut[k] = new W.Knob(g, {
                cx: cx, cy: 186, r: 28, min: 0, max: s.Umax, value: lab.U[k], step: 0.5, wheel: 5, keyStep: 0.5, sweep: 280,
                ticks: ticks, major: 5, fmt: function (v) { return String(v); }, label: 'Tensión de la salida de ' + s.name,
                onChange: function (v) { lab.U[k] = v; self.hooks.changed(false); }
            });
            W.PushButton(g, cx - 62, 258, 28, 24, '−', function () { self.kOut[k].set(Math.round((self.kOut[k].value - 0.5) * 2) / 2, true); }, 'small', true);
            W.PushButton(g, cx + 34, 258, 28, 24, '+', function () { self.kOut[k].set(Math.round((self.kOut[k].value + 0.5) * 2) / 2, true); }, 'small', true);
            /* contactor de salida */
            var sw = self.swOut[k] = el('g', { 'class': 'rocker', tabindex: 0, role: 'switch', 'aria-label': 'Contactor de la salida de ' + s.name }, g);
            el('rect', { x: cx - 24, y: 256, width: 48, height: 28, rx: 5, 'class': 'rocker-body' }, sw);
            sw.lever = el('rect', { x: cx - 20, y: 260, width: 20, height: 20, rx: 3, 'class': 'rocker-lever' }, sw);
            sw.t = txt(sw, cx - 10, 275, '0', 'rocker-txt', { 'text-anchor': 'middle' });
            W.title(sw, 'Contactor de salida de ' + s.name + ' (conecta / desconecta la salida)');
            function tog(e) {
                if (e) e.stopPropagation();
                lab.out[k] = !lab.out[k];
                self.hooks.log('Salida de ' + s.name + (lab.out[k] ? ' conectada (' + Math.round(lab.U[k]) + ' V).' : ' desconectada.'));
                self.hooks.changed(false);
            }
            sw.addEventListener('pointerdown', function (e) { if (e.button === 0) tog(e); });
            sw.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
            self.lampOut[k] = self.lamp(g, cx, 238, 'green');
            /* bornes */
            el('rect', { x: cx - 62, y: 304, width: 124, height: 42, rx: 6, 'class': 'sock-strip' }, g);
            self.socket(g, s.p, cx - 30, 325, '#d0312d', null);
            self.socket(g, s.n, cx + 30, 325, '#1d1f22', null);
            txt(g, cx - 10, 330, '+', 'sock-lbl strong', { 'text-anchor': 'middle' });
            txt(g, cx + 50, 330, '−', 'sock-lbl strong', { 'text-anchor': 'middle' });
        });
    };

    /* ================= Fila inferior ================= */
    DCBench.prototype.buildMachine = function (g) {
        this.buildDCBox(g);
        this.buildRheostats(g);
        this.buildDCLoad(g);
        this.buildDCMachine(g);
        this.buildDynoPanel(g);
    };
    DCBench.prototype.modelChanged = function () { this.setPlate(); this.buildDynoKnob(); };
    DCBench.prototype.renderBridges = function () { };

    /* ---------------- Caja de bornes ---------------- */
    var STUDS = { 'd.A1': [75, 512, 'A1'], 'd.A2': [75, 724, 'A2'], 'd.D1': [160, 512, 'D1'], 'd.D2': [160, 724, 'D2'], 'd.E1': [245, 512, 'E1'], 'd.E2': [245, 724, 'E2'] };
    DCBench.prototype.buildDCBox = function (p) {
        var self = this, g = el('g', { 'class': 'tbox', filter: 'url(#fShadow)' }, p);
        el('rect', { x: 20, y: 396, width: 280, height: 484, rx: 14, fill: 'url(#gDCDark)', 'class': 'mot-edge' }, g);
        el('rect', { x: 34, y: 440, width: 252, height: 356, rx: 8, fill: 'url(#gBoxIn)', 'class': 'box-in' }, g);
        txt(g, 36, 425, 'CAJA DE BORNES', 'dev-title');
        txt(g, 286, 425, 'vista ampliada', 'dev-sub', { 'text-anchor': 'end' });
        el('rect', { x: 46, y: 462, width: 228, height: 314, rx: 10, 'class': 'box-base' }, g);
        /* serigrafía: inducido, devanado serie (pocas espiras gruesas) y derivación (muchas finas) */
        var s = el('g', { 'class': 'dc-sym' }, g);
        el('path', { d: 'M75,532 V588 M75,648 V704', 'class': 'dc-wire' }, s);
        el('circle', { cx: 75, cy: 618, r: 28, 'class': 'dc-arm' }, s);
        el('rect', { x: 67, y: 582, width: 16, height: 10, 'class': 'dc-brush' }, s);
        el('rect', { x: 67, y: 644, width: 16, height: 10, 'class': 'dc-brush' }, s);
        txt(s, 75, 624, 'M', 'dc-arm-t', { 'text-anchor': 'middle' });
        function coil(x, y0, y1, n, cls) {
            var r = (y1 - y0) / n / 2, d = 'M' + x + ',' + y0;
            for (var i = 0; i < n; i++) d += ' a' + r + ',' + r + ' 0 0 1 0,' + (2 * r);
            el('path', { d: 'M' + x + ',532 V' + y0 + ' M' + x + ',' + y1 + ' V704', 'class': 'dc-wire' }, s);
            el('path', { d: d, 'class': 'dc-coil ' + cls }, s);
        }
        coil(160, 576, 660, 3, 'ser');
        coil(245, 560, 676, 8, 'shu');
        Object.keys(STUDS).forEach(function (id) {
            var st = STUDS[id];
            self.pos[id] = { x: st[0], y: st[1], r: 20 };
            txt(g, st[0], st[1] + (st[1] < 600 ? -28 : 44), st[2], 'stud-lbl', { 'text-anchor': 'middle' });
        });
        this.gStuds = el('g', null, g);
        Object.keys(STUDS).forEach(function (id) {
            var st = STUDS[id], x = st[0], y = st[1], hex = [];
            for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; hex.push((x + 17 * Math.cos(a)).toFixed(1) + ',' + (y + 17 * Math.sin(a)).toFixed(1)); }
            el('circle', { cx: x, cy: y + 2, r: 21, 'class': 'sock-shadow' }, self.gStuds);
            el('polygon', { points: hex.join(' '), fill: 'url(#gBrass)', 'class': 'nut' }, self.gStuds);
            el('circle', { cx: x, cy: y, r: 8, fill: 'url(#gBrass)', 'class': 'stud' }, self.gStuds);
            el('circle', { cx: x, cy: y, r: 3, 'class': 'stud-hole' }, self.gStuds);
        });
        txt(g, 160, 820, 'A1–A2  inducido', 'box-hint', { 'text-anchor': 'middle' });
        txt(g, 160, 838, 'D1–D2  excitación serie', 'box-hint', { 'text-anchor': 'middle' });
        txt(g, 160, 856, 'E1–E2  excitación derivación', 'box-hint', { 'text-anchor': 'middle' });
    };

    /* ---------------- Reóstatos ---------------- */
    DCBench.prototype.buildRheostats = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), x = 312, w = 200;
        el('rect', { x: x, y: 396, width: w, height: 484, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 402, width: w - 12, height: 472, rx: 7, 'class': 'housing-inner' }, g);
        this.rhTxt = {};
        [['A', 396, 'REÓSTATO DE ARRANQUE', 'ra', 2, 10], ['F', 638, 'REÓSTATO DE CAMPO', 'rf', 50, 200]].forEach(function (o) {
            var k = o[0], y0 = o[1], R = RH[k], cx = x + w / 2, cy = y0 + 120;
            if (k === 'F') el('line', { x1: x + 14, y1: y0, x2: x + w - 14, y2: y0, 'class': 'sep' }, g);
            txt(g, x + 16, y0 + 28, o[2], 'dev-title sm');
            txt(g, x + 16, y0 + 44, '0–' + R.max + ' Ω · ' + f(R.I, 1) + ' A', 'dev-sub', { 'text-anchor': 'start' });
            var ticks = []; for (var v = 0; v <= R.max + 1e-9; v += o[4]) ticks.push(v);
            new W.Knob(g, {
                cx: cx, cy: cy, r: 32, min: 0, max: R.max, value: lab.rh[k], step: k === 'A' ? 0.1 : 1, wheel: k === 'A' ? 1 : 10, sweep: 280,
                ticks: ticks, major: 5, fmt: function (v) { return v >= 1000 ? '1k' : String(v); }, label: o[2] + ' (Ω)',
                onChange: function (v) { lab.rh[k] = v; self.updateRhTxt(); self.hooks.changed(false); }
            });
            self.rhTxt[k] = txt(g, cx, cy + 74, '', 'spec', { 'text-anchor': 'middle' });
            el('rect', { x: x + 16, y: y0 + 200, width: w - 32, height: 36, rx: 6, 'class': 'sock-strip' }, g);
            self.socket(g, o[3] + '.1', x + 60, y0 + 218, '#c9973a', null);
            self.socket(g, o[3] + '.2', x + 140, y0 + 218, '#c9973a', null);
            txt(g, x + 80, y0 + 223, '1', 'sock-lbl', { 'text-anchor': 'start' });
            txt(g, x + 160, y0 + 223, '2', 'sock-lbl', { 'text-anchor': 'start' });
        });
        this.updateRhTxt();
    };
    DCBench.prototype.updateRhTxt = function () {
        this.rhTxt.A.textContent = 'R = ' + f(this.lab.rh.A, 1) + ' Ω';
        this.rhTxt.F.textContent = 'R = ' + f(this.lab.rh.F, 0) + ' Ω';
    };

    /* ---------------- Carga resistiva ---------------- */
    DCBench.prototype.buildDCLoad = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), x = 524, w = 636;
        el('rect', { x: x, y: 396, width: w, height: 186, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 402, width: w - 12, height: 174, rx: 7, 'class': 'housing-inner' }, g);
        txt(g, x + 16, 426, 'CARGA RESISTIVA DE C.C.', 'dev-title');
        txt(g, x + w - 14, 426, LOAD.steps + ' × ' + LOAD.P + ' W a ' + LOAD.U + ' V', 'dev-sub', { 'text-anchor': 'end' });
        var ticks = []; for (var v = 0; v <= LOAD.steps; v++) ticks.push(v);
        new W.Knob(g, {
            cx: x + 84, cy: 500, r: 30, min: 0, max: LOAD.steps, value: lab.load.n, step: 1, wheel: 1, sweep: 270,
            ticks: ticks, major: 5, fmt: function (v) { return String(v); }, label: 'Carga resistiva (escalones)',
            onChange: function (v) { lab.load.n = v; self.updateLoadTxt(); self.hooks.changed(false); }
        });
        this.ldTxt = txt(g, x + 170, 486, '', 'spec big');
        this.ldTxt2 = txt(g, x + 170, 506, '', 'spec');
        txt(g, x + 170, 526, 'Escalones en paralelo; conecta con el interruptor', 'spec dim');
        var sw = el('g', { 'class': 'locksw', tabindex: 0, role: 'switch', 'aria-label': 'Interruptor de la carga' }, g);
        el('rect', { x: x + 420, y: 446, width: 62, height: 104, rx: 8, 'class': 'lock-body' }, sw);
        this.ldLever = el('rect', { x: x + 433, y: 456, width: 36, height: 40, rx: 6, 'class': 'lock-lever' }, sw);
        this.ldLeverTxt = txt(sw, x + 451, 481, 'OFF', 'lock-txt', { 'text-anchor': 'middle' });
        txt(g, x + 451, 568, 'CARGA', 'mini-lbl', { 'text-anchor': 'middle' });
        W.title(sw, 'Interruptor de la carga');
        function tog(e) {
            if (e) e.stopPropagation();
            lab.load.on = !lab.load.on;
            self.hooks.log(lab.load.on ? 'Carga resistiva conectada (' + lab.load.n + ' escalones).' : 'Carga resistiva desconectada.');
            self.hooks.changed(false);
        }
        sw.addEventListener('pointerdown', function (e) { if (e.button === 0) tog(e); });
        sw.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
        this.ldLamp = this.lamp(g, x + 400, 498, 'amber');
        el('rect', { x: x + 504, y: 466, width: 116, height: 60, rx: 6, 'class': 'sock-strip' }, g);
        this.socket(g, 'ld.+', x + 534, 496, '#d0312d', null);
        this.socket(g, 'ld.-', x + 590, 496, '#1d1f22', null);
        txt(g, x + 534, 545, '+', 'mini-lbl', { 'text-anchor': 'middle' });
        txt(g, x + 590, 545, '−', 'mini-lbl', { 'text-anchor': 'middle' });
        this.updateLoadTxt();
    };
    DCBench.prototype.updateLoadTxt = function () {
        var n = this.lab.load.n;
        this.ldTxt.textContent = n + ' escalones = ' + f(n * LOAD.P / 1000, 2) + ' kW a ' + LOAD.U + ' V';
        this.ldTxt2.textContent = n ? 'R = ' + f(LOAD.U * LOAD.U / LOAD.P / n, 1) + ' Ω' : 'R = ∞ (sin carga)';
    };

    /* ---------------- Máquina, acoplamiento y dinamómetro ---------------- */
    DCBench.prototype.buildDCMachine = function (p) {
        /* se dibuja en las coordenadas del banco del motor y se escala al hueco disponible */
        var g = el('g', { 'class': 'machine', transform: 'translate(170.4,221.2) scale(0.82)' }, p), i;
        el('rect', { x: 466, y: 762, width: 690, height: 30, rx: 4, fill: 'url(#gSteel)', 'class': 'base' }, g);
        el('rect', { x: 466, y: 792, width: 690, height: 10, 'class': 'base-shadow' }, g);
        var m = this.gMot = el('g', null, g);
        el('path', { d: 'M585,700 h50 l8,62 h-66 z M740,700 h50 l8,62 h-66 z', fill: 'url(#gDCDark)', 'class': 'mot-edge' }, m);
        /* tapa del lado colector con ventana de inspección de escobillas */
        el('rect', { x: 478, y: 528, width: 78, height: 150, rx: 20, fill: 'url(#gDCDark)', 'class': 'mot-edge' }, m);
        el('rect', { x: 494, y: 560, width: 46, height: 82, rx: 6, 'class': 'dc-window' }, m);
        this.gComm = el('g', null, m);
        el('rect', { x: 498, y: 570, width: 38, height: 62, rx: 3, fill: 'url(#gComm)' }, this.gComm);
        this.commBars = [];
        for (i = 0; i < 7; i++) this.commBars.push(el('rect', { x: 498, y: 570, width: 38, height: 1.6, 'class': 'comm-bar' }, this.gComm));
        el('rect', { x: 508, y: 560, width: 18, height: 12, rx: 2, 'class': 'dc-brush-r' }, m);
        el('rect', { x: 508, y: 630, width: 18, height: 12, rx: 2, 'class': 'dc-brush-r' }, m);
        this.spark = el('g', { 'class': 'spark', opacity: 0 }, m);
        el('circle', { cx: 517, cy: 573, r: 4 }, this.spark); el('circle', { cx: 517, cy: 629, r: 4 }, this.spark);
        /* carcasa */
        el('rect', { x: 552, y: 505, width: 252, height: 196, rx: 12, fill: 'url(#gDC)', 'class': 'mot-edge' }, m);
        for (i = 0; i < 5; i++) el('rect', { x: 566 + i * 46, y: 512, width: 30, height: 6, rx: 3, 'class': 'dc-vent' }, m);
        for (i = 0; i < 5; i++) el('rect', { x: 566 + i * 46, y: 688, width: 30, height: 6, rx: 3, 'class': 'dc-vent' }, m);
        el('rect', { x: 800, y: 520, width: 30, height: 166, rx: 8, fill: 'url(#gDCDark)', 'class': 'mot-edge' }, m);
        /* caja de bornes */
        el('rect', { x: 640, y: 466, width: 104, height: 42, rx: 5, fill: 'url(#gDCDark)', 'class': 'mot-edge' }, m);
        el('rect', { x: 648, y: 472, width: 88, height: 30, rx: 3, 'class': 'tbox-lid' }, m);
        [[653, 477], [731, 477], [653, 497], [731, 497]].forEach(function (s) { el('circle', { cx: s[0], cy: s[1], r: 2.4, 'class': 'screw' }, m); });
        /* placa */
        el('rect', { x: 580, y: 560, width: 208, height: 96, rx: 4, fill: 'url(#gPlate)', 'class': 'plate' }, m);
        this.plateTxt = el('g', { 'class': 'plate-txt' }, m);
        this.buildBrakeBody(g, 'DINAMÓMETRO');
        this.setPlate();
    };

    var EXC = { shunt: 'derivación / indep.', series: 'serie' };
    DCBench.prototype.setPlate = function () {
        var P = this.lab.P, pl = P.plate, g = this.plateTxt;
        g.innerHTML = '';
        var y = 575, x = 589, x2 = 779;
        txt(g, x, y, 'Máq. c.c.  ' + P.code, 'pl-h'); txt(g, x2, y, 'S1 · ' + P.ip, 'pl-h', { 'text-anchor': 'end' }); y += 16;
        txt(g, x, y, f(pl.Pn / 1000, 1) + ' kW · ' + pl.Un + ' V', 'pl'); txt(g, x2, y, f(pl.In, 1) + ' A', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, pl.nn + ' min⁻¹ (máx. ' + pl.nmax + ')', 'pl'); txt(g, x2, y, 'η ' + f(pl.eta * 100, 0) + ' %', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'Excitación ' + EXC[pl.exc], 'pl'); y += 14;
        txt(g, x, y, pl.exc === 'series' ? 'Exc. serie a ' + f(pl.In, 1) + ' A' : 'Exc. ' + pl.Uf + ' V · ' + f(pl.Ifn, 2) + ' A', 'pl');
    };

    /* ---------------- Panel del dinamómetro (común) ---------------- */
    Bench.prototype.buildDynoPanel = function (p) {
        var self = this, lab = this.lab, dy = lab.dyno, g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), x = 1172, w = 308;
        el('rect', { x: x, y: 396, width: w, height: 484, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 402, width: w - 12, height: 472, rx: 7, 'class': 'housing-inner' }, g);
        txt(g, x + 16, 426, 'DINAMÓMETRO', 'dev-title');
        txt(g, x + w - 14, 426, '4 cuadrantes', 'dev-sub', { 'text-anchor': 'end' });
        el('rect', { x: x + 16, y: 438, width: w - 32, height: 74, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: x + 22, y: 444, width: w - 44, height: 62, rx: 3, 'class': 'lcd-led' }, g);
        txt(g, x + 32, 464, 'PAR', 'disp-lbl amber'); txt(g, x + 32, 478, 'T', 'disp-lbl-s amber');
        this.dT = new W.SevenSeg(g, x + 92, 455, 6, 32, 'amber');
        txt(g, x + w - 26, 500, 'N·m', 'disp-unit amber', { 'text-anchor': 'end' });
        el('rect', { x: x + 16, y: 518, width: w - 32, height: 74, rx: 6, 'class': 'bezel' }, g);
        el('rect', { x: x + 22, y: 524, width: w - 44, height: 62, rx: 3, 'class': 'lcd-led' }, g);
        txt(g, x + 32, 544, 'VELOC.', 'disp-lbl green'); txt(g, x + 32, 558, 'n', 'disp-lbl-s green');
        this.dN = new W.SevenSeg(g, x + 92, 535, 6, 32, 'green');
        txt(g, x + w - 26, 580, 'min⁻¹', 'disp-unit green', { 'text-anchor': 'end' });
        this.ledCW = this.lamp(g, x + 30, 610, 'green');
        txt(g, x + 44, 614, 'horario', 'mini-lbl', { 'text-anchor': 'start' });
        this.ledCCW = this.lamp(g, x + 116, 610, 'amber');
        txt(g, x + 130, 614, 'antihorario', 'mini-lbl', { 'text-anchor': 'start' });
        this.ledMot = this.lamp(g, x + 228, 610, 'green');
        txt(g, x + 242, 614, 'T > 0: motor', 'mini-lbl', { 'text-anchor': 'start' });
        /* consigna */
        this.gDynoKnob = el('g', null, g);
        /* selector de modo */
        var ms = this.gModeSw = el('g', { 'class': 'locksw', tabindex: 0, role: 'switch', 'aria-label': 'Modo del dinamómetro: par o velocidad' }, g);
        el('rect', { x: x + 226, y: 650, width: 64, height: 104, rx: 8, 'class': 'lock-body' }, ms);
        this.modeLever = el('rect', { x: x + 240, y: 660, width: 36, height: 40, rx: 6, 'class': 'lock-lever' }, ms);
        this.modeTxt = txt(ms, x + 258, 685, 'PAR', 'lock-txt', { 'text-anchor': 'middle' });
        txt(g, x + 258, 770, 'MODO', 'mini-lbl', { 'text-anchor': 'middle' });
        W.title(ms, 'Modo PAR: freno pasivo con consigna de par. Modo VELOCIDAD: el dinamómetro arrastra o frena la máquina hasta la velocidad de consigna.');
        function tm(e) {
            if (e) e.stopPropagation();
            dy.setMode(dy.mode === 'n' ? 'T' : 'n', lab.w);
            if (dy.mode === 'n' && Math.abs(lab.w) > 1) { dy.nset = Math.min(dy.nmax, Math.round(Math.abs(lab.w) * 30 / Math.PI / 5) * 5); dy.dir = lab.w < 0 ? -1 : 1; }
            self.hooks.log(dy.mode === 'n' ? 'Dinamómetro en modo VELOCIDAD: consigna ' + Math.round(dy.nset) + ' min⁻¹.' : 'Dinamómetro en modo PAR: consigna ' + f(dy.Tset, 2) + ' N·m' + (dy.Tset < 0 ? ' (arrastra).' : ' (frena).'));
            self.buildDynoKnob();
            self.hooks.changed(false);
        }
        ms.addEventListener('pointerdown', function (e) { if (e.button === 0) tm(e); });
        ms.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tm(); } });
        /* sentido de giro (modo velocidad) */
        var ds = this.gDirSw = el('g', { 'class': 'locksw', tabindex: 0, role: 'switch', 'aria-label': 'Sentido de giro del accionamiento' }, g);
        el('rect', { x: x + 160, y: 650, width: 56, height: 104, rx: 8, 'class': 'lock-body' }, ds);
        this.dirLever = el('rect', { x: x + 170, y: 660, width: 36, height: 40, rx: 6, 'class': 'lock-lever' }, ds);
        this.dirTxt = txt(ds, x + 188, 686, '↻', 'lock-txt big', { 'text-anchor': 'middle' });
        txt(g, x + 188, 770, 'SENTIDO', 'mini-lbl', { 'text-anchor': 'middle' });
        W.title(ds, 'Sentido de giro del accionamiento (modo VELOCIDAD, o modo PAR con consigna negativa): ↻ horario, ↺ antihorario');
        function td(e) {
            if (e) e.stopPropagation();
            dy.dir = -dy.dir;
            self.hooks.log('Sentido de giro del accionamiento: ' + (dy.dir > 0 ? 'horario.' : 'antihorario.'));
            self.hooks.changed(false);
        }
        ds.addEventListener('pointerdown', function (e) { if (e.button === 0) td(e); });
        ds.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); td(); } });
        /* temperatura */
        txt(g, x + 16, 838, 'TEMPERATURA DEVANADOS (PTC)', 'mini-lbl');
        this.thLeds = [];
        for (var i = 0; i < 12; i++) this.thLeds.push(el('rect', { x: x + 16 + i * 23, y: 846, width: 19, height: 12, rx: 2, 'class': 'th-led ' + (i < 7 ? 'g' : i < 10 ? 'a' : 'r') }, g));
        this.buildDynoKnob();
    };

    Bench.prototype.buildDynoKnob = function () {
        var self = this, dy = this.lab.dyno, g = this.gDynoKnob, x = 1172, ticks = [], v;
        g.innerHTML = '';
        var spd = dy.mode === 'n';
        if (spd) {
            var nmax = dy.nmax, stp = nmax > 3000 ? 100 : 100;
            for (v = 0; v <= nmax + 1e-9; v += stp) ticks.push(v);
            this.kDyno = new W.Knob(g, {
                cx: x + 80, cy: 704, r: 34, min: 0, max: nmax, value: dy.nset, step: 5, wheel: 50, keyStep: 5, sweep: 280,
                ticks: ticks, major: 5, fmt: function (v) { return f(v / 1000, v % 1000 ? 1 : 0); }, label: 'Consigna de velocidad del dinamómetro (min⁻¹)',
                onChange: function (v) { dy.nset = v; self.updateDynoTxt(); self.hooks.changed(false); }
            });
        } else {
            var Tm = dy.Tmax, st = (dy.Tmajor || Tm / 4) / 5;
            for (v = -Tm; v <= Tm + 1e-9; v += st) ticks.push(+v.toFixed(3));
            this.kDyno = new W.Knob(g, {
                cx: x + 80, cy: 704, r: 34, min: -Tm, max: Tm, value: Math.max(-Tm, Math.min(dy.Tset, Tm)), step: 0.05, wheel: 0.5, keyStep: 0.05, sweep: 280,
                ticks: ticks, major: 5, fmt: function (v) { return String(Math.round(v)); }, label: 'Consigna de par del dinamómetro (N·m): positiva frena, negativa arrastra',
                onChange: function (v) { dy.Tset = Math.abs(v) < 0.025 ? 0 : v; self.updateDynoTxt(); self.hooks.changed(false); }
            });
        }
        this.dynoTxt = txt(g, x + 80, 794, '', 'spec', { 'text-anchor': 'middle' });
        txt(g, x + 80, 810, spd ? 'VELOCIDAD (escala ×1000)' : 'PAR  (+ frena · − arrastra)', 'mini-lbl', { 'text-anchor': 'middle' });
        var k = this.kDyno, d = spd ? 5 : 0.05;
        W.PushButton(g, x + 14, 760, 26, 22, '−', function () { k.set(k.value - d, true); }, 'small', true);
        W.PushButton(g, x + 120, 760, 26, 22, '+', function () { k.set(k.value + d, true); }, 'small', true);
        this.updateDynoTxt();
    };
    Bench.prototype.updateDynoTxt = function () {
        var dy = this.lab.dyno;
        if (this.dynoTxt) this.dynoTxt.textContent = dy.mode === 'n' ? (dy.dir > 0 ? '↻ ' : '↺ ') + Math.round(dy.nset) + ' min⁻¹' :
            dy.Tset >= 0 ? f(dy.Tset, 2) + ' N·m (frena)' : (dy.dir > 0 ? '↻ ' : '↺ ') + f(-dy.Tset, 2) + ' N·m (arrastra)';
    };
    /* el dinamómetro ha cambiado desde la simulación (disparo, sobrevelocidad…) */
    Bench.prototype.dynoChanged = function () { this.buildDynoKnob(); };

    Bench.prototype.frameDyno = function (dt, rd) {
        var dy = this.lab.dyno, spd = dy.mode === 'n';
        this.modeLever.setAttribute('y', spd ? 704 : 660);
        this.modeLever.setAttribute('class', 'lock-lever' + (spd ? ' on' : ''));
        this.modeTxt.setAttribute('y', spd ? 729 : 685);
        this.modeTxt.textContent = spd ? 'VEL.' : 'PAR';
        this.dirLever.setAttribute('y', dy.dir < 0 ? 704 : 660);
        this.dirTxt.setAttribute('y', dy.dir < 0 ? 730 : 686);
        this.dirTxt.textContent = dy.dir < 0 ? '↺' : '↻';
        this.gDirSw.classList.toggle('dim', !spd && dy.Tset >= 0);
        if (rd) {
            var th = rd.thermal * 12;
            for (var i = 0; i < 12; i++) this.thLeds[i].classList.toggle('lit', i < th);
            this.ledCW.setAttribute('class', 'lamp green' + (rd.n > 1 ? ' lit' : ''));
            this.ledCCW.setAttribute('class', 'lamp amber' + (rd.n < -1 ? ' lit' : ''));
            this.ledMot.setAttribute('class', 'lamp green' + (rd.T > 0.05 && Math.abs(rd.n) > 1 ? ' lit' : ''));
        }
        this.updateDynoTxt();
    };
    Bench.prototype.displaysDyno = function (rd, shown) {
        var f7 = W.fmt7;
        var n = Math.abs(rd.n) < 0.5 ? 0 : noisy(rd.n, 0.0002);
        this.dN.set(f7(n, 6, 0)); shown.n = n;
        var T = Math.abs(rd.T) < 0.005 ? 0 : noisy(rd.T, 0.0015);
        this.dT.set(f7(T, 6, 2)); shown.T = T;
    };

    /* ================= Animación y displays ================= */
    DCBench.prototype.frameMachine = function (dt, rd) {
        var lab = this.lab, i;
        this.spin(dt, lab.w);
        /* delgas del colector */
        var ph = this.phase * 3;
        for (i = 0; i < this.commBars.length; i++) {
            var a = ph + i * Math.PI * 2 / this.commBars.length, c = Math.cos(a);
            this.commBars[i].setAttribute('y', (601 - 30 * Math.sin(a)).toFixed(2));
            this.commBars[i].setAttribute('opacity', c > 0 ? (0.3 + 0.6 * c).toFixed(2) : 0);
        }
        /* chispas en las escobillas con mucha corriente */
        var sp = rd ? Math.abs(rd.ia) / lab.P.In : 0;
        this.spark.setAttribute('opacity', sp > 1.6 && Math.abs(lab.w) > 1 ? (Math.random() * Math.min(1, sp - 1.6)).toFixed(2) : 0);
        var hum = lab.on && Math.abs(lab.w) < 0.5 && rd && Math.abs(rd.ia) > 0.3 * lab.P.In;
        this.gMot.setAttribute('transform', hum ? 'translate(' + (Math.random() - 0.5).toFixed(2) + ',0)' : '');
        ['A', 'F'].forEach(function (k) {
            var on = lab.out[k], sw = this.swOut[k];
            sw.lever.setAttribute('transform', on ? 'translate(20,0)' : '');
            sw.lever.setAttribute('class', 'rocker-lever' + (on ? ' on' : ''));
            sw.t.setAttribute('transform', on ? 'translate(20,0)' : '');
            sw.t.textContent = on ? 'I' : '0';
            this.lampOut[k].setAttribute('class', 'lamp green' + (lab.on && on ? ' lit' : ''));
        }, this);
        var lo = lab.load.on;
        this.ldLever.setAttribute('y', lo ? 500 : 456);
        this.ldLever.setAttribute('class', 'lock-lever' + (lo ? ' on' : ''));
        this.ldLeverTxt.setAttribute('y', lo ? 525 : 481);
        this.ldLeverTxt.textContent = lo ? 'ON' : 'OFF';
        this.ldLamp.setAttribute('class', 'lamp amber' + (lo ? ' lit' : ''));
        this.frameDyno(dt, rd);
    };

    DCBench.prototype.displays = function (rd) {
        var f7 = W.fmt7, shown = {};
        function meter(d, v, range, dec, rel, k) {
            if (Math.abs(v) > range) { d.set(v < 0 ? '-OL' : 'OL'); shown[k] = NaN; return; }
            var x = noisy(v, rel);
            if (Math.abs(x) < Math.pow(10, -dec) / 2) x = 0;
            d.set(f7(x, 5, dec)); shown[k] = x;
        }
        meter(this.da1, rd.a1, 30, 2, 0.001, 'A1');
        meter(this.dv1, rd.v1, 600, 1, 0.0008, 'V1');
        meter(this.da2, rd.a2, 3, 3, 0.001, 'A2');
        meter(this.dv2, rd.v2, 600, 1, 0.0008, 'V2');
        this.dOut.A.set(f7(Math.abs(rd.uA) < 0.5 ? 0 : noisy(rd.uA, 0.0008), 4, 1));
        this.dOut.F.set(f7(Math.abs(rd.uF) < 0.5 ? 0 : noisy(rd.uF, 0.0008), 4, 1));
        if (rd.mm.live) { this.dmm.set('Err'); this.mmUnit.textContent = 'V !'; }
        else {
            var R = rd.mm.R;
            if (!isFinite(R) || R > 40e6 || R < 0) { this.dmm.set('OL'); this.mmUnit.textContent = 'Ω'; }
            else if (R >= 1e6) { this.dmm.set(f7(R / 1e6, 5, 3)); this.mmUnit.textContent = 'MΩ'; }
            else if (R >= 1e3) { this.dmm.set(f7(R / 1e3, 5, 3)); this.mmUnit.textContent = 'kΩ'; }
            else { this.dmm.set(f7(R < 0.005 ? 0 : noisy(R, 0.0005), 5, 3)); this.mmUnit.textContent = 'Ω'; }
        }
        this.displaysDyno(rd, shown);
        return shown;
    };

    VEM.DCBench = DCBench;
})();
