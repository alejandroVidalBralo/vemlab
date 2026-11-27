/* =====================================================================
   VEMLAB · Banco del transformador trifásico (SVG interactivo)
   Reutiliza del banco del motor la fuente, los instrumentos y el
   cableado; aporta la placa de bornes del transformador (núcleo de
   tres columnas con todos los extremos de devanado accesibles), el
   propio transformador con su placa de características y el banco de
   cargas R–L–C.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, W = VEM.W, el = W.el, txt = W.txt, Bench = VEM.Bench, INFO = Bench.INFO;
    var PH = ['U', 'V', 'W'], LOAD = VEM.Trafo.LOAD;

    PH.forEach(function (p) {
        INFO['t.1' + p + '1'] = 'Transformador · AT · principio (•) del devanado ' + p;
        INFO['t.1' + p + '2'] = 'Transformador · AT · final del devanado ' + p;
        INFO['t.2' + p + '1'] = 'Transformador · BT · principio (•) de la 1.ª mitad del devanado ' + p;
        INFO['t.2' + p + '2'] = 'Transformador · BT · final de la 1.ª mitad del devanado ' + p;
        INFO['t.2' + p + '3'] = 'Transformador · BT · principio (•) de la 2.ª mitad del devanado ' + p;
        INFO['t.2' + p + '4'] = 'Transformador · BT · final de la 2.ª mitad del devanado ' + p;
    });
    ['L1', 'L2', 'L3', 'N'].forEach(function (l) { INFO['ld.' + l] = 'Banco de cargas · borne ' + l; });

    function TrafoBench(svg, lab, hooks) { Bench.call(this, svg, lab, hooks); }
    TrafoBench.prototype = Object.create(Bench.prototype);
    TrafoBench.prototype.constructor = TrafoBench;

    TrafoBench.prototype.defs = function (svg) {
        Bench.prototype.defs.call(this, svg);
        var d = svg.querySelector('defs');
        function lin(id, stops, horiz) {
            var g = el('linearGradient', { id: id, x1: 0, y1: 0, x2: horiz ? 1 : 0, y2: horiz ? 0 : 1 }, d);
            stops.forEach(function (s) { el('stop', { offset: s[0], 'stop-color': s[1] }, g); });
        }
        lin('gCoil', [[0, '#5b2e10'], [0.18, '#b8692c'], [0.4, '#e3a15e'], [0.62, '#a85a22'], [1, '#4a240b']], true);
        lin('gCore', [[0, '#5d646d'], [0.5, '#8e969f'], [1, '#4b5159']]);
        lin('gCoreH', [[0, '#5d646d'], [0.5, '#9aa2ab'], [1, '#4b5159']], true);
        lin('gBoard', [[0, '#eef0ec'], [1, '#d3d6d0']]);
    };

    TrafoBench.prototype.buildMachine = function (g) {
        this.buildBoard(g);
        this.buildTrafo(g);
        this.buildLoadBank(g);
    };
    TrafoBench.prototype.modelChanged = function () { this.setPlate(); };
    TrafoBench.prototype.renderBridges = function () { /* sin puentes: todo se conecta con cables */ };

    /* ---------------- Placa de bornes ---------------- */
    var CX = [140, 380, 620], YT = 482, YB = 828, YM1 = 648, YM2 = 698;

    function coil(x, y0, y1, dir) {
        /* símbolo de bobina: semicírculos que se abomban hacia el núcleo (dir = +1 derecha, −1 izquierda) */
        var n = Math.max(3, Math.round((y1 - y0) / 26)), r = (y1 - y0) / n / 2, d = 'M' + x + ',' + y0;
        for (var i = 0; i < n; i++) d += ' a' + r + ',' + r + ' 0 0 ' + (dir > 0 ? 1 : 0) + ' 0,' + (2 * r);
        return d;
    }

    TrafoBench.prototype.buildBoard = function (p) {
        var self = this, g = el('g', { 'class': 'dev tboard', filter: 'url(#fShadow)' }, p);
        el('rect', { x: 20, y: 392, width: 740, height: 488, rx: 10, fill: 'url(#gBoard)', 'class': 'panel-light' }, g);
        el('rect', { x: 20, y: 392, width: 740, height: 38, rx: 10, 'class': 'panel-band' }, g);
        el('rect', { x: 20, y: 418, width: 740, height: 12, 'class': 'panel-band' }, g);
        txt(g, 36, 416, 'TRANSFORMADOR TRIFÁSICO · PLACA DE BORNES', 'dev-title light');
        txt(g, 744, 416, 'núcleo de 3 columnas', 'dev-sub light', { 'text-anchor': 'end' });
        [[32, 442], [748, 442], [32, 868], [748, 868]].forEach(function (s) { el('circle', { cx: s[0], cy: s[1], r: 3.5, 'class': 'screw' }, g); });
        /* núcleo (dibujo serigrafiado) */
        var core = el('g', { 'class': 'tb-core' }, g);
        el('rect', { x: CX[0] - 12, y: 446, width: CX[2] - CX[0] + 24, height: 16, rx: 3 }, core);
        el('rect', { x: CX[0] - 12, y: 848, width: CX[2] - CX[0] + 24, height: 16, rx: 3 }, core);
        CX.forEach(function (cx) { el('rect', { x: cx - 9, y: 446, width: 18, height: 418, rx: 2 }, core); });
        CX.forEach(function (cx, c) {
            var ph = PH[c], xa = cx - 62, xb = cx + 62;
            txt(g, cx, 478, ph, 'tb-col', { 'text-anchor': 'middle' });
            /* devanado de AT */
            el('path', { d: 'M' + xa + ',' + (YT + 14) + ' V520 M' + xa + ',790 V' + (YB - 14), 'class': 'tb-wire' }, g);
            el('path', { d: coil(xa, 520, 790, 1), 'class': 'tb-coil at' }, g);
            el('circle', { cx: xa + 18, cy: 514, r: 3.6, 'class': 'tb-dot' }, g);
            /* BT: dos mitades */
            el('path', { d: 'M' + xb + ',' + (YT + 14) + ' V506 M' + xb + ',626 V' + (YM1 - 14) + ' M' + xb + ',' + (YM2 + 14) + ' V722 M' + xb + ',806 V' + (YB - 14), 'class': 'tb-wire' }, g);
            el('path', { d: coil(xb, 506, 626, -1), 'class': 'tb-coil bt' }, g);
            el('path', { d: coil(xb, 722, 806, -1), 'class': 'tb-coil bt' }, g);
            el('circle', { cx: xb - 18, cy: 500, r: 3.6, 'class': 'tb-dot' }, g);
            el('circle', { cx: xb - 18, cy: 716, r: 3.6, 'class': 'tb-dot' }, g);
            /* bornes */
            self.socket(g, 't.1' + ph + '1', xa, YT, '#c62f2a', null);
            self.socket(g, 't.1' + ph + '2', xa, YB, '#c62f2a', null);
            txt(g, xa - 20, YT + 5, '1' + ph + '1', 'tb-lbl', { 'text-anchor': 'end' });
            txt(g, xa - 20, YB + 5, '1' + ph + '2', 'tb-lbl', { 'text-anchor': 'end' });
            [[1, YT], [2, YM1], [3, YM2], [4, YB]].forEach(function (b) {
                self.socket(g, 't.2' + ph + b[0], xb, b[1], '#1f5fbf', null);
                txt(g, xb + 20, b[1] + 5, '2' + ph + b[0], 'tb-lbl', { 'text-anchor': 'start' });
            });
        });
        txt(g, 390, 876, '1: alta tensión (AT)  ·  2: baja tensión (BT), dos mitades por columna  ·  •  principio de devanado', 'tb-hint', { 'text-anchor': 'middle' });
    };

    /* ---------------- Transformador y placa de características ---------------- */
    TrafoBench.prototype.buildTrafo = function (p) {
        var g = el('g', { 'class': 'machine' }, p);
        this.gTrafo = el('g', null, g);
        var m = this.gTrafo, xs = [852, 965, 1078];
        /* bancada y patas */
        el('rect', { x: 792, y: 744, width: 348, height: 16, rx: 3, fill: 'url(#gSteel)', 'class': 'base' }, g);
        el('path', { d: 'M812,728 h40 v16 h-40 z M1080,728 h40 v16 h-40 z', 'class': 'tr-foot' }, m);
        /* núcleo: culatas y bridas */
        el('rect', { x: 800, y: 432, width: 332, height: 30, rx: 3, fill: 'url(#gCore)', 'class': 'tr-edge' }, m);
        el('rect', { x: 800, y: 698, width: 332, height: 30, rx: 3, fill: 'url(#gCore)', 'class': 'tr-edge' }, m);
        for (var i = 0; i < 6; i++) {
            el('line', { x1: 804, y1: 437 + i * 4.5, x2: 1128, y2: 437 + i * 4.5, 'class': 'lam' }, m);
            el('line', { x1: 804, y1: 703 + i * 4.5, x2: 1128, y2: 703 + i * 4.5, 'class': 'lam' }, m);
        }
        el('rect', { x: 796, y: 424, width: 340, height: 12, rx: 3, 'class': 'tr-clamp' }, m);
        el('rect', { x: 796, y: 724, width: 340, height: 12, rx: 3, 'class': 'tr-clamp' }, m);
        /* bobinas */
        xs.forEach(function (x) {
            el('rect', { x: x - 50, y: 466, width: 100, height: 228, rx: 12, fill: 'url(#gCoil)', 'class': 'tr-edge' }, m);
            for (var k = 0; k < 16; k++) el('line', { x1: x - 46, y1: 478 + k * 13.5, x2: x + 46, y2: 478 + k * 13.5, 'class': 'turn' }, m);
            el('rect', { x: x - 50, y: 466, width: 100, height: 14, rx: 6, 'class': 'coil-rim' }, m);
            el('rect', { x: x - 50, y: 680, width: 100, height: 14, rx: 6, 'class': 'coil-rim' }, m);
        });
        /* placa de características */
        el('rect', { x: 800, y: 770, width: 332, height: 82, rx: 4, fill: 'url(#gPlate)', 'class': 'plate' }, g);
        this.plateTxt = el('g', { 'class': 'plate-txt' }, g);
        /* temperatura de los devanados */
        txt(g, 800, 873, 'TEMP. DEVANADOS', 'mini-lbl dark');
        this.thLeds = [];
        for (i = 0; i < 12; i++) this.thLeds.push(el('rect', { x: 912 + i * 18.5, y: 863, width: 15, height: 11, rx: 2, 'class': 'th-led ' + (i < 7 ? 'g' : i < 10 ? 'a' : 'r') }, g));
        this.setPlate();
    };

    TrafoBench.prototype.setPlate = function () {
        var P = this.lab.P, pl = P.plate, g = this.plateTxt, f = VEM.fmtN;
        g.innerHTML = '';
        var x = 810, x2 = 1122, y = 788;
        txt(g, x, y, 'Trafo 3~  ' + P.code, 'pl-h'); txt(g, x2, y, P.name, 'pl-h', { 'text-anchor': 'end' }); y += 16;
        txt(g, x, y, 'Sn ' + f(pl.Sn / 1000, 0) + ' kVA · ' + pl.f + ' Hz', 'pl'); txt(g, x2, y, 'ucc ' + f(pl.ucc, 1) + ' %', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'AT: 3 devanados de ' + f(pl.U1, 0) + ' V', 'pl'); txt(g, x2, y, f(pl.I1n, 2) + ' A', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'BT: 3 × 2 mitades de ' + f(pl.U2h, 1) + ' V', 'pl'); txt(g, x2, y, f(pl.I2n, 2) + ' A', 'pl', { 'text-anchor': 'end' }); y += 14;
        txt(g, x, y, 'Tensiones e intensidades asignadas de cada devanado', 'pl s');
    };

    /* ---------------- Banco de cargas ---------------- */
    TrafoBench.prototype.buildLoadBank = function (p) {
        var self = this, lab = this.lab, g = el('g', { 'class': 'dev', filter: 'url(#fShadow)' }, p), x = 1172, w = 308, f = VEM.fmtN;
        el('rect', { x: x, y: 396, width: w, height: 480, rx: 10, fill: 'url(#gHousing)', 'class': 'housing' }, g);
        el('rect', { x: x + 6, y: 402, width: w - 12, height: 468, rx: 7, 'class': 'housing-inner' }, g);
        txt(g, x + 16, 426, 'BANCO DE CARGAS', 'dev-title');
        txt(g, x + w - 14, 426, 'Y · ' + LOAD.U + ' V', 'dev-sub', { 'text-anchor': 'end' });
        var KN = [
            { k: 'R', l: 'R', u: 'kW', s: LOAD.R, c: 'red', t: 'Carga resistiva' },
            { k: 'L', l: 'L', u: 'kvar', s: LOAD.L, c: 'amber', t: 'Carga inductiva' },
            { k: 'C', l: 'C', u: 'kvar', s: LOAD.C, c: 'green', t: 'Carga capacitiva' }
        ];
        this.ldTxt = {};
        var ticks = []; for (var v = 0; v <= LOAD.steps; v++) ticks.push(v);
        KN.forEach(function (o, i) {
            var cx = x + 58 + i * 96;
            new W.Knob(g, {
                cx: cx, cy: 500, r: 28, min: 0, max: LOAD.steps, value: lab.load[o.k], step: 1, wheel: 1, sweep: 270,
                ticks: ticks, major: 5, fmt: function (v) { return String(v); }, label: o.t + ' (escalones)',
                onChange: function (v) { lab.load[o.k] = v; self.updateLoadTxt(); self.hooks.changed(false); }
            });
            txt(g, cx, 562, o.l, 'disp-lbl ' + o.c, { 'text-anchor': 'middle' });
            self.ldTxt[o.k] = txt(g, cx, 580, '', 'spec', { 'text-anchor': 'middle' });
            txt(g, cx, 594, f(o.s / 1000, 2) + ' ' + o.u + '/esc.', 'spec dim', { 'text-anchor': 'middle' });
        });
        this.ldSum = txt(g, x + w / 2, 620, '', 'spec', { 'text-anchor': 'middle' });
        /* interruptor de la carga */
        var sw = this.gLoadSw = el('g', { 'class': 'locksw', tabindex: 0, role: 'switch', 'aria-label': 'Interruptor de la carga' }, g);
        el('rect', { x: x + 22, y: 640, width: 70, height: 110, rx: 8, 'class': 'lock-body' }, sw);
        this.ldLever = el('rect', { x: x + 38, y: 652, width: 38, height: 44, rx: 6, 'class': 'lock-lever' }, sw);
        this.ldLeverTxt = txt(sw, x + 57, 679, 'OFF', 'lock-txt', { 'text-anchor': 'middle' });
        txt(g, x + 57, 766, 'CARGA', 'mini-lbl', { 'text-anchor': 'middle' });
        W.title(sw, 'Interruptor de la carga: conecta los escalones seleccionados');
        function tog(e) {
            if (e) e.stopPropagation();
            lab.load.on = !lab.load.on;
            self.hooks.log(lab.load.on ? 'Carga conectada.' : 'Carga desconectada.');
            self.hooks.changed(false);
        }
        sw.addEventListener('pointerdown', function (e) { if (e.button === 0) tog(e); });
        sw.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
        /* esquema de la carga en estrella */
        var sg = el('g', { 'class': 'ld-sch' }, g), x0 = x + 128;
        for (var k = 0; k < 3; k++) {
            var yy = 650 + k * 30;
            txt(sg, x0, yy + 4, 'L' + (k + 1), 'mini-lbl', { 'text-anchor': 'start' });
            el('path', { d: 'M' + (x0 + 22) + ',' + yy + ' h14', 'class': 'mini-sch' }, sg);
            el('rect', { x: x0 + 36, y: yy - 6, width: 22, height: 12, rx: 2, 'class': 'mini-coil' }, sg);
            el('path', { d: 'M' + (x0 + 58) + ',' + yy + ' h8 m0,-7 v14 m6,-14 v14 M' + (x0 + 72) + ',' + yy + ' h8', 'class': 'mini-sch' }, sg);
            el('path', { d: 'M' + (x0 + 80) + ',' + yy + ' q5,-8 10,0 q5,-8 10,0 q5,-8 10,0 h20 V' + 738, 'class': 'mini-sch' }, sg);
        }
        el('path', { d: 'M' + (x0 + 140) + ',738 h-118', 'class': 'mini-sch' }, sg);
        txt(sg, x0, 742, 'N', 'mini-lbl', { 'text-anchor': 'start' });
        txt(sg, x0 + 74, 766, 'R  ·  C  ·  L por fase', 'spec dim', { 'text-anchor': 'middle' });
        this.ldLamp = this.lamp(g, x + 112, 696, 'amber');
        /* bornes */
        el('rect', { x: x + 16, y: 790, width: w - 32, height: 64, rx: 6, 'class': 'sock-strip' }, g);
        [['ld.L1', '#7b4a24', 'L1'], ['ld.L2', '#1d1f22', 'L2'], ['ld.L3', '#8a9097', 'L3'], ['ld.N', '#1f5fbf', 'N']].forEach(function (c, i) {
            self.socket(g, c[0], x + 46 + i * 70, 822, c[1], null);
            txt(g, x + 66 + i * 70, 827, c[2], 'sock-lbl', { 'text-anchor': 'start' });
        });
        this.updateLoadTxt();
    };

    TrafoBench.prototype.updateLoadTxt = function () {
        var ld = this.lab.load, f = VEM.fmtN;
        this.ldTxt.R.textContent = ld.R + ' esc. = ' + f(ld.R * LOAD.R / 1000, 1) + ' kW';
        this.ldTxt.L.textContent = ld.L + ' esc. = ' + f(ld.L * LOAD.L / 1000, 1) + ' kvar';
        this.ldTxt.C.textContent = ld.C + ' esc. = ' + f(ld.C * LOAD.C / 1000, 2) + ' kvar';
        this.ldSum.textContent = 'Valores a ' + LOAD.U + ' V entre fases';
    };

    TrafoBench.prototype.frameMachine = function (dt, rd) {
        var lab = this.lab, on = lab.load.on;
        this.ldLever.setAttribute('y', on ? 692 : 652);
        this.ldLever.setAttribute('class', 'lock-lever' + (on ? ' on' : ''));
        this.ldLeverTxt.setAttribute('y', on ? 719 : 679);
        this.ldLeverTxt.textContent = on ? 'ON' : 'OFF';
        this.ldLamp.setAttribute('class', 'lamp amber' + (on ? ' lit' : ''));
        /* zumbido del núcleo cuando está magnetizado */
        var hum = lab.on && lab.Esat > 0.3 * lab.P.U1;
        this.gTrafo.setAttribute('transform', hum ? 'translate(' + ((Math.random() - 0.5) * 0.6).toFixed(2) + ',0)' : '');
        if (rd) {
            var th = rd.thermal * 12;
            for (var i = 0; i < 12; i++) this.thLeds[i].classList.toggle('lit', i < th);
        }
    };
    TrafoBench.prototype.displaysMachine = function () { };

    VEM.TrafoBench = TrafoBench;
})();
