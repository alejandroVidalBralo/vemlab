/* =====================================================================
   VEMLAB · Esquemas SVG
   - Esquemas de montaje de cada ensayo (con los instrumentos)
   - Circuitos equivalentes de transformador y motor asíncrono
   Todos usan currentColor / clases CSS para respetar el tema.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM;

    function meter(x, y, sym, cls) {
        return '<g class="sch-meter ' + (cls || '') + '"><circle cx="' + x + '" cy="' + y + '" r="14"/>' +
            '<text x="' + x + '" y="' + (y + 0.5) + '">' + sym + '</text></g>';
    }
    function wire(d) { return '<path class="sch-wire" d="' + d + '"/>'; }
    function label(x, y, t, anchor, cls) {
        return '<text class="sch-label ' + (cls || '') + '" x="' + x + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '">' + t + '</text>';
    }
    function resistorH(x, y, w) {
        w = w || 44; var s = w / 8, p = 'M' + x + ',' + y;
        for (var i = 1; i <= 7; i++) p += ' L' + (x + i * s) + ',' + (y + (i % 2 ? -6 : 6));
        p += ' L' + (x + w) + ',' + y;
        return '<path class="sch-comp" d="' + p + '"/>';
    }
    function resistorV(x, y, hgt) {
        hgt = hgt || 44; var s = hgt / 8, p = 'M' + x + ',' + y;
        for (var i = 1; i <= 7; i++) p += ' L' + (x + (i % 2 ? -6 : 6)) + ',' + (y + i * s);
        p += ' L' + x + ',' + (y + hgt);
        return '<path class="sch-comp" d="' + p + '"/>';
    }
    function inductorH(x, y, w) {
        w = w || 44; var n = 4, s = w / n, p = 'M' + x + ',' + y;
        for (var i = 0; i < n; i++) p += ' a' + s / 2 + ',' + s / 2 + ' 0 0 1 ' + s + ',0';
        return '<path class="sch-comp" d="' + p + '"/>';
    }
    function inductorV(x, y, hgt) {
        hgt = hgt || 44; var n = 4, s = hgt / n, p = 'M' + x + ',' + y;
        for (var i = 0; i < n; i++) p += ' a' + s / 2 + ',' + s / 2 + ' 0 0 1 0,' + s;
        return '<path class="sch-comp" d="' + p + '"/>';
    }
    function source(x, y, t) {
        return '<g class="sch-source"><circle cx="' + x + '" cy="' + y + '" r="18"/>' +
            '<path d="M' + (x - 9) + ',' + y + ' q4.5,-9 9,0 t9,0"/></g>' +
            t.split('|').map(function (l, i) { return label(x + 6, y + 32 + i * 14, l, 'middle', i ? 'sch-muted' : ''); }).join('');
    }
    function svg(w, hgt, body, title) {
        return '<svg class="schematic" viewBox="0 0 ' + w + ' ' + hgt + '" role="img" aria-label="' + title + '"><title>' + title + '</title>' + body + '</svg>';
    }

    /* ---------- Montajes del transformador ----------
       mode: 'vacio' | 'cc' | 'carga'                                   */
    function trafoSetup(mode) {
        var b = '';
        var top = 40, bot = 150;
        b += source(40, 95, mode === 'cc' ? 'Autotransf.|(V reducida)' : 'Autotransf.|regulable');
        b += wire('M40,77 V' + top + ' H96 M124,' + top + ' H156 M184,' + top + ' H300 V70');
        b += wire('M40,113 V' + bot + ' H300 V120');
        b += meter(110, top, 'A');
        b += meter(170, top, 'W', 'sch-w');
        b += wire('M230,' + top + ' V81 M230,109 V' + bot);
        b += meter(230, 95, 'V');
        /* transformador */
        b += inductorV(300, 70, 50);
        b += inductorV(340, 70, 50);
        b += '<path class="sch-core" d="M316,64 V126 M324,64 V126"/>';
        b += label(320, 56, 'T');
        b += wire('M340,70 V' + top + ' H380 M340,120 V' + bot + ' H380');
        b += label(270, 30, 'Primario', 'middle', 'sch-muted');
        b += label(380, 30, 'Secundario', 'middle', 'sch-muted');
        if (mode === 'vacio') {
            b += wire('M380,' + top + ' H420 V81 M420,109 V' + bot + ' H380');
            b += meter(420, 95, 'V');
            b += label(470, 99, 'Abierto', 'start', 'sch-muted');
        } else if (mode === 'cc') {
            b += wire('M380,' + top + ' H440 V81 M440,109 V' + bot + ' H380');
            b += meter(440, 95, 'A');
            b += label(470, 92, 'Cortocircuito', 'start', 'sch-muted');
            b += label(470, 108, '(a través del A)', 'start', 'sch-muted');
        } else {
            b += meter(400, top, 'A');
            b += meter(450, top, 'W', 'sch-w');
            b += wire('M380,' + top + ' H386 M414,' + top + ' H436 M464,' + top + ' H540 V70 M540,120 V' + bot + ' H380');
            b += wire('M500,' + top + ' V81 M500,109 V' + bot);
            b += meter(500, 95, 'V');
            b += '<rect class="sch-load" x="528" y="70" width="24" height="50" rx="3"/>';
            b += label(540, 99, 'Z');
            b += label(540, 168, 'Carga R-L-C');
        }
        return svg(570, 190, b, 'Esquema de montaje del ensayo');
    }

    /* ---------- Montajes del motor asíncrono (unifilar) ----------
       mode: 'cc_dc' | 'vacio' | 'rotor' | 'carga'                      */
    function asyncSetup(mode) {
        var b = '';
        var top = 40, bot = 150;
        if (mode === 'cc_dc') {
            b += '<g class="sch-source"><rect x="22" y="77" width="36" height="36" rx="4"/></g>';
            b += label(40, 100, '=');
            b += label(40, 131, 'Fuente c.c.');
            b += wire('M40,77 V' + top + ' H96 M124,' + top + ' H260 V70');
            b += wire('M40,113 V' + bot + ' H260 V120');
            b += meter(110, top, 'A');
            b += wire('M190,' + top + ' V81 M190,109 V' + bot);
            b += meter(190, 95, 'V');
            b += resistorV(260, 70, 50);
            b += label(276, 100, 'Dos fases del estátor (2·R₁ en estrella)', 'start', 'sch-muted');
            return svg(570, 180, b, 'Medida de la resistencia del estátor en corriente continua');
        }
        b += source(40, 95, mode === 'rotor' ? 'Autotransf. 3~|(V reducida)' : 'Autotransf. 3~|regulable');
        b += wire('M40,77 V' + top + ' H96 M124,' + top + ' H156 M184,' + top + ' H300 V77');
        b += wire('M40,113 V' + bot + ' H300 V113');
        b += meter(110, top, 'A');
        b += meter(170, top, 'W', 'sch-w');
        b += wire('M230,' + top + ' V81 M230,109 V' + bot);
        b += meter(230, 95, 'V');
        b += '<path class="sch-wire" d="M286,30 l8,-8 M292,30 l8,-8 M298,30 l8,-8"/>';
        b += label(296, 20, '3', 'middle', 'sch-muted');
        /* motor */
        b += '<g class="sch-motor"><circle cx="320" cy="95" r="26"/></g>';
        b += label(320, 92, 'M');
        b += label(320, 108, '3~', 'middle', 'sch-small');
        b += '<path class="sch-shaft" d="M346,95 H420"/>';
        if (mode === 'vacio') {
            b += label(430, 99, 'Eje libre (sin carga)', 'start', 'sch-muted');
            b += '<g class="sch-meter"><circle cx="390" cy="95" r="12"/><text x="390" y="95.5">n</text></g>';
        } else if (mode === 'rotor') {
            b += '<path class="sch-block" d="M420,70 V120 M424,70 l10,-8 M424,82 l10,-8 M424,94 l10,-8 M424,106 l10,-8 M424,118 l10,-8"/>';
            b += label(450, 99, 'Rotor bloqueado', 'start', 'sch-muted');
        } else {
            b += '<g class="sch-meter"><circle cx="384" cy="95" r="12"/><text x="384" y="95.5">n</text></g>';
            b += '<rect class="sch-load" x="420" y="72" width="80" height="46" rx="4"/>';
            b += label(460, 92, 'Freno', 'middle');
            b += label(460, 108, '(par T)', 'middle', 'sch-small');
        }
        return svg(570, 190, b, 'Esquema de montaje del ensayo');
    }

    /* ---------- Circuito equivalente aproximado del transformador ---------- */
    function trafoEquiv() {
        var b = '';
        b += wire('M30,40 H120 M168,40 H200 M248,40 H300');
        b += wire('M30,160 H300');
        b += '<circle class="sch-node" cx="30" cy="40" r="3"/><circle class="sch-node" cx="30" cy="160" r="3"/>';
        b += label(20, 104, 'V₁', 'end');
        b += resistorH(120, 40, 48);
        b += label(144, 26, 'R<tspan baseline-shift="sub" font-size="9">cc</tspan>');
        b += inductorH(200, 40, 48);
        b += label(224, 26, 'X<tspan baseline-shift="sub" font-size="9">cc</tspan>');
        /* rama paralelo */
        b += wire('M70,40 V60 M50,60 H90 M50,60 V76 M90,60 V76 M50,124 V140 M90,124 V140 M50,140 H90 M70,140 V160');
        b += resistorV(50, 76, 48);
        b += inductorV(90, 76, 48);
        b += label(40, 104, 'R<tspan baseline-shift="sub" font-size="9">Fe</tspan>', 'end');
        b += label(104, 104, 'X<tspan baseline-shift="sub" font-size="9">μ</tspan>', 'start');
        b += label(320, 104, 'V′₂ = m·V₂', 'start');
        b += '<circle class="sch-node" cx="300" cy="40" r="3"/><circle class="sch-node" cx="300" cy="160" r="3"/>';
        b += label(175, 186, 'Parámetros referidos al primario · m = V₁ₙ / V₂ₙ', 'middle', 'sch-muted');
        return svg(440, 196, b, 'Circuito equivalente aproximado del transformador');
    }

    /* ---------- Circuito equivalente exacto (por fase) del motor asíncrono ---------- */
    function asyncEquiv() {
        var b = '';
        b += wire('M24,40 H50 M98,40 H120 M168,40 H250 M298,40 H320 M368,40 H400 V70 M400,130 V160 H24');
        b += '<circle class="sch-node" cx="24" cy="40" r="3"/><circle class="sch-node" cx="24" cy="160" r="3"/>';
        b += label(14, 104, 'V₁', 'end');
        b += resistorH(50, 40, 48); b += label(74, 26, 'R₁');
        b += inductorH(120, 40, 48); b += label(144, 26, 'X₁');
        b += wire('M209,40 V60 M189,60 H229 M189,60 V76 M229,60 V76 M189,124 V140 M229,124 V140 M189,140 H229 M209,140 V160');
        b += resistorV(189, 76, 48); b += inductorV(229, 76, 48);
        b += label(179, 104, 'R<tspan baseline-shift="sub" font-size="9">Fe</tspan>', 'end');
        b += label(242, 104, 'X<tspan baseline-shift="sub" font-size="9">μ</tspan>', 'start');
        b += inductorH(250, 40, 48); b += label(274, 26, 'X′₂');
        b += resistorH(320, 40, 48); b += label(344, 26, 'R′₂');
        b += resistorV(400, 70, 60);
        b += label(414, 96, 'R′<tspan baseline-shift="sub" font-size="9">c</tspan> = R′₂·(1−s)/s', 'start');
        b += label(414, 114, '(carga mecánica)', 'start', 'sch-muted');
        b += label(250, 186, 'Por fase, estrella equivalente · valores referidos al estátor', 'middle', 'sch-muted');
        return svg(560, 196, b, 'Circuito equivalente por fase del motor asíncrono');
    }

    VEM.sch = { trafoSetup: trafoSetup, asyncSetup: asyncSetup, trafoEquiv: trafoEquiv, asyncEquiv: asyncEquiv };
})();
