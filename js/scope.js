/* =====================================================================
   VEMLAB · Osciloscopio / registrador
   - Tendencia: histórico de las magnitudes medidas (registrador Y–t).
   - Ondas: tensión del voltímetro y corriente del amperímetro, u(t), i(t).
   - X–Y: curva par–velocidad por el método de aceleración.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM;
    function f(v, d) { return VEM.fmtN(v, d); }

    var CH = [
        { k: 'U', l: 'U', u: 'V', c: '#ffd60a', d: 1, t: 'Tensión (voltímetro)' },
        { k: 'I', l: 'I', u: 'A', c: '#2ee6ff', d: 3, t: 'Corriente (amperímetro)' },
        { k: 'W1', l: 'W₁', u: 'W', c: '#ff9f43', d: 0, t: 'Vatímetro W1' },
        { k: 'W2', l: 'W₂', u: 'W', c: '#c39bff', d: 0, t: 'Vatímetro W2' },
        { k: 'P', l: 'P', u: 'W', c: '#ff5fd2', d: 0, t: 'Potencia W1 + W2' },
        { k: 'n', l: 'n', u: 'min⁻¹', c: '#4dff88', d: 0, t: 'Velocidad' },
        { k: 'T', l: 'T', u: 'N·m', c: '#ff5b5b', d: 2, t: 'Par en el freno' },
        { k: 'Tm', l: 'Tm', u: 'N·m', c: '#f4f4f4', d: 2, t: 'Par motor (método de aceleración)' }
    ];
    var CHK = {}; CH.forEach(function (c) { CHK[c.k] = c; });
    var TB = [{ s: 10, l: '1 s/div' }, { s: 30, l: '3 s/div' }, { s: 60, l: '6 s/div' }, { s: 300, l: '30 s/div' }];
    var CAP = 40000, DT = 0.02;
    var GRID = '#1f4a35', GRID2 = '#2f6b4f', BG = '#06120c', TXT = '#9fd8b8';

    /* escala 1-2-5 */
    function nice(v) {
        if (!(v > 0)) return 1;
        var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
        return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
    }
    function niceTicks(a, b, n) {
        var step = nice((b - a) / n), out = [];
        for (var v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(+v.toPrecision(10));
        return out;
    }
    function fmtDiv(v) {
        var a = Math.abs(v);
        return a >= 1000 ? f(v / 1000, a % 1000 ? 1 : 0) + 'k' : f(v, a >= 1 || a === 0 ? 0 : a >= 0.1 ? 1 : 2);
    }

    function Scope(root, lab, opts) {
        this.root = root; this.lab = lab; this.opts = opts;
        var s = this.set = opts.settings;
        s.mode = s.mode || 'trend';
        s.on = s.on || { U: 1, I: 1, n: 1 };
        if (s.tb === undefined) s.tb = 1;
        this.t = 0; this.last = -1; this.n = 0; this.head = 0;
        this.time = new Float64Array(CAP);
        this.data = {};
        var self = this;
        CH.forEach(function (c) { self.data[c.k] = new Float32Array(CAP); });
        this.run = true; this.tFrozen = 0; this.cursor = null; this.rd = null;
        this.build();
    }

    Scope.prototype.build = function () {
        var self = this, s = this.set;
        this.root.innerHTML =
            '<div class="scope">' +
            '<div class="scope-screen"><canvas aria-label="Pantalla del osciloscopio"></canvas></div>' +
            '<div class="scope-ctrl">' +
            '<div class="scope-modes" role="tablist">' +
            [['trend', 'Tendencia'], ['wave', 'Ondas u–i'], ['xy', 'Par–velocidad']].map(function (m) {
                return '<button type="button" role="tab" data-mode="' + m[0] + '">' + m[1] + '</button>';
            }).join('') + '</div>' +
            '<div class="scope-sec" data-for="trend"><span class="scope-lbl">Canales</span><div class="scope-chs">' +
            CH.map(function (c) { return '<button type="button" class="sch-btn" data-ch="' + c.k + '" style="--c:' + c.c + '" title="' + c.t + '">' + c.l + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="scope-sec" data-for="trend xy"><span class="scope-lbl">Base de tiempos</span><div class="scope-tb">' +
            TB.map(function (t, i) { return '<button type="button" data-tb="' + i + '">' + t.l + '</button>'; }).join('') + '</div></div>' +
            '<div class="scope-sec scope-btns"><button type="button" class="sbtn run" id="sc-run">RUN</button>' +
            '<button type="button" class="sbtn" id="sc-clear">Borrar</button><button type="button" class="sbtn" id="sc-csv">CSV</button></div>' +
            '<p class="scope-hint" id="sc-hint"></p>' +
            '</div></div>';
        this.canvas = this.root.querySelector('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.root.querySelectorAll('[data-mode]').forEach(function (b) {
            b.onclick = function () { s.mode = b.getAttribute('data-mode'); self.opts.save(); self.syncCtrl(); self.draw(true); };
        });
        this.root.querySelectorAll('[data-ch]').forEach(function (b) {
            b.onclick = function () { var k = b.getAttribute('data-ch'); if (s.on[k]) delete s.on[k]; else s.on[k] = 1; self.opts.save(); self.syncCtrl(); self.draw(true); };
        });
        this.root.querySelectorAll('[data-tb]').forEach(function (b) {
            b.onclick = function () { s.tb = +b.getAttribute('data-tb'); self.opts.save(); self.syncCtrl(); self.draw(true); };
        });
        this.root.querySelector('#sc-run').onclick = function () {
            self.run = !self.run; self.tFrozen = self.t; self.syncCtrl(); self.draw(true);
        };
        this.root.querySelector('#sc-clear').onclick = function () { self.n = 0; self.head = 0; self.draw(true); };
        this.root.querySelector('#sc-csv').onclick = function () { self.exportCSV(); };
        this.canvas.addEventListener('pointermove', function (e) {
            var r = self.canvas.getBoundingClientRect();
            self.cursor = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
            self.draw(true);
        });
        this.canvas.addEventListener('pointerleave', function () { self.cursor = null; self.draw(true); });
        this.syncCtrl();
    };

    Scope.prototype.syncCtrl = function () {
        var s = this.set, root = this.root;
        root.querySelectorAll('[data-mode]').forEach(function (b) { var on = b.getAttribute('data-mode') === s.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        root.querySelectorAll('[data-ch]').forEach(function (b) { b.classList.toggle('on', !!s.on[b.getAttribute('data-ch')]); });
        root.querySelectorAll('[data-tb]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-tb') === s.tb); });
        root.querySelectorAll('[data-for]').forEach(function (d) { d.hidden = d.getAttribute('data-for').split(' ').indexOf(s.mode) < 0; });
        var r = root.querySelector('#sc-run');
        r.textContent = this.run ? 'RUN' : 'STOP';
        r.className = 'sbtn ' + (this.run ? 'run' : 'stop');
        root.querySelector('#sc-hint').innerHTML = {
            trend: 'Registra continuamente lo que miden los aparatos conectados. Pasa el ratón por la pantalla para leer valores; STOP congela la pantalla.',
            wave: 'CH1: tensión del voltímetro · CH2: corriente del amperímetro. Ojo: con U<sub>12</sub> e I<sub>1</sub> el desfase es φ + 30°.',
            xy: 'Curva par–velocidad por el <b>método de aceleración</b> (T<sub>m</sub> = J·dω/dt + T<sub>freno</sub>). Con el freno a 0, arranca el motor a tensión reducida para trazar toda la curva. Cruces: puntos registrados en carga.'
        }[s.mode];
    };

    /* ---------------- Adquisición ---------------- */
    Scope.prototype.push = function (t, rd, n, Tm) {
        var i = this.head, d = this.data, w1 = rd.w1.P, w2 = rd.w2.P;
        this.time[i] = t;
        d.U[i] = rd.vm; d.I[i] = rd.am; d.W1[i] = w1; d.W2[i] = w2; d.P[i] = w1 + w2;
        d.n[i] = n; d.T[i] = rd.T; d.Tm[i] = Tm;
        this.head = (i + 1) % CAP;
        this.n = Math.min(this.n + 1, CAP);
        this.lastN = n;
    };
    Scope.prototype.sample = function (dt, rd) {
        var t0 = this.t, tr = this.lab.trace;
        this.lab.trace = [];
        this.t += dt;
        this.rd = rd;
        /* durante cambios rápidos de velocidad (arranques) se guardan los subpasos del integrador */
        if (tr && tr.length > 2) {
            var m = tr.length / 2;
            for (var k = 0; k < m - 1; k++) {
                if (Math.abs(tr[2 * k] - (this.lastN || 0)) > 4) this.push(t0 + (k + 1) / m * dt, rd, tr[2 * k], tr[2 * k + 1]);
            }
        }
        if (this.t - this.last < DT) return;
        this.last = this.t;
        this.push(this.t, rd, rd.n, rd.Tm);
    };
    Scope.prototype.idx = function (k) { return (this.head - this.n + k + CAP) % CAP; };

    /* primera muestra con tiempo ≥ t0 (búsqueda binaria) */
    Scope.prototype.from = function (t0) {
        var a = 0, b = this.n;
        while (a < b) { var m = (a + b) >> 1; if (this.time[this.idx(m)] < t0) a = m + 1; else b = m; }
        return a;
    };

    /* ---------------- Dibujo ---------------- */
    Scope.prototype.resize = function () {
        var c = this.canvas, r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
        var w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        this.dpr = dpr; this.W = r.width; this.H = r.height;
    };

    Scope.prototype.draw = function (force) {
        if (!this.root.offsetParent) return;
        if (!force && !this.run) return;
        this.resize();
        var ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = BG; ctx.fillRect(0, 0, this.W, this.H);
        ctx.font = '11px "Cascadia Mono", Consolas, monospace';
        ctx.textBaseline = 'alphabetic';
        if (this.set.mode === 'trend') this.drawTrend();
        else if (this.set.mode === 'wave') this.drawWave();
        else this.drawXY();
    };

    Scope.prototype.area = function (padL, padB) {
        return { x: padL, y: 8, w: this.W - padL - 10, h: this.H - 8 - padB };
    };
    Scope.prototype.grid = function (A, nx, ny) {
        var ctx = this.ctx, i;
        ctx.lineWidth = 1;
        ctx.strokeStyle = GRID;
        ctx.beginPath();
        for (i = 0; i <= nx; i++) { var x = Math.round(A.x + A.w * i / nx) + 0.5; ctx.moveTo(x, A.y); ctx.lineTo(x, A.y + A.h); }
        for (i = 0; i <= ny; i++) { var y = Math.round(A.y + A.h * i / ny) + 0.5; ctx.moveTo(A.x, y); ctx.lineTo(A.x + A.w, y); }
        ctx.stroke();
        /* ejes centrales con subdivisiones */
        ctx.strokeStyle = GRID2;
        ctx.beginPath();
        var cx = Math.round(A.x + A.w / 2) + 0.5, cy = Math.round(A.y + A.h / 2) + 0.5;
        for (i = 0; i <= nx * 5; i++) { var xx = A.x + A.w * i / (nx * 5); ctx.moveTo(xx, cy - 3); ctx.lineTo(xx, cy + 3); }
        for (i = 0; i <= ny * 5; i++) { var yy = A.y + A.h * i / (ny * 5); ctx.moveTo(cx - 3, yy); ctx.lineTo(cx + 3, yy); }
        ctx.stroke();
    };

    Scope.prototype.drawTrend = function () {
        var ctx = this.ctx, self = this, s = this.set, A = this.area(10, 22), win = TB[s.tb].s;
        this.grid(A, 10, 8);
        var tEnd = this.run ? this.t : this.tFrozen, t0 = tEnd - win;
        var i0 = this.from(t0), i1 = this.n;
        if (!this.run) i1 = this.from(tEnd + 1e-9);
        var keys = CH.filter(function (c) { return s.on[c.k]; }).map(function (c) { return c.k; });
        var cursorT = this.cursor ? t0 + Math.max(0, Math.min(1, (this.cursor.x * this.W - A.x) / A.w)) * win : null;
        var cursorI = cursorT !== null ? Math.max(i0, Math.min(i1 - 1, this.from(cursorT))) : null;
        var legend = [];
        keys.forEach(function (k) {
            var arr = self.data[k], c = CHK[k], mx = 0, mn = 0, i;
            for (i = i0; i < i1; i++) { var v = arr[self.idx(i)]; if (v > mx) mx = v; if (v < mn) mn = v; }
            var bip = mn < -0.02 * Math.max(mx, -mn), div, zero;
            if (bip) { div = nice(Math.max(mx, -mn) / 4); zero = A.y + A.h / 2; }
            else { div = nice(mx / 8); zero = A.y + A.h; }
            if (mx === 0 && mn === 0) div = { U: 50, I: 1, n: 200, T: 5, Tm: 5 }[k] || 100;
            var py = A.h / 8 / div;
            /* traza decimada por columnas */
            ctx.strokeStyle = c.c; ctx.lineWidth = 1.6; ctx.beginPath();
            var col = -1, cmin = 0, cmax = 0, started = false;
            function flush() {
                if (col < 0) return;
                var x = A.x + col;
                if (!started) { ctx.moveTo(x, zero - cmin * py); started = true; } else ctx.lineTo(x, zero - cmin * py);
                if (cmax !== cmin) ctx.lineTo(x, zero - cmax * py);
            }
            for (i = i0; i < i1; i++) {
                var j = self.idx(i), x = Math.floor((self.time[j] - t0) / win * A.w), v2 = arr[j];
                if (x !== col) { flush(); col = x; cmin = cmax = v2; }
                else { if (v2 < cmin) cmin = v2; if (v2 > cmax) cmax = v2; }
            }
            flush();
            ctx.stroke();
            /* marcador de cero */
            ctx.fillStyle = c.c;
            ctx.beginPath(); ctx.moveTo(A.x - 7, zero - 4); ctx.lineTo(A.x - 1, zero); ctx.lineTo(A.x - 7, zero + 4); ctx.fill();
            var val = i1 > i0 ? arr[self.idx(cursorI !== null ? cursorI : i1 - 1)] : NaN;
            legend.push({ c: c, div: div, val: val });
        });
        /* cursor */
        if (cursorI !== null && i1 > i0) {
            var ct = this.time[this.idx(cursorI)], cx = A.x + (ct - t0) / win * A.w;
            ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(cx, A.y); ctx.lineTo(cx, A.y + A.h); ctx.stroke(); ctx.setLineDash([]);
        }
        /* leyenda */
        this.legend(A, legend.map(function (L) {
            return { c: L.c.c, s: L.c.l + ' ' + fmtDiv(L.div) + ' ' + L.c.u + '/div   ' + f(L.val, L.c.d) + ' ' + L.c.u };
        }));
        ctx.fillStyle = TXT;
        ctx.textAlign = 'left';
        ctx.fillText(TB[s.tb].l + (this.run ? '' : '   ■ STOP'), A.x, this.H - 6);
        ctx.textAlign = 'right';
        var tl = cursorI !== null && i1 > i0 ? 't = ' + f(this.time[this.idx(cursorI)] - tEnd, 2) + ' s' : (this.n ? 'registro: ' + f(Math.min(this.t, this.time[this.idx(this.n - 1)] - this.time[this.idx(0)]), 0) + ' s' : 'sin datos');
        ctx.fillText(tl, A.x + A.w, this.H - 6);
        if (!keys.length) this.center(A, 'Activa algún canal');
    };

    Scope.prototype.legend = function (A, items) {
        var ctx = this.ctx, y = A.y + 16;
        ctx.textAlign = 'left';
        items.forEach(function (it) {
            var w = ctx.measureText(it.s).width;
            ctx.fillStyle = 'rgba(6,18,12,.82)'; ctx.fillRect(A.x + 6, y - 12, w + 22, 16);
            ctx.fillStyle = it.c; ctx.fillRect(A.x + 10, y - 7, 9, 3);
            ctx.fillText(it.s, A.x + 24, y);
            y += 17;
        });
    };
    Scope.prototype.center = function (A, s) {
        var ctx = this.ctx;
        ctx.fillStyle = TXT; ctx.textAlign = 'center'; ctx.font = '13px "Segoe UI", system-ui, sans-serif';
        ctx.fillText(s, A.x + A.w / 2, A.y + A.h / 2 - 8);
        ctx.font = '11px "Cascadia Mono", Consolas, monospace';
    };

    Scope.prototype.drawWave = function () {
        var ctx = this.ctx, A = this.area(10, 22), rd = this.rd;
        this.grid(A, 10, 8);
        var cy = A.y + A.h / 2;
        if (!rd) return;
        var U = VEM.Cx.abs(rd.vmC), I = VEM.Cx.abs(rd.amC);
        if (U < 0.5 && I < 0.002) { this.center(A, 'Sin señal: conecta el voltímetro y el amperímetro y alimenta el montaje'); return; }
        var thU = Math.atan2(rd.vmC.im, rd.vmC.re), thI = Math.atan2(rd.amC.im, rd.amC.re);
        var ref = U >= 0.5 ? thU : thI;
        var vdiv = nice(Math.SQRT2 * U / 3.6), adiv = nice(Math.SQRT2 * I / 3.6), T = 0.04, w = 2 * Math.PI * 50;
        var self = this;
        function trace(mag, th, div, col) {
            ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.beginPath();
            for (var px = 0; px <= A.w; px++) {
                var t = px / A.w * T, v = Math.SQRT2 * mag * Math.sin(w * t + th - ref);
                var y = cy - v / div * (A.h / 8);
                if (px === 0) ctx.moveTo(A.x + px, y); else ctx.lineTo(A.x + px, y);
            }
            ctx.stroke();
        }
        if (U >= 0.5) trace(U, thU, vdiv, CHK.U.c);
        if (I >= 0.002) trace(I, thI, adiv, CHK.I.c);
        var dphi = (thU - thI) * 180 / Math.PI;
        while (dphi > 180) dphi -= 360; while (dphi <= -180) dphi += 360;
        var items = [];
        if (U >= 0.5) items.push({ c: CHK.U.c, s: 'CH1 u  ' + fmtDiv(vdiv) + ' V/div   ' + f(U, 1) + ' V ef.' });
        if (I >= 0.002) items.push({ c: CHK.I.c, s: 'CH2 i  ' + fmtDiv(adiv) + ' A/div   ' + f(I, 3) + ' A ef.' });
        if (U >= 0.5 && I >= 0.002) items.push({ c: '#fff', s: 'Δφ(u→i) ' + f(dphi, 1) + '°  (' + (dphi >= 0 ? 'i retrasada' : 'i adelantada') + ' ' + f(Math.abs(dphi) / 360 * 20, 2) + ' ms)' });
        this.legend(A, items);
        ctx.fillStyle = TXT; ctx.textAlign = 'left';
        ctx.fillText('4 ms/div · disparo CH' + (U >= 0.5 ? '1' : '2') + ' ↑', A.x, this.H - 6);
    };

    Scope.prototype.drawXY = function () {
        var ctx = this.ctx, self = this, s = this.set, A = this.area(46, 30), win = TB[s.tb].s;
        var ns = this.lab.P.plate.ns, tEnd = this.run ? this.t : this.tFrozen;
        var i0 = this.from(tEnd - win), i1 = this.run ? this.n : this.from(tEnd + 1e-9), i;
        var pts = this.opts.points ? this.opts.points() : [];
        var xmin = 0, xmax = ns * 1.05, ymax = 1, ymin = 0, best = null;
        for (i = i0; i < i1; i++) {
            var j = this.idx(i), n = this.data.n[j], T = this.data.Tm[j];
            if (n < 0) xmin = -ns * 1.05;
            if (T > ymax) ymax = T; if (T < ymin) ymin = T;
            if (!best || T > best.T) best = { T: T, n: n };
        }
        pts.forEach(function (p) { if (p.T > ymax) ymax = p.T; });
        var yt = niceTicks(ymin, ymax * 1.08, 6), xt = niceTicks(xmin, xmax, 8);
        var y0 = Math.min(ymin, yt[0]), y1 = Math.max(yt[yt.length - 1], ymax * 1.08);
        function X(v) { return A.x + (v - xmin) / (xmax - xmin) * A.w; }
        function Y(v) { return A.y + A.h - (v - y0) / (y1 - y0) * A.h; }
        ctx.lineWidth = 1; ctx.strokeStyle = GRID; ctx.fillStyle = TXT;
        ctx.beginPath();
        xt.forEach(function (v) { ctx.moveTo(Math.round(X(v)) + 0.5, A.y); ctx.lineTo(Math.round(X(v)) + 0.5, A.y + A.h); });
        yt.forEach(function (v) { ctx.moveTo(A.x, Math.round(Y(v)) + 0.5); ctx.lineTo(A.x + A.w, Math.round(Y(v)) + 0.5); });
        ctx.stroke();
        ctx.strokeStyle = GRID2; ctx.strokeRect(A.x + 0.5, A.y + 0.5, A.w, A.h);
        ctx.textAlign = 'center';
        xt.forEach(function (v) { ctx.fillText(fmtDiv(v), X(v), A.y + A.h + 14); });
        ctx.textAlign = 'right';
        yt.forEach(function (v) { ctx.fillText(fmtDiv(v), A.x - 5, Y(v) + 4); });
        ctx.textAlign = 'center';
        ctx.fillText('n (min⁻¹)', A.x + A.w / 2, this.H - 3);
        ctx.save(); ctx.translate(11, A.y + A.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillText('Tm (N·m)', 0, 0); ctx.restore();
        /* sincronismo */
        ctx.strokeStyle = 'rgba(77,255,136,.5)'; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(X(ns), A.y); ctx.lineTo(X(ns), A.y + A.h); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(77,255,136,.8)'; ctx.textAlign = 'right'; ctx.fillText('n₁', X(ns) - 4, A.y + 12);
        /* traza */
        ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
        ctx.strokeStyle = '#f4f4f4'; ctx.lineWidth = 1.6; ctx.beginPath();
        var started = false, lx = null, ly = null;
        for (i = i0; i < i1; i++) {
            var k = this.idx(i), x = X(this.data.n[k]), y = Y(this.data.Tm[k]);
            if (lx !== null && Math.abs(x - lx) < 0.4 && Math.abs(y - ly) < 0.4) continue;
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
            lx = x; ly = y;
        }
        ctx.stroke();
        /* puntos de carga registrados */
        ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 2;
        pts.forEach(function (p) {
            var x = X(p.n), y = Y(p.T);
            ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke();
        });
        /* punto de funcionamiento actual */
        if (i1 > i0) {
            var kl = this.idx(i1 - 1);
            ctx.fillStyle = '#ff5b5b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(X(this.data.n[kl]), Y(this.data.Tm[kl]), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
        var items = [];
        if (i1 > i0) {
            var kk = this.idx(i1 - 1);
            items.push({ c: '#ff5b5b', s: 'Actual: ' + f(this.data.n[kk], 0) + ' min⁻¹ · ' + f(this.data.Tm[kk], 2) + ' N·m' });
        }
        if (best && best.T > 0.05) items.push({ c: '#f4f4f4', s: 'Máximo en pantalla: ' + f(best.T, 2) + ' N·m a ' + f(best.n, 0) + ' min⁻¹' });
        if (pts.length) items.push({ c: '#ffd60a', s: 'Puntos de carga registrados: ' + pts.length });
        A.x += 6;
        this.legend(A, items);
        if (i1 <= i0 && !pts.length) this.center(A, 'Sin datos en la ventana de tiempo');
    };

    Scope.prototype.exportCSV = function () {
        if (!this.n) { this.opts.toast('El registro está vacío.', 'warn'); return; }
        var lines = ['t (s);' + CH.map(function (c) { return c.l + ' (' + c.u + ')'; }).join(';')], t0 = this.time[this.idx(0)];
        for (var i = 0; i < this.n; i += 5) {
            var j = this.idx(i), self = this;
            lines.push(String(+(this.time[j] - t0).toFixed(2)).replace('.', ',') + ';' + CH.map(function (c) { return String(+self.data[c.k][j].toFixed(c.d + 1)).replace('.', ','); }).join(';'));
        }
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'vemlab-registro.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };

    VEM.Scope = Scope;
})();
