/* =====================================================================
   VEMLAB · Piezas gráficas SVG: elementos, displays de 7 segmentos,
   mandos giratorios y pulsadores.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM = window.VEM || {};
    var NS = 'http://www.w3.org/2000/svg';

    function el(tag, attrs, parent) {
        var e = document.createElementNS(NS, tag);
        if (attrs) for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
        if (parent) parent.appendChild(e);
        return e;
    }
    function txt(parent, x, y, s, cls, attrs) {
        var t = el('text', Object.assign({ x: x, y: y, 'class': cls || '' }, attrs || {}), parent);
        t.textContent = s;
        return t;
    }
    function title(e, s) { var t = el('title', null, e); t.textContent = s; return e; }

    /* ---------------- Display de 7 segmentos ---------------- */
    var MAP = {
        '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc',
        '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '', 'O': 'abcdef', 'L': 'fed', 'E': 'afged',
        'r': 'eg', 'H': 'fbgec', 'n': 'ceg', 'o': 'cdeg', 'P': 'abfge', 'F': 'afge', 'A': 'abcefg', 'C': 'afed',
        'U': 'bcdef', 'u': 'cde', 'd': 'bcdeg', 't': 'fged', 'b': 'fgcde', 'S': 'afgcd', 'h': 'fgec', 'i': 'c', 'Y': 'fgbcd'
    };
    function hseg(x0, x1, y, t) {
        return [[x0, y], [x0 + t / 2, y - t / 2], [x1 - t / 2, y - t / 2], [x1, y], [x1 - t / 2, y + t / 2], [x0 + t / 2, y + t / 2]];
    }
    function vseg(x, y0, y1, t) {
        return [[x, y0], [x + t / 2, y0 + t / 2], [x + t / 2, y1 - t / 2], [x, y1], [x - t / 2, y1 - t / 2], [x - t / 2, y0 + t / 2]];
    }
    function pts(a) { return a.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join(' '); }

    function SevenSeg(parent, x, y, cells, h, cls) {
        this.cells = cells;
        var w = h * 0.55, t = h * 0.16, gap = h * 0.28, g = this.g = el('g', { 'class': 'seg7 ' + (cls || ''), transform: 'translate(' + x + ',' + y + ')' }, parent);
        var inner = el('g', { transform: 'skewX(-7)' }, g);
        this.digits = [];
        this.width = cells * w + (cells - 1) * gap;
        for (var i = 0; i < cells; i++) {
            var ox = i * (w + gap), d = { seg: {}, dp: null }, m = t * 0.32;
            var defs = {
                a: hseg(ox + m, ox + w - m, 0, t), g: hseg(ox + m, ox + w - m, h / 2, t), d: hseg(ox + m, ox + w - m, h, t),
                f: vseg(ox, m, h / 2 - m, t), b: vseg(ox + w, m, h / 2 - m, t), e: vseg(ox, h / 2 + m, h - m, t), c: vseg(ox + w, h / 2 + m, h - m, t)
            };
            for (var k in defs) d.seg[k] = el('polygon', { points: pts(defs[k]), 'class': 'sg' }, inner);
            d.dp = el('circle', { cx: ox + w + gap * 0.45, cy: h - t * 0.1, r: t * 0.62, 'class': 'sg' }, inner);
            this.digits.push(d);
        }
        this.last = null;
    }
    SevenSeg.prototype.set = function (s) {
        s = String(s);
        if (s === this.last) return;
        this.last = s;
        var chars = [];
        for (var i = 0; i < s.length; i++) {
            if (s[i] === '.' || s[i] === ',') { if (chars.length) chars[chars.length - 1].dp = true; else chars.push({ c: ' ', dp: true }); }
            else chars.push({ c: s[i], dp: false });
        }
        while (chars.length < this.cells) chars.unshift({ c: ' ', dp: false });
        chars = chars.slice(chars.length - this.cells);
        for (var j = 0; j < this.cells; j++) {
            var on = MAP[chars[j].c] !== undefined ? MAP[chars[j].c] : '', d = this.digits[j];
            for (var k in d.seg) d.seg[k].setAttribute('class', on.indexOf(k) >= 0 ? 'sg on' : 'sg');
            d.dp.setAttribute('class', chars[j].dp ? 'sg on' : 'sg');
        }
    };

    /* Formatea un valor para un display de "cells" dígitos */
    function fmt7(v, cells, maxDec) {
        if (v === null || v === undefined || !isFinite(v)) return 'OL';
        var neg = v < 0, a = Math.abs(v);
        var intD = a < 1 ? 1 : Math.floor(Math.log10(a)) + 1;
        var avail = cells - (neg ? 1 : 0) - intD;
        if (avail < 0) return neg ? '-OL' : 'OL';
        var dec = Math.min(maxDec, avail), s = a.toFixed(dec);
        if (s.replace('.', '').length + (neg ? 1 : 0) > cells) {
            dec--;
            if (dec < 0) return neg ? '-OL' : 'OL';
            s = a.toFixed(dec);
        }
        if (Number(s) === 0) neg = false;
        return (neg ? '-' : '') + s;
    }

    /* ---------------- Mando giratorio ----------------
       o: { cx, cy, r, min, max, value, sweep, step, ticks:[v…], major, fmt, label, onChange, cls } */
    function Knob(parent, o) {
        var self = this;
        this.o = o;
        this.value = o.value;
        var sweep = o.sweep || 270, a0 = -90 - sweep / 2;
        this.angle = function (v) { return a0 + (v - o.min) / (o.max - o.min) * sweep; };
        var g = this.g = el('g', { 'class': 'knob ' + (o.cls || ''), tabindex: 0, role: 'slider',
            'aria-label': o.label, 'aria-valuemin': o.min, 'aria-valuemax': o.max }, parent);
        /* escala */
        var sc = el('g', { 'class': 'knob-scale' }, g);
        (o.ticks || []).forEach(function (v, i) {
            var a = self.angle(v) * Math.PI / 180, major = !o.major || i % o.major === 0;
            var r1 = o.r + 6, r2 = o.r + (major ? 15 : 10);
            el('line', { x1: o.cx + r1 * Math.cos(a), y1: o.cy + r1 * Math.sin(a), x2: o.cx + r2 * Math.cos(a), y2: o.cy + r2 * Math.sin(a), 'class': major ? 'tick major' : 'tick' }, sc);
            if (major && o.fmt) {
                var r3 = o.r + 27;
                txt(sc, o.cx + r3 * Math.cos(a), o.cy + r3 * Math.sin(a) + 4, o.fmt(v), 'tick-lbl', { 'text-anchor': 'middle' });
            }
        });
        /* arco de valor */
        this.arc = el('path', { 'class': 'knob-arc' }, g);
        /* cuerpo */
        el('circle', { cx: o.cx, cy: o.cy + 3, r: o.r, 'class': 'knob-shadow' }, g);
        this.body = el('g', { 'class': 'knob-body' }, g);
        el('circle', { cx: o.cx, cy: o.cy, r: o.r, fill: 'url(#gKnob)', 'class': 'knob-skirt' }, this.body);
        for (var i = 0; i < 24; i++) {
            var a = i * 15 * Math.PI / 180;
            el('line', { x1: o.cx + (o.r - 5) * Math.cos(a), y1: o.cy + (o.r - 5) * Math.sin(a), x2: o.cx + o.r * Math.cos(a), y2: o.cy + o.r * Math.sin(a), 'class': 'knob-grip' }, this.body);
        }
        el('circle', { cx: o.cx, cy: o.cy, r: o.r * 0.72, fill: 'url(#gKnobTop)', 'class': 'knob-cap' }, this.body);
        el('line', { x1: o.cx, y1: o.cy - o.r * 0.2, x2: o.cx, y2: o.cy - o.r + 4, 'class': 'knob-ptr' }, this.body);
        this.render();

        /* interacción: arrastre angular */
        var drag = null;
        function ang(e) {
            var p = VEM.svgPoint(g, e.clientX, e.clientY);
            return Math.atan2(p.y - o.cy, p.x - o.cx) * 180 / Math.PI;
        }
        g.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            g.focus({ preventScroll: true });
            g.setPointerCapture(e.pointerId);
            drag = { a: ang(e), v: self.value };
            g.classList.add('dragging');
        });
        g.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var a = ang(e), d = a - drag.a;
            if (d > 180) d -= 360; if (d < -180) d += 360;
            drag.a = a;
            var k = e.shiftKey ? 0.15 : 1;
            drag.v = Math.max(o.min, Math.min(o.max, drag.v + d / sweep * (o.max - o.min) * k));
            self.set(drag.v, true);
        });
        function end() { drag = null; g.classList.remove('dragging'); }
        g.addEventListener('pointerup', end);
        g.addEventListener('pointercancel', end);
        g.addEventListener('wheel', function (e) {
            e.preventDefault();
            /* rueda: paso grueso (o.wheel); con Mayús, paso fino */
            self.set(self.value + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? o.step : (o.wheel || o.step * 5)), true);
        }, { passive: false });
        g.addEventListener('keydown', function (e) {
            var st = (o.keyStep || o.step) * (e.shiftKey ? 10 : 1);
            if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { self.set(self.value + st, true); e.preventDefault(); }
            else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { self.set(self.value - st, true); e.preventDefault(); }
            else if (e.key === 'PageUp') { self.set(self.value + st * 10, true); e.preventDefault(); }
            else if (e.key === 'PageDown') { self.set(self.value - st * 10, true); e.preventDefault(); }
            else if (e.key === 'Home') { self.set(o.min, true); e.preventDefault(); }
        });
    }
    Knob.prototype.set = function (v, fire) {
        var o = this.o;
        v = Math.max(o.min, Math.min(o.max, Math.round(v / o.step) * o.step));
        if (Math.abs(v - this.value) < 1e-12 && fire) { this.render(); return; }
        this.value = v;
        this.render();
        if (fire && o.onChange) o.onChange(v);
    };
    Knob.prototype.render = function () {
        var o = this.o, a = this.angle(this.value);
        this.body.setAttribute('transform', 'rotate(' + (a + 90) + ' ' + o.cx + ' ' + o.cy + ')');
        var r = o.r + 3, a0 = this.angle(o.min) * Math.PI / 180, a1 = a * Math.PI / 180;
        var large = (a - this.angle(o.min)) > 180 ? 1 : 0;
        this.arc.setAttribute('d', 'M' + (o.cx + r * Math.cos(a0)) + ',' + (o.cy + r * Math.sin(a0)) +
            ' A' + r + ',' + r + ' 0 ' + large + ' 1 ' + (o.cx + r * Math.cos(a1)) + ',' + (o.cy + r * Math.sin(a1)));
        this.g.setAttribute('aria-valuenow', this.value);
    };

    /* Pulsador SVG con repetición al mantener pulsado */
    function PushButton(parent, x, y, w, h, label, onPress, cls, repeat) {
        var g = el('g', { 'class': 'pbtn ' + (cls || ''), tabindex: 0, role: 'button', 'aria-label': label }, parent);
        el('rect', { x: x, y: y, width: w, height: h, rx: Math.min(6, h / 2) }, g);
        txt(g, x + w / 2, y + h / 2 + 4.5, label, 'pbtn-lbl', { 'text-anchor': 'middle' });
        var timer = null, delay = null;
        function stop() { clearTimeout(delay); clearInterval(timer); timer = delay = null; g.classList.remove('pressed'); }
        g.addEventListener('pointerdown', function (e) {
            if (e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            g.classList.add('pressed');
            onPress();
            if (repeat) delay = setTimeout(function () { timer = setInterval(onPress, 70); }, 380);
        });
        g.addEventListener('pointerup', stop);
        g.addEventListener('pointerleave', stop);
        g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPress(); } });
        return g;
    }

    /* Punto de pantalla → coordenadas de usuario del elemento (el <svg> o un grupo con transformaciones) */
    VEM.svgPoint = function (node, cx, cy) {
        var svg = node.ownerSVGElement || node;
        var pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
        var m = node.getScreenCTM();
        return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    };

    VEM.W = { el: el, txt: txt, title: title, SevenSeg: SevenSeg, fmt7: fmt7, Knob: Knob, PushButton: PushButton };
})();
