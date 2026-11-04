/* =====================================================================
   VEMLAB · Núcleo
   Números complejos, utilidades, almacenamiento, ruido de medida y
   un trazador de gráficas en <canvas> sin dependencias externas
   (funciona sin conexión a Internet, abriendo index.html directamente).
   ===================================================================== */
(function () {
    'use strict';

    var VEM = window.VEM = window.VEM || {};

    /* ---------------- Complejos ---------------- */
    function C(re, im) { return { re: re, im: im || 0 }; }
    var Cx = {
        C: C,
        add: function (a, b) { return C(a.re + b.re, a.im + b.im); },
        sub: function (a, b) { return C(a.re - b.re, a.im - b.im); },
        mul: function (a, b) { return C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); },
        div: function (a, b) {
            var d = b.re * b.re + b.im * b.im;
            if (d === 0) return C(0, 0);
            return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
        },
        scale: function (a, k) { return C(a.re * k, a.im * k); },
        conj: function (a) { return C(a.re, -a.im); },
        abs: function (a) { return Math.sqrt(a.re * a.re + a.im * a.im); },
        arg: function (a) { return Math.atan2(a.im, a.re); },
        polar: function (r, th) { return C(r * Math.cos(th), r * Math.sin(th)); },
        par: function (a, b) { return Cx.div(Cx.mul(a, b), Cx.add(a, b)); }
    };
    VEM.Cx = Cx;

    /* ---------------- Formato numérico (coma decimal) ---------------- */
    function fmt(v, dec) {
        if (v === null || v === undefined || !isFinite(v)) return '—';
        if (dec === undefined) dec = 2;
        return v.toFixed(dec).replace('.', ',');
    }
    /* Formato con cifras significativas razonables según magnitud */
    function fmtAuto(v) {
        if (!isFinite(v)) return '—';
        var a = Math.abs(v);
        if (a >= 1000) return fmt(v, 0);
        if (a >= 100) return fmt(v, 1);
        if (a >= 10) return fmt(v, 2);
        if (a >= 1) return fmt(v, 3);
        return fmt(v, 4);
    }
    function parseNum(s) {
        if (typeof s === 'number') return s;
        if (s === null || s === undefined) return NaN;
        s = String(s).trim().replace(/\s/g, '').replace(',', '.');
        if (s === '') return NaN;
        return Number(s);
    }
    VEM.fmt = fmt;
    VEM.fmtAuto = fmtAuto;
    VEM.parseNum = parseNum;

    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    VEM.clamp = clamp;

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    VEM.esc = esc;

    /* ---------------- Almacenamiento local seguro ---------------- */
    VEM.store = {
        get: function (k, def) {
            try {
                var v = window.localStorage.getItem('vemlab.' + k);
                return v === null ? def : JSON.parse(v);
            } catch (e) { return def; }
        },
        set: function (k, v) {
            try { window.localStorage.setItem('vemlab.' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ }
        },
        del: function (k) {
            try { window.localStorage.removeItem('vemlab.' + k); } catch (e) { /* nada */ }
        }
    };

    /* ---------------- Aleatorio con semilla (máquina problema) ---------------- */
    function hashStr(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
    function rng(seedStr) {
        var a = hashStr(seedStr) || 1;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    VEM.rng = rng;

    /* ---------------- Ruido de instrumentos ---------------- */
    function gauss() {
        var u = 1 - Math.random(), v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    /* Lectura con error aleatorio relativo (σ = 0,3 %) más un error
       absoluto mínimo, como un instrumento digital de clase 0,5. */
    VEM.measure = function (value, absRes) {
        if (!VEM.settings || !VEM.settings.noise) return value;
        var n = value * (1 + 0.003 * gauss()) + (absRes || 0) * 0.5 * gauss();
        return n;
    };

    /* ---------------- Ajuste lineal (mínimos cuadrados) ---------------- */
    VEM.linFit = function (pts) {
        var n = pts.length;
        if (n < 2) return null;
        var sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (var i = 0; i < n; i++) {
            sx += pts[i][0]; sy += pts[i][1];
            sxx += pts[i][0] * pts[i][0]; sxy += pts[i][0] * pts[i][1];
        }
        var d = n * sxx - sx * sx;
        if (Math.abs(d) < 1e-12) return null;
        var m = (n * sxy - sx * sy) / d;
        return { m: m, b: (sy - m * sx) / n };
    };

    /* ---------------- Descarga CSV ---------------- */
    VEM.downloadCSV = function (filename, headers, rows) {
        var lines = [headers.join(';')];
        rows.forEach(function (r) {
            lines.push(r.map(function (v) {
                return typeof v === 'number' ? String(v).replace('.', ',') : '"' + String(v).replace(/"/g, '""') + '"';
            }).join(';'));
        });
        /* BOM para que Excel abra bien las tildes; ';' y coma decimal para Excel en español */
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };

    /* ---------------- Colores desde variables CSS ---------------- */
    function cssVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    VEM.cssVar = cssVar;

    /* =====================================================================
       Trazador de gráficas
       VEM.plot(canvas, {
         xLabel, yLabel, x:[min,max], y:[min,max] (opcionales),
         lines:  [{ data:[[x,y],...], color, dash, width, label }],
         points: [{ data:[[x,y],...], color, label, r, hollow }],
         marker: { x, y, color, label }       // punto de funcionamiento
         vlines: [{ x, color, label }]
       })
       ===================================================================== */
    function niceStep(range, target) {
        var raw = range / (target || 5);
        var mag = Math.pow(10, Math.floor(Math.log10(raw)));
        var n = raw / mag;
        var step = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10;
        return step * mag;
    }

    function extent(opts) {
        var xs = [], ys = [];
        (opts.lines || []).concat(opts.points || []).forEach(function (s) {
            s.data.forEach(function (p) {
                if (isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); }
            });
        });
        if (opts.marker && isFinite(opts.marker.x)) { xs.push(opts.marker.x); ys.push(opts.marker.y); }
        var x = opts.x ? opts.x.slice() : [Math.min.apply(null, xs.concat([0])), Math.max.apply(null, xs.concat([1]))];
        var y = opts.y ? opts.y.slice() : [Math.min.apply(null, ys.concat([0])), Math.max.apply(null, ys.concat([1]))];
        if (x[0] === undefined || x[0] === null) x[0] = Math.min.apply(null, xs.concat([0]));
        if (x[1] === undefined || x[1] === null) x[1] = Math.max.apply(null, xs.concat([1]));
        if (y[0] === undefined || y[0] === null) y[0] = Math.min.apply(null, ys.concat([0]));
        if (y[1] === undefined || y[1] === null) y[1] = Math.max.apply(null, ys.concat([1])) * 1.08;
        if (x[1] - x[0] < 1e-9) x[1] = x[0] + 1;
        if (y[1] - y[0] < 1e-9) y[1] = y[0] + 1;
        return { x: x, y: y };
    }

    function tickLabel(v, step) {
        var dec = step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step)));
        return fmt(v, dec);
    }

    var registry = [];

    function plot(canvas, opts) {
        if (!canvas) return;
        canvas._plotOpts = opts;
        if (registry.indexOf(canvas) < 0) {
            registry.push(canvas);
            if (window.ResizeObserver) {
                new ResizeObserver(function () { draw(canvas); }).observe(canvas);
            }
        }
        draw(canvas);
    }

    function draw(canvas) {
        var opts = canvas._plotOpts;
        if (!opts) return;
        var rect = canvas.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;
        var dpr = window.devicePixelRatio || 1;
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var W = rect.width, H = rect.height;

        var colText = cssVar('--text-2'), colGrid = cssVar('--grid'), colAxis = cssVar('--border-strong');
        var font = '12px ' + cssVar('--font-sans');
        ctx.clearRect(0, 0, W, H);
        ctx.font = font;

        var ex = extent(opts);
        var xs = niceStep(ex.x[1] - ex.x[0], W < 420 ? 4 : 7);
        var ys = niceStep(ex.y[1] - ex.y[0], H < 220 ? 4 : 6);
        var x0 = ex.x[0], x1 = ex.x[1], y0 = ex.y[0], y1 = ex.y[1];
        if (!opts.x) { x0 = Math.floor(x0 / xs) * xs; x1 = Math.ceil(x1 / xs) * xs; }
        if (!opts.y || opts.y[1] === null || opts.y[1] === undefined) { y1 = Math.ceil(y1 / ys) * ys; }
        if (!opts.y || opts.y[0] === null || opts.y[0] === undefined) { y0 = Math.floor(y0 / ys) * ys; }

        /* margen izquierdo según ancho de etiquetas */
        var maxLab = 0;
        for (var t = Math.ceil(y0 / ys) * ys; t <= y1 + ys * 1e-6; t += ys) {
            maxLab = Math.max(maxLab, ctx.measureText(tickLabel(t, ys)).width);
        }
        var L = Math.max(44, maxLab + 26), R = 14, T = opts.legend === false ? 12 : 30, B = 40;
        var pw = W - L - R, ph = H - T - B;
        function X(v) { return L + (v - x0) / (x1 - x0) * pw; }
        function Y(v) { return T + ph - (v - y0) / (y1 - y0) * ph; }

        /* rejilla y ejes */
        ctx.lineWidth = 1;
        ctx.strokeStyle = colGrid;
        ctx.fillStyle = colText;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (t = Math.ceil(y0 / ys) * ys; t <= y1 + ys * 1e-6; t += ys) {
            var yy = Math.round(Y(t)) + 0.5;
            ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke();
            ctx.fillText(tickLabel(Math.abs(t) < ys * 1e-6 ? 0 : t, ys), L - 6, yy);
        }
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (t = Math.ceil(x0 / xs) * xs; t <= x1 + xs * 1e-6; t += xs) {
            var xx = Math.round(X(t)) + 0.5;
            ctx.beginPath(); ctx.moveTo(xx, T); ctx.lineTo(xx, T + ph); ctx.stroke();
            ctx.fillText(tickLabel(Math.abs(t) < xs * 1e-6 ? 0 : t, xs), xx, T + ph + 6);
        }
        ctx.strokeStyle = colAxis;
        ctx.strokeRect(L + 0.5, T + 0.5, pw, ph);

        /* etiquetas de ejes */
        ctx.fillStyle = colText;
        ctx.font = '600 12px ' + cssVar('--font-sans');
        if (opts.xLabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xLabel, L + pw / 2, H - 2); }
        if (opts.yLabel) {
            ctx.save(); ctx.translate(12, T + ph / 2); ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(opts.yLabel, 0, 0); ctx.restore();
        }
        ctx.font = font;

        ctx.save();
        ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();

        (opts.vlines || []).forEach(function (v) {
            ctx.strokeStyle = v.color || colAxis; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(X(v.x), T); ctx.lineTo(X(v.x), T + ph); ctx.stroke();
            ctx.setLineDash([]);
            if (v.label) { ctx.fillStyle = v.color || colText; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(v.label, X(v.x) + 4, T + 4); }
        });

        (opts.lines || []).forEach(function (s) {
            if (!s.data.length) return;
            ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
            ctx.setLineDash(s.dash || []);
            ctx.lineJoin = 'round';
            ctx.beginPath();
            var started = false;
            s.data.forEach(function (p) {
                if (!isFinite(p[1])) { started = false; return; }
                if (!started) { ctx.moveTo(X(p[0]), Y(p[1])); started = true; } else ctx.lineTo(X(p[0]), Y(p[1]));
            });
            ctx.stroke();
            ctx.setLineDash([]);
        });

        (opts.points || []).forEach(function (s) {
            s.data.forEach(function (p) {
                ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), s.r || 4, 0, 2 * Math.PI);
                ctx.fillStyle = s.hollow ? cssVar('--surface') : s.color;
                ctx.strokeStyle = s.color; ctx.lineWidth = 2;
                ctx.fill(); ctx.stroke();
            });
        });

        if (opts.marker && isFinite(opts.marker.x) && isFinite(opts.marker.y)) {
            var mx = X(opts.marker.x), my = Y(opts.marker.y);
            ctx.strokeStyle = opts.marker.color; ctx.globalAlpha = 0.35; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(mx, T + ph); ctx.lineTo(mx, my); ctx.lineTo(L, my); ctx.stroke();
            ctx.setLineDash([]); ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(mx, my, 7, 0, 2 * Math.PI);
            ctx.fillStyle = cssVar('--surface'); ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = opts.marker.color; ctx.stroke();
        }
        ctx.restore();

        /* leyenda */
        if (opts.legend !== false) {
            var items = [];
            (opts.lines || []).forEach(function (s) { if (s.label) items.push({ c: s.color, l: s.label, dash: s.dash }); });
            (opts.points || []).forEach(function (s) { if (s.label) items.push({ c: s.color, l: s.label, pt: true }); });
            if (opts.marker && opts.marker.label) items.push({ c: opts.marker.color, l: opts.marker.label, pt: true, ring: true });
            var lx = L, ly = 10;
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            items.forEach(function (it) {
                var w = ctx.measureText(it.l).width + 34;
                if (lx + w > W - R && lx > L) { lx = L; ly += 16; }
                ctx.strokeStyle = it.c; ctx.fillStyle = it.c; ctx.lineWidth = 2;
                if (it.pt) {
                    ctx.beginPath(); ctx.arc(lx + 9, ly, it.ring ? 5 : 4, 0, 2 * Math.PI);
                    if (it.ring) { ctx.fillStyle = cssVar('--surface'); ctx.fill(); ctx.stroke(); } else ctx.fill();
                } else {
                    ctx.setLineDash(it.dash || []);
                    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + 18, ly); ctx.stroke(); ctx.setLineDash([]);
                }
                ctx.fillStyle = colText; ctx.fillText(it.l, lx + 24, ly);
                lx += w;
            });
        }
    }

    VEM.plot = plot;
    VEM.redrawAll = function () {
        registry.forEach(function (c) { draw(c); });
    };

    /* Paleta de series (se lee de CSS para respetar el tema) */
    VEM.col = function (n) { return cssVar('--s' + n); };
})();
