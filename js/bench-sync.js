/* =====================================================================
   VEMLAB · Banco de la máquina síncrona (SVG interactivo)
   Red trifásica regulable, vatímetros, amperímetro, voltímetro y fuente
   de excitación arriba; abajo la caja de bornes (estátor con puentes y
   excitación F1–F2), el panel de sincronización (doble voltímetro,
   doble frecuencímetro, sincronoscopio, lámparas y el interruptor de
   acoplamiento Q2), la carga R–L–C, la máquina y el dinamómetro.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, W = VEM.W, el = W.el, txt = W.txt, Bench = VEM.Bench, INFO = Bench.INFO;
    var LOAD = VEM.Sync.LOAD, EXC = VEM.Sync.EXC, f = VEM.fmtN, noisy = Bench.noisy;

    var SINFO = {
        'm.F1': 'Máquina síncrona · excitación · borne F1', 'm.F2': 'Máquina síncrona · excitación · borne F2',
        'ex.+': 'Fuente de excitación · borne +', 'ex.-': 'Fuente de excitación · borne −',
        'sy.L1': 'Panel de sincronización · lado RED · L1', 'sy.L2': 'Panel de sincronización · lado RED · L2', 'sy.L3': 'Panel de sincronización · lado RED · L3',
        'sy.G1': 'Panel de sincronización · lado ALTERNADOR · G1', 'sy.G2': 'Panel de sincronización · lado ALTERNADOR · G2', 'sy.G3': 'Panel de sincronización · lado ALTERNADOR · G3',
        'ld.L1': 'Carga R–L–C · borne L1', 'ld.L2': 'Carga R–L–C · borne L2', 'ld.L3': 'Carga R–L–C · borne L3', 'ld.N': 'Carga R–L–C · neutro N'
    };
    [['U', 'U'], ['V', 'V'], ['W', 'W']].forEach(function (b) {
        SINFO['m.' + b[0] + '1'] = 'Máquina síncrona · borne ' + b[0] + '1 (principio de la bobina ' + b[1] + ' del estátor)';
        SINFO['m.' + b[0] + '2'] = 'Máquina síncrona · borne ' + b[0] + '2 (final de la bobina ' + b[1] + ' del estátor)';
    });

    function SyncBench(svg, lab, hooks) {
        Object.assign(INFO, SINFO);
        Bench.call(this, svg, lab, hooks);
    }
    SyncBench.prototype = Object.create(Bench.prototype);
    SyncBench.prototype.constructor = SyncBench;

    SyncBench.prototype.defs = function (svg) {
        Bench.prototype.defs.call(this, svg);
        var d = svg.querySelector('defs');
        function lin(id, stops) {
            var g = el('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, d);
            stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
        }
        lin('gSyn', [[0, '#2a2f45'], [0.18, '#555f8a'], [0.33, '#8590b8'], [0.5, '#46507a'], [1, '#1b1f33']]);
        lin('gSynDark', [[0, '#1a1d2c'], [0.3, '#363d5c'], [1, '#141726']]);
        lin('gRing', [[0, '#5d646d'], [0.4, '#e3e7ec'], [0.6, '#c3c9d0'], [1, '#4b5159']]);
    };
    SyncBench.prototype.mainsOnMsg = function () {
        return 'Interruptor Q1 cerrado: red conectada a ' + Math.round(this.lab.variac * VEM.SyncLab.U_MAX) + ' V.';
    };

    /* ================= Fila superior ================= */
    SyncBench.prototype.buildTop = function (g) {
        this.buildSource(g);
        this.buildWattmeter(g, 'w1', 'W1', 460);
        this.buildWattmeter(g, 'w2', 'W2', 705);
        this.buildMeter(g, 'am', 950, 'AMPERÍMETRO', 'A', 'A', '20 A ~', 'red');
        this.buildMeter(g, 'vm', 1130, 'VOLTÍMETRO', 'V', 'V', '600 V ~', 'green');
        this.buildExciter(g, 1310);
    };

    SyncBench.prototype.buildExciter = function (p, x) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev src', filter: 'url(#fShadow)' }, p), w = 170, cx = x + w / 2;
        el('rect', { x: x, y: 20, width: w, height: 335, rx: 10, fill: 'url(#gPanel)', 'class': 'panel-light' }, g);
        el('rect', { x: x, y: 20, width: w, height: 38, rx: 10, 'class': 'panel-band' }, g);
        el('rect', { x: x, y: 46, width: w, height: 12, 'class': 'panel-band' }, g);
        txt(g, x + 14, 44, 'EXCITACIÓN', 'dev-title light');
        txt(g, x + w - 12, 44, '0–250 V =', 'dev-sub light', { 'text-anchor': 'end' });
        [[64, 'U', 'V', 'dExU', 'amber'], [108, 'I', 'A', 'dExI', 'red']].forEach(function (o) {
            el('rect', { x: x + 12, y: o[0], width: w - 24, height: 40, rx: 5, 'class': 'bezel' }, g);
            el('rect', { x: x + 16, y: o[0] + 4, width: w - 32, height: 32, rx: 3, 'class': 'lcd-led' }, g);
            txt(g, x + 24, o[0] + 24, o[1], 'disp-lbl ' + o[4]);
            self[o[3]] = new W.SevenSeg(g, x + 48, o[0] + 9, 4, 22, o[4]);
            txt(g, x + w - 22, o[0] + 32, o[2], 'disp-unit ' + o[4], { 'text-anchor': 'end' });
        });
        var ticks = []; for (var v = 0; v <= EXC.Umax; v += 10) ticks.push(v);
        this.kEx = new W.Knob(g, {
            cx: cx, cy: 210, r: 28, min: 0, max: EXC.Umax, value: lab.ex.U, step: 0.5, wheel: 2, keyStep: 0.5, sweep: 280,
            ticks: ticks, major: 5, fmt: function (v) { return String(v); }, label: 'Tensión de la fuente de excitación',
            onChange: function (v) { lab.ex.U = v; self.hooks.changed(false); }
        });
        W.PushButton(g, x + 14, 268, 28, 24, '−', function () { self.kEx.set(self.kEx.value - 0.5, true); }, 'small', true);
        W.PushButton(g, x + w - 42, 268, 28, 24, '+', function () { self.kEx.set(self.kEx.value + 0.5, true); }, 'small', true);
        var sw = this.swEx = el('g', { 'class': 'rocker', tabindex: 0, role: 'switch', 'aria-label': 'Contactor de la excitación' }, g);
        el('rect', { x: cx - 24, y: 266, width: 48, height: 28, rx: 5, 'class': 'rocker-body' }, sw);
        sw.lever = el('rect', { x: cx - 20, y: 270, width: 20, height: 20, rx: 3, 'class': 'rocker-lever' }, sw);
        sw.t = txt(sw, cx - 10, 285, '0', 'rocker-txt', { 'text-anchor': 'middle' });
        W.title(sw, 'Contactor de la fuente de excitación');
        function tog(e) {
            if (e) e.stopPropagation();
            lab.ex.on = !lab.ex.on;
            self.hooks.log('Excitación ' + (lab.ex.on ? 'conectada (' + f(lab.ex.U, 1) + ' V).' : 'desconectada.'));
            self.hooks.changed(false);
        }
        sw.addEventListener('pointerdown', function (e) { if (e.button === 0) tog(e); });
        sw.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
        this.lampEx = this.lamp(g, cx, 250, 'green');
        el('rect', { x: x + 14, y: 304, width: w - 28, height: 42, rx: 6, 'class': 'sock-strip' }, g);
        this.socket(g, 'ex.+', cx - 30, 325, '#d0312d', null);
        this.socket(g, 'ex.-', cx + 30, 325, '#1d1f22', null);
        txt(g, cx - 10, 330, '+', 'sock-lbl strong', { 'text-anchor': 'middle' });
        txt(g, cx + 50, 330, '−', 'sock-lbl strong', { 'text-anchor': 'middle' });
    };

    /* ================= Fila inferior ================= */
    SyncBench.prototype.buildMachine = function (g) {
        this.buildSyncBox(g);
        this.buildSyncPanel(g);
        this.buildSyncLoad(g);
        this.buildSyncMachine(g);
        this.buildDynoPanel(g);
    };
    SyncBench.prototype.modelChanged = function () { this.setPlate(); this.buildDynoKnob(); };

    /* ---------------- Caja de bornes: estátor con puentes + excitación ---------------- */
    var STUDS = {
        'm.U1': [70, 500, 'U1'], 'm.V1': [145, 500, 'V1'], 'm.W1': [220, 500, 'W1'],
        'm.W2': [70, 640, 'W2'], 'm.U2': [145, 640, 'U2'], 'm.V2': [220, 640, 'V2'],
        'm.F1': [285, 500, 'F1'], 'm.F2': [285, 640, 'F2']
    };
    var SLOT = {
        'U1-W2': { x: 70, y: 570, v: true }, 'V1-U2': { x: 145, y: 570, v: true }, 'W1-V2': { x: 220, y: 570, v: true },
        'W2-U2': { x: 107.5, y: 640, v: false }, 'U2-V2': { x: 182.5, y: 640, v: false }
    };
    SyncBench.prototype.buildSyncBox = function (p) {
        var self = this, g = el('g', { 'class': 'tbox', filter: 'url(#fShadow)' }, p);
        el('rect', { x: 20, y: 396, width: 310, height: 484, rx: 14, fill: 'url(#gSynDark)', 'class': 'mot-edge' }, g);
        el('rect', { x: 32, y: 440, width: 286, height: 270, rx: 8, fill: 'url(#gBoxIn)', 'class': 'box-in' }, g);
        txt(g, 36, 425, 'CAJA DE BORNES', 'dev-title');
        txt(g, 316, 425, 'vista ampliada', 'dev-sub', { 'text-anchor': 'end' });
        el('rect', { x: 40, y: 458, width: 210, height: 230, rx: 10, 'class': 'box-base' }, g);
        el('rect', { x: 258, y: 458, width: 54, height: 230, rx: 10, 'class': 'box-base f' }, g);
        el('path', { d: 'M285,524 V548 M285,592 V616', 'class': 'dc-wire' }, g);
        el('path', { d: 'M285,548 a6,6 0 0 1 0,11 a6,6 0 0 1 0,11 a6,6 0 0 1 0,11 a6,6 0 0 1 0,11', 'class': 'dc-coil shu' }, g);
        this.gSlots = el('g', null, g);
        Object.keys(SLOT).forEach(function (k) {
            var s = SLOT[k];
            var r = s.v ? { x: s.x - 14, y: s.y - 44, width: 28, height: 88 } : { x: s.x - 22, y: s.y - 14, width: 44, height: 28 };
            var slot = el('rect', Object.assign({ rx: 6, 'class': 'slot', 'data-bridge': k, tabindex: 0, role: 'button', 'aria-label': 'Puente ' + k }, r), self.gSlots);
            W.title(slot, 'Poner / quitar puente ' + k.replace('-', '–'));
            function tog(e) { if (e) e.stopPropagation(); self.toggleBridge(k); }
            slot.addEventListener('pointerdown', function (e) { if (e.button === 0) tog(e); });
            slot.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
        });
        this.gBridges = el('g', { 'class': 'bridges' }, g);
        this.gStuds = el('g', null, g);
        Object.keys(STUDS).forEach(function (id) {
            var s = STUDS[id];
            self.pos[id] = { x: s[0], y: s[1], r: 19 };
            txt(g, s[0], s[1] + (s[1] < 600 ? -26 : 42), s[2], 'stud-lbl', { 'text-anchor': 'middle' });
        });
        this.drawStuds();
        W.PushButton(g, 34, 722, 90, 30, 'Estrella Y', function () { self.setBridges('Y'); }, 'tool');
        W.PushButton(g, 130, 722, 90, 30, 'Triáng. Δ', function () { self.setBridges('D'); }, 'tool');
        W.PushButton(g, 226, 722, 90, 30, 'Sin puentes', function () { self.setBridges(null); }, 'tool');
        txt(g, 175, 790, 'Estátor: U1–U2 · V1–V2 · W1–W2', 'box-hint', { 'text-anchor': 'middle' });
        txt(g, 175, 808, 'Excitación (rotor): F1–F2', 'box-hint', { 'text-anchor': 'middle' });
        txt(g, 175, 832, 'Pulsa entre dos bornes del estátor', 'box-hint', { 'text-anchor': 'middle' });
        txt(g, 175, 848, 'para poner o quitar un puente', 'box-hint', { 'text-anchor': 'middle' });
    };
    SyncBench.prototype.drawStuds = function () {
        var g = this.gStuds; g.innerHTML = '';
        Object.keys(STUDS).forEach(function (id) {
            var s = STUDS[id], x = s[0], y = s[1], hex = [];
            for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; hex.push((x + 16 * Math.cos(a)).toFixed(1) + ',' + (y + 16 * Math.sin(a)).toFixed(1)); }
            el('circle', { cx: x, cy: y + 2, r: 20, 'class': 'sock-shadow' }, g);
            el('polygon', { points: hex.join(' '), fill: 'url(#gBrass)', 'class': 'nut' }, g);
            el('circle', { cx: x, cy: y, r: 7.5, fill: 'url(#gBrass)', 'class': 'stud' }, g);
            el('circle', { cx: x, cy: y, r: 3, 'class': 'stud-hole' }, g);
        });
    };
    SyncBench.prototype.renderBridges = function () {
        var g = this.gBridges, br = this.lab.bridges;
        if (!g) return;
        g.innerHTML = '';
        Object.keys(SLOT).forEach(function (k) {
            if (!br[k]) return;
            var s = SLOT[k], a = STUDS['m.' + k.split('-')[0]], b = STUDS['m.' + k.split('-')[1]];
            var x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]);
            var r = s.v ? { x: x0 - 12, y: y0 - 12, width: 24, height: Math.abs(b[1] - a[1]) + 24 } : { x: x0 - 12, y: y0 - 12, width: Math.abs(b[0] - a[0]) + 24, height: 24 };
            el('rect', Object.assign({ rx: 7, fill: 'url(#gCopper)', 'class': 'bridge' }, r), g);
        });
        this.gSlots.querySelectorAll('.slot').forEach(function (s) { s.classList.toggle('on', !!br[s.getAttribute('data-bridge')]); });
    };

    /* ---------------- Panel de sincronización ---------------- */
    SyncBench.prototype.buildSyncPanel = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), x = 342, w = 310, i;
        el('rect', { x: x, y: 396, width: w, height: 484, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 402, width: w - 12, height: 472, rx: 7, 'class': 'housing-inner' }, g);
        txt(g, x + 16, 426, 'SINCRONIZACIÓN', 'dev-title');
        txt(g, x + w - 14, 426, 'acoplamiento a la red', 'dev-sub', { 'text-anchor': 'end' });
        this.dSy = {};
        [['uL', 'U RED', 'V', 'amber', 0, 440], ['uG', 'U ALT.', 'V', 'amber', 1, 440], ['fL', 'f RED', 'Hz', 'green', 0, 498], ['fG', 'f ALT.', 'Hz', 'green', 1, 498]].forEach(function (o) {
            var bx = x + 14 + o[4] * 146, by = o[5];
            el('rect', { x: bx, y: by, width: 136, height: 50, rx: 5, 'class': 'bezel' }, g);
            el('rect', { x: bx + 4, y: by + 4, width: 128, height: 42, rx: 3, 'class': 'lcd-led' }, g);
            txt(g, bx + 10, by + 18, o[1], 'disp-lbl-s ' + o[3]);
            self.dSy[o[0]] = new W.SevenSeg(g, bx + 40, by + 13, 4, 24, o[3]);
            txt(g, bx + 128, by + 42, o[2], 'disp-unit ' + o[3], { 'text-anchor': 'end', 'font-size': 11 });
        });
        /* sincronoscopio */
        var cx = x + 82, cy = 632, R = 56;
        el('circle', { cx: cx, cy: cy, r: R + 8, 'class': 'bezel' }, g);
        el('circle', { cx: cx, cy: cy, r: R, 'class': 'syn-face' }, g);
        for (i = 0; i < 24; i++) {
            var a = i * 15 * Math.PI / 180, r1 = R - (i % 6 === 0 ? 12 : 6);
            el('line', { x1: cx + r1 * Math.sin(a), y1: cy - r1 * Math.cos(a), x2: cx + (R - 2) * Math.sin(a), y2: cy - (R - 2) * Math.cos(a), 'class': 'syn-tick' }, g);
        }
        el('path', { d: 'M' + (cx - 9) + ',' + (cy - R + 2) + ' h18 l-9,12 z', 'class': 'syn-zero' }, g);
        txt(g, cx - 30, cy + 26, '◄ LENTO', 'syn-lbl', { 'text-anchor': 'middle' });
        txt(g, cx + 30, cy + 26, 'RÁPIDO ►', 'syn-lbl', { 'text-anchor': 'middle' });
        this.synPtr = el('g', null, g);
        el('line', { x1: cx, y1: cy + 10, x2: cx, y2: cy - R + 10, 'class': 'syn-ptr' }, this.synPtr);
        el('circle', { cx: cx, cy: cy, r: 5, 'class': 'syn-hub' }, g);
        txt(g, cx, cy + R + 22, 'SINCRONOSCOPIO', 'mini-lbl', { 'text-anchor': 'middle' });
        this.synCx = cx; this.synCy = cy;
        /* lámparas */
        this.syLamps = [];
        this.syLampLbl = [];
        for (i = 0; i < 3; i++) {
            var lx = x + 186 + i * 40;
            el('circle', { cx: lx, cy: 588, r: 15, 'class': 'lamp-rim' }, g);
            this.syLamps.push(el('circle', { cx: lx, cy: 588, r: 11.5, 'class': 'sylamp' }, g));
            this.syLampLbl.push(txt(g, lx, 618, '', 'mini-lbl', { 'text-anchor': 'middle' }));
        }
        var ls = this.gLampSw = el('g', { 'class': 'rocker', tabindex: 0, role: 'switch', 'aria-label': 'Conexión de las lámparas: apagadas o giratorias' }, g);
        el('rect', { x: x + 186, y: 632, width: 80, height: 28, rx: 5, 'class': 'rocker-body' }, ls);
        ls.lever = el('rect', { x: x + 190, y: 636, width: 36, height: 20, rx: 3, 'class': 'rocker-lever' }, ls);
        ls.t = txt(ls, x + 208, 650, 'APAG.', 'rocker-txt sm', { 'text-anchor': 'middle' });
        txt(g, x + 226, 676, 'LÁMPARAS', 'mini-lbl', { 'text-anchor': 'middle' });
        W.title(ls, 'Conexión de las lámparas de sincronización: APAGADAS (L1–G1, L2–G2, L3–G3) o GIRATORIAS (L1–G1, L2–G3, L3–G2)');
        function tl(e) {
            if (e) e.stopPropagation();
            lab.lampMode = lab.lampMode === 'rot' ? 'dark' : 'rot';
            self.hooks.log('Lámparas de sincronización en conexión ' + (lab.lampMode === 'rot' ? 'giratoria.' : 'a lámparas apagadas.'));
            self.hooks.changed(false);
        }
        ls.addEventListener('pointerdown', function (e) { if (e.button === 0) tl(e); });
        ls.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tl(); } });
        /* interruptor de acoplamiento Q2 */
        var q = this.gQ2 = el('g', { 'class': 'breaker', tabindex: 0, role: 'switch', 'aria-label': 'Interruptor de acoplamiento Q2' }, g);
        el('rect', { x: x + 14, y: 716, width: 282, height: 62, rx: 6, 'class': 'brk-body' }, q);
        el('rect', { x: x + 14, y: 716, width: 64, height: 62, rx: 5, 'class': 'brk-top' }, q);
        txt(q, x + 46, 742, 'Q2', 'brk-txt big', { 'text-anchor': 'middle' });
        txt(q, x + 46, 760, 'ACOPL.', 'brk-txt', { 'text-anchor': 'middle' });
        el('rect', { x: x + 96, y: 730, width: 120, height: 34, rx: 4, 'class': 'brk-slot' }, q);
        this.q2Lever = el('rect', { x: x + 100, y: 734, width: 56, height: 26, rx: 3, 'class': 'brk-lever' }, q);
        this.q2Txt = txt(q, x + 128, 752, 'O', 'brk-lever-txt', { 'text-anchor': 'middle' });
        txt(q, x + 256, 744, 'pulsa para', 'brk-txt', { 'text-anchor': 'middle' });
        txt(q, x + 256, 758, 'acoplar', 'brk-txt', { 'text-anchor': 'middle' });
        W.title(q, 'Interruptor de acoplamiento Q2: une el alternador (G) con la red (L). Ciérralo solo cuando estén en sincronismo.');
        function tq(e) {
            if (e) e.stopPropagation();
            if (lab.q2) { lab.openQ2(); self.hooks.log('Q2 abierto: alternador desacoplado de la red.'); }
            else if (lab.closeQ2()) self.hooks.log('Q2 cerrado: alternador acoplado a la red.');
            self.hooks.changed(false);
        }
        q.addEventListener('pointerdown', function (e) { if (e.button === 0) tq(e); });
        q.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tq(); } });
        /* bornes */
        el('rect', { x: x + 14, y: 790, width: 282, height: 76, rx: 6, 'class': 'sock-strip' }, g);
        txt(g, x + 80, 806, 'RED', 'mini-lbl', { 'text-anchor': 'middle' });
        txt(g, x + 226, 806, 'ALTERNADOR', 'mini-lbl', { 'text-anchor': 'middle' });
        el('line', { x1: x + 155, y1: 798, x2: x + 155, y2: 858, 'class': 'sep' }, g);
        var cols = ['#7b4a24', '#1d1f22', '#8a9097'];
        for (i = 0; i < 3; i++) {
            this.socket(g, 'sy.L' + (i + 1), x + 36 + i * 44, 830, cols[i], 'L' + (i + 1), 28);
            this.socket(g, 'sy.G' + (i + 1), x + 182 + i * 44, 830, cols[i], 'G' + (i + 1), 28);
        }
    };

    /* ---------------- Carga R–L–C ---------------- */
    SyncBench.prototype.buildSyncLoad = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), x = 664, w = 496;
        el('rect', { x: x, y: 396, width: w, height: 204, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 402, width: w - 12, height: 192, rx: 7, 'class': 'housing-inner' }, g);
        txt(g, x + 16, 426, 'CARGA TRIFÁSICA R–L–C', 'dev-title');
        txt(g, x + w - 14, 426, 'Y · 10 escalones de ' + f(LOAD.R / 1000, 1) + ' kW / kvar a ' + LOAD.U + ' V', 'dev-sub', { 'text-anchor': 'end' });
        var KN = [{ k: 'R', u: 'kW', c: 'red', t: 'Carga resistiva' }, { k: 'L', u: 'kvar', c: 'amber', t: 'Carga inductiva' }, { k: 'C', u: 'kvar', c: 'green', t: 'Carga capacitiva' }];
        var ticks = []; for (var v = 0; v <= LOAD.steps; v++) ticks.push(v);
        this.ldTxt = {};
        KN.forEach(function (o, i) {
            var cx = x + 58 + i * 98;
            new W.Knob(g, {
                cx: cx, cy: 490, r: 22, min: 0, max: LOAD.steps, value: lab.load[o.k], step: 1, wheel: 1, sweep: 270,
                ticks: ticks, major: 5, fmt: function (v) { return String(v); }, label: o.t + ' (escalones)',
                onChange: function (v) { lab.load[o.k] = v; self.updateLoadTxt(); self.hooks.changed(false); }
            });
            txt(g, cx, 556, o.k, 'disp-lbl ' + o.c, { 'text-anchor': 'middle' });
            self.ldTxt[o.k] = txt(g, cx, 574, '', 'spec', { 'text-anchor': 'middle' });
        });
        var sw = el('g', { 'class': 'locksw', tabindex: 0, role: 'switch', 'aria-label': 'Interruptor de la carga' }, g);
        el('rect', { x: x + 298, y: 446, width: 58, height: 100, rx: 8, 'class': 'lock-body' }, sw);
        this.ldLever = el('rect', { x: x + 309, y: 456, width: 36, height: 38, rx: 6, 'class': 'lock-lever' }, sw);
        this.ldLeverTxt = txt(sw, x + 327, 480, 'OFF', 'lock-txt', { 'text-anchor': 'middle' });
        txt(g, x + 327, 566, 'CARGA', 'mini-lbl', { 'text-anchor': 'middle' });
        this.ldLamp = this.lamp(g, x + 327, 584, 'amber');
        W.title(sw, 'Interruptor de la carga');
        function tog(e) {
            if (e) e.stopPropagation();
            lab.load.on = !lab.load.on;
            self.hooks.log(lab.load.on ? 'Carga R–L–C conectada.' : 'Carga R–L–C desconectada.');
            self.hooks.changed(false);
        }
        sw.addEventListener('pointerdown', function (e) { if (e.button === 0) tog(e); });
        sw.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
        el('rect', { x: x + 366, y: 440, width: 116, height: 140, rx: 6, 'class': 'sock-strip' }, g);
        [['ld.L1', '#7b4a24', 'L1', 396, 474], ['ld.L2', '#1d1f22', 'L2', 452, 474], ['ld.L3', '#8a9097', 'L3', 396, 540], ['ld.N', '#1f5fbf', 'N', 452, 540]].forEach(function (c) {
            self.socket(g, c[0], x + c[3], c[4], c[1], c[2], 30);
        });
        this.updateLoadTxt();
    };
    SyncBench.prototype.updateLoadTxt = function () {
        var ld = this.lab.load;
        this.ldTxt.R.textContent = f(ld.R * LOAD.R / 1000, 1) + ' kW';
        this.ldTxt.L.textContent = f(ld.L * LOAD.L / 1000, 1) + ' kvar';
        this.ldTxt.C.textContent = f(ld.C * LOAD.C / 1000, 1) + ' kvar';
    };

    /* ---------------- Máquina ---------------- */
    SyncBench.prototype.buildSyncMachine = function (p) {
        var g = el('g', { 'class': 'machine', transform: 'translate(338.8,316.6) scale(0.7)' }, p), i;
        el('rect', { x: 466, y: 762, width: 690, height: 30, rx: 4, fill: 'url(#gSteel)', 'class': 'base' }, g);
        el('rect', { x: 466, y: 792, width: 690, height: 10, 'class': 'base-shadow' }, g);
        var m = this.gMot = el('g', null, g);
        el('path', { d: 'M585,700 h50 l8,62 h-66 z M740,700 h50 l8,62 h-66 z', fill: 'url(#gSynDark)', 'class': 'mot-edge' }, m);
        /* tapa con ventana: anillos rozantes y escobillas de la excitación */
        el('rect', { x: 478, y: 528, width: 78, height: 150, rx: 20, fill: 'url(#gSynDark)', 'class': 'mot-edge' }, m);
        el('rect', { x: 494, y: 560, width: 46, height: 82, rx: 6, 'class': 'dc-window' }, m);
        el('rect', { x: 498, y: 576, width: 14, height: 50, rx: 3, fill: 'url(#gRing)' }, m);
        el('rect', { x: 520, y: 576, width: 14, height: 50, rx: 3, fill: 'url(#gRing)' }, m);
        el('rect', { x: 500, y: 562, width: 10, height: 14, rx: 2, 'class': 'dc-brush-r' }, m);
        el('rect', { x: 522, y: 562, width: 10, height: 14, rx: 2, 'class': 'dc-brush-r' }, m);
        el('rect', { x: 552, y: 505, width: 252, height: 196, rx: 12, fill: 'url(#gSyn)', 'class': 'mot-edge' }, m);
        for (i = 0; i < 13; i++) el('line', { x1: 566, y1: 518 + i * 13.5, x2: 790, y2: 518 + i * 13.5, 'class': 'fin' }, m);
        el('rect', { x: 800, y: 520, width: 30, height: 166, rx: 8, fill: 'url(#gSynDark)', 'class': 'mot-edge' }, m);
        el('rect', { x: 640, y: 466, width: 104, height: 42, rx: 5, fill: 'url(#gSynDark)', 'class': 'mot-edge' }, m);
        el('rect', { x: 648, y: 472, width: 88, height: 30, rx: 3, 'class': 'tbox-lid' }, m);
        [[653, 477], [731, 477], [653, 497], [731, 497]].forEach(function (s) { el('circle', { cx: s[0], cy: s[1], r: 2.4, 'class': 'screw' }, m); });
        el('rect', { x: 580, y: 560, width: 208, height: 96, rx: 4, fill: 'url(#gPlate)', 'class': 'plate' }, m);
        this.plateTxt = el('g', { 'class': 'plate-txt' }, m);
        this.buildBrakeBody(g, 'DINAMÓMETRO');
        this.setPlate();
    };
    SyncBench.prototype.setPlate = function () {
        var P = this.lab.P, pl = P.plate, g = this.plateTxt;
        g.innerHTML = '';
        var y = 575, x = 589, x2 = 779;
        txt(g, x, y, 'Máq. síncr. 3~  ' + P.code, 'pl-h'); txt(g, x2, y, P.ip, 'pl-h', { 'text-anchor': 'end' }); y += 16;
        txt(g, x, y, f(pl.Sn / 1000, 1) + ' kVA · cos φ ' + f(pl.cos, 1), 'pl'); txt(g, x2, y, pl.f + ' Hz', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'Δ ' + pl.Ud + ' V', 'pl'); txt(g, x2, y, f(pl.Id, 2) + ' A', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'Y ' + pl.Uy + ' V', 'pl'); txt(g, x2, y, f(pl.Iy, 2) + ' A', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, pl.n + ' min⁻¹ · Exc. ' + Math.round(pl.Ufn) + ' V ' + f(pl.Ifn, 1) + ' A', 'pl');
    };

    /* ================= Animación y displays ================= */
    SyncBench.prototype.frameMachine = function (dt, rd) {
        var lab = this.lab, i;
        this.spin(dt, lab.w);
        var hum = lab.on && Math.abs(lab.w) < 0.5 && rd && Math.max(rd.Iw[0], rd.Iw[1], rd.Iw[2]) > 0.3 * lab.P.In;
        this.gMot.setAttribute('transform', hum ? 'translate(' + (Math.random() - 0.5).toFixed(2) + ',0)' : '');
        var on = lab.ex.on, sw = this.swEx;
        sw.lever.setAttribute('transform', on ? 'translate(20,0)' : '');
        sw.lever.setAttribute('class', 'rocker-lever' + (on ? ' on' : ''));
        sw.t.setAttribute('transform', on ? 'translate(20,0)' : '');
        sw.t.textContent = on ? 'I' : '0';
        this.lampEx.setAttribute('class', 'lamp green' + (lab.on && on ? ' lit' : ''));
        var rot = lab.lampMode === 'rot', ls = this.gLampSw;
        ls.lever.setAttribute('transform', rot ? 'translate(36,0)' : '');
        ls.t.setAttribute('transform', rot ? 'translate(36,0)' : '');
        ls.t.textContent = rot ? 'GIRAT.' : 'APAG.';
        var lbl = rot ? ['L1–G1', 'L2–G3', 'L3–G2'] : ['L1–G1', 'L2–G2', 'L3–G3'];
        for (i = 0; i < 3; i++) {
            this.syLampLbl[i].textContent = lbl[i];
            var b = rd ? Math.min(1, Math.pow(rd.lamps[i], 1.6)) : 0;
            this.syLamps[i].style.fill = 'rgba(255,' + Math.round(170 + 70 * b) + ',' + Math.round(60 + 120 * b) + ',' + (0.12 + 0.88 * b).toFixed(2) + ')';
            this.syLamps[i].style.filter = b > 0.15 ? 'drop-shadow(0 0 ' + (2 + 8 * b).toFixed(1) + 'px #ffc233)' : '';
        }
        /* sincronoscopio: solo con las dos tensiones presentes y Q2 abierto */
        var ang = rd && rd.sync ? rd.phi * 180 / Math.PI : 0;
        this.synPtr.setAttribute('transform', 'rotate(' + ang.toFixed(1) + ' ' + this.synCx + ' ' + this.synCy + ')');
        this.synPtr.setAttribute('opacity', rd && rd.sync ? 1 : 0.35);
        var q = lab.q2;
        this.q2Lever.setAttribute('x', q ? 498 : 442);
        this.q2Lever.setAttribute('class', 'brk-lever' + (q ? ' on' : ''));
        this.q2Txt.setAttribute('x', q ? 526 : 470);
        this.q2Txt.textContent = q ? 'I' : 'O';
        var lo = lab.load.on;
        this.ldLever.setAttribute('y', lo ? 498 : 456);
        this.ldLever.setAttribute('class', 'lock-lever' + (lo ? ' on' : ''));
        this.ldLeverTxt.setAttribute('y', lo ? 522 : 480);
        this.ldLeverTxt.textContent = lo ? 'ON' : 'OFF';
        this.ldLamp.setAttribute('class', 'lamp amber' + (lo ? ' lit' : ''));
        this.frameDyno(dt, rd);
    };

    SyncBench.prototype.displays = function (rd) {
        var f7 = W.fmt7, shown = {};
        function wat(r) {
            if (r.I > 20 || r.U > 600) return { s: 'OL', v: NaN };
            var v = noisy(r.P, 0.0015);
            if (Math.abs(v) < 0.05) v = 0;
            return { s: f7(v, 6, 1), v: v };
        }
        var w1 = wat(rd.w1), w2 = wat(rd.w2);
        this.dw1.set(w1.s); this.dw2.set(w2.s); shown.W1 = w1.v; shown.W2 = w2.v;
        var I = rd.am > 20 ? NaN : noisy(rd.am, 0.001);
        this.dam.set(rd.am > 20 ? 'OL' : f7(I < 0.0005 ? 0 : I, 5, 3)); shown.I = I;
        var U = rd.vm > 600 ? NaN : noisy(rd.vm, 0.0008);
        this.dvm.set(rd.vm > 600 ? 'OL' : f7(U < 0.05 ? 0 : U, 5, 1)); shown.U = U;
        this.dSrc.set(f7(rd.Uout < 0.5 ? 0 : noisy(rd.Uout, 0.0008), 4, 0));
        this.dExU.set(f7(rd.Uex < 0.05 ? 0 : noisy(rd.Uex, 0.0008), 4, 1));
        this.dExI.set(f7(Math.abs(rd.If) < 0.0005 ? 0 : noisy(Math.abs(rd.If), 0.001), 4, 3));
        this.dSy.uL.set(f7(rd.uL < 0.5 ? 0 : noisy(rd.uL, 0.0008), 4, 0));
        this.dSy.uG.set(f7(rd.uG < 0.5 ? 0 : noisy(rd.uG, 0.0008), 4, 0));
        this.dSy.fL.set(rd.fL ? f7(rd.fL, 4, 2) : '----');
        this.dSy.fG.set(rd.fG ? f7(rd.fG + (Math.random() - 0.5) * 0.004, 4, 2) : '----');
        this.displaysDyno(rd, shown);
        return shown;
    };

    VEM.SyncBench = SyncBench;
})();
