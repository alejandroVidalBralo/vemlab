/* =====================================================================
   VEMLAB · Utilidades: números complejos, formato, almacenamiento y
   piezas de dibujo SVG para los circuitos equivalentes.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM = window.VEM || {};

    /* ---------------- Complejos ---------------- */
    function C(re, im) { return { re: re, im: im || 0 }; }
    VEM.Cx = {
        C: C,
        add: function (a, b) { return C(a.re + b.re, a.im + b.im); },
        sub: function (a, b) { return C(a.re - b.re, a.im - b.im); },
        mul: function (a, b) { return C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); },
        div: function (a, b) {
            var d = b.re * b.re + b.im * b.im;
            return d === 0 ? C(Infinity, 0) : C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
        },
        scale: function (a, k) { return C(a.re * k, a.im * k); },
        conj: function (a) { return C(a.re, -a.im); },
        abs: function (a) { return Math.sqrt(a.re * a.re + a.im * a.im); },
        par: function (a, b) { return VEM.Cx.div(VEM.Cx.mul(a, b), VEM.Cx.add(a, b)); }
    };

    /* ---------------- Formato (coma decimal) ---------------- */
    VEM.fmt = function (v, dec) {
        if (v === null || v === undefined || !isFinite(v)) return '—';
        return v.toFixed(dec === undefined ? 2 : dec).replace('.', ',');
    };
    /* número "bonito" para campos editables */
    VEM.fmtIn = function (v) { return isFinite(v) ? String(+Number(v).toPrecision(6)).replace('.', ',') : ''; };
    VEM.parseNum = function (s) {
        if (typeof s === 'number') return s;
        s = String(s === undefined || s === null ? '' : s).trim().replace(/\s/g, '').replace(',', '.');
        return s === '' ? NaN : Number(s);
    };
    VEM.clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

    /* ---------------- Almacenamiento local ---------------- */
    VEM.store = {
        get: function (k, def) {
            try { var v = localStorage.getItem('vemlab2.' + k); return v === null ? def : JSON.parse(v); }
            catch (e) { return def; }
        },
        set: function (k, v) { try { localStorage.setItem('vemlab2.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
    };

    /* ---------------- Dibujo SVG ---------------- */
    function wire(d, cls) { return '<path class="w ' + (cls || '') + '" d="' + d + '"/>'; }
    function txt(x, y, t, o) {
        o = o || {};
        return '<text x="' + x + '" y="' + y + '" text-anchor="' + (o.a || 'middle') + '" class="' + (o.c || 'lbl') + '">' + t + '</text>';
    }
    function resH(x, y, w) {
        var s = w / 8, p = 'M' + x + ',' + y;
        for (var i = 1; i <= 7; i++) p += ' L' + (x + i * s) + ',' + (y + (i % 2 ? -7 : 7));
        return '<path class="comp" d="' + p + ' L' + (x + w) + ',' + y + '"/>';
    }
    function resV(x, y, h) {
        var s = h / 8, p = 'M' + x + ',' + y;
        for (var i = 1; i <= 7; i++) p += ' L' + (x + (i % 2 ? -7 : 7)) + ',' + (y + i * s);
        return '<path class="comp" d="' + p + ' L' + x + ',' + (y + h) + '"/>';
    }
    function indH(x, y, w) {
        var n = 4, s = w / n, p = 'M' + x + ',' + y;
        for (var i = 0; i < n; i++) p += ' a' + s / 2 + ',' + s / 2 + ' 0 0 1 ' + s + ',0';
        return '<path class="comp" d="' + p + '"/>';
    }
    function indV(x, y, h) {
        var n = 4, s = h / n, p = 'M' + x + ',' + y;
        for (var i = 0; i < n; i++) p += ' a' + s / 2 + ',' + s / 2 + ' 0 0 1 0,' + s;
        return '<path class="comp" d="' + p + '"/>';
    }
    function capV(x, y, h) {
        var m = y + h / 2;
        return wire('M' + x + ',' + y + ' V' + (m - 5) + ' M' + x + ',' + (m + 5) + ' V' + (y + h)) +
            '<path class="comp" d="M' + (x - 14) + ',' + (m - 5) + ' H' + (x + 14) + ' M' + (x - 14) + ',' + (m + 5) + ' H' + (x + 14) + '"/>';
    }
    function source(x, y) {
        return '<circle class="src" cx="' + x + '" cy="' + y + '" r="20"/>' +
            '<path class="src-wave" d="M' + (x - 10) + ',' + y + ' q5,-10 10,0 t10,0"/>';
    }
    /* flecha de corriente sobre un conductor horizontal */
    function arrowH(x, y, t, below) {
        return '<path class="arr" d="M' + (x - 10) + ',' + y + ' L' + (x + 8) + ',' + y + ' M' + (x + 2) + ',' + (y - 5) + ' L' + (x + 9) + ',' + y + ' L' + (x + 2) + ',' + (y + 5) + '"/>' +
            txt(x, below ? y + 22 : y - 12, t, { c: 'val' });
    }
    function node(x, y) { return '<circle class="node" cx="' + x + '" cy="' + y + '" r="3.5"/>'; }

    VEM.svg = { wire: wire, txt: txt, resH: resH, resV: resV, indH: indH, indV: indV, capV: capV, source: source, arrowH: arrowH, node: node };
})();
