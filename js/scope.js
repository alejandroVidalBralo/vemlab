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

    /* Canales por defecto (bancos de alterna). g(rd, n, Tm) lee el valor de las lecturas del banco. */
    var CH = [
        { k: 'U', l: 'U', u: 'V', c: '#ffd60a', d: 1, t: 'Tensión (voltímetro)', g: function (r) { return r.vm; } },
        { k: 'I', l: 'I', u: 'A', c: '#2ee6ff', d: 3, t: 'Corriente (amperímetro)', g: function (r) { return r.am; } },
        { k: 'W1', l: 'W₁', u: 'W', c: '#ff9f43', d: 0, t: 'Vatímetro W1', g: function (r) { return r.w1.P; } },
        { k: 'W2', l: 'W₂', u: 'W', c: '#c39bff', d: 0, t: 'Vatímetro W2', g: function (r) { return r.w2.P; } },
        { k: 'P', l: 'P', u: 'W', c: '#ff5fd2', d: 0, t: 'Potencia W1 + W2', g: function (r) { return r.w1.P + r.w2.P; } },
        { k: 'n', l: 'n', u: 'min⁻¹', c: '#4dff88', d: 0, t: 'Velocidad', g: function (r, n) { return n; } },
        { k: 'T', l: 'T', u: 'N·m', c: '#ff5b5b', d: 2, t: 'Par en el freno', g: function (r) { return r.T; } },
        { k: 'Tm', l: 'Tm', u: 'N·m', c: '#f4f4f4', d: 2, t: 'Par motor (método de aceleración)', g: function (r, n, Tm) { return Tm; } }
    ];
    var MODES = [['trend', 'Tendencia'], ['wave', 'Ondas u–i'], ['xy', 'Par–velocidad'], ['xyg', 'X–Y']];
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
    /* etiqueta de una división con los decimales que pide el paso de la escala */
    function fmtTick(v, step) {
        if (Math.abs(v) >= 1000 && step >= 100) return fmtDiv(v);
        var d = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step) - 1e-9));
        return f(v, d);
    }
    function fmtDiv(v) {
        var a = Math.abs(v);
        return a >= 1000 ? f(v / 1000, a % 1000 ? 1 : 0) + 'k' : f(v, a >= 1 || a === 0 ? 0 : a >= 0.1 ? 1 : 2);
    }

    function Scope(root, lab, opts) {
        this.root = root; this.lab = lab; this.opts = opts;
        var s = this.set = opts.settings;
        /* canales y modos disponibles según la máquina (opts.channels, opts.modes) */
        var base = opts.CH || CH, allow = opts.channels || base.map(function (c) { return c.k; });
        this.CH = base.filter(function (c) { return allow.indexOf(c.k) >= 0; });
        var CHK = this.CHK = {}; base.forEach(function (c) { CHK[c.k] = c; });
        this.modes = MODES.filter(function (m) { return !opts.modes || opts.modes.indexOf(m[0]) >= 0; });
        if (!this.modes.some(function (m) { return m[0] === s.mode; })) s.mode = this.modes[0][0];
        s.on = s.on || opts.defaultOn || { U: 1, I: 1, n: 1 };
        var ks = this.CH.map(function (c) { return c.k; });
        s.xy = s.xy || opts.xy || { x: ks[0], y: ks[1] || ks[0] };
        if (ks.indexOf(s.xy.x) < 0) s.xy.x = ks[0];
        if (ks.indexOf(s.xy.y) < 0) s.xy.y = ks[1] || ks[0];
        if (s.tb === undefined) s.tb = 1;
        /* cursores A y B: posición como fracción del área de trazado */
        if (!s.cur) s.cur = { on: false, a: 0.3, b: 0.7 };
        this.t = 0; this.last = -1; this.n = 0; this.head = 0;
        this.time = new Float64Array(CAP);
        this.data = {};
        var self = this;
        base.forEach(function (c) { self.data[c.k] = new Float32Array(CAP); });
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
            this.modes.map(function (m) {
                return '<button type="button" role="tab" data-mode="' + m[0] + '">' + m[1] + '</button>';
            }).join('') + '</div>' +
            '<div class="scope-sec" data-for="trend"><span class="scope-lbl">Canales</span><div class="scope-chs">' +
            this.CH.map(function (c) { return '<button type="button" class="sch-btn" data-ch="' + c.k + '" style="--c:' + c.c + '" title="' + c.t + '">' + c.l + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="scope-sec" data-for="xyg"><span class="scope-lbl">Eje X</span><div class="scope-chs">' +
            this.CH.map(function (c) { return '<button type="button" class="sch-btn" data-xy="x" data-k="' + c.k + '" style="--c:' + c.c + '" title="' + c.t + '">' + c.l + '</button>'; }).join('') +
            '</div><span class="scope-lbl">Eje Y</span><div class="scope-chs">' +
            this.CH.map(function (c) { return '<button type="button" class="sch-btn" data-xy="y" data-k="' + c.k + '" style="--c:' + c.c + '" title="' + c.t + '">' + c.l + '</button>'; }).join('') +
            '</div></div>' +
            '<div class="scope-sec" data-for="trend xy"><span class="scope-lbl">Base de tiempos</span><div class="scope-tb">' +
            TB.map(function (t, i) { return '<button type="button" data-tb="' + i + '">' + t.l + '</button>'; }).join('') + '</div></div>' +
            '<div class="scope-sec scope-btns"><button type="button" class="sbtn run" id="sc-run">RUN</button>' +
            '<button type="button" class="sbtn" id="sc-clear">Borrar</button><button type="button" class="sbtn" id="sc-csv">CSV</button></div>' +
            '<div class="scope-sec scope-btns"><button type="button" class="sbtn" id="sc-cur" aria-pressed="false" title="Cursores A y B para leer valores exactos">Cursores A–B</button></div>' +
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
        this.root.querySelectorAll('[data-xy]').forEach(function (b) {
            b.onclick = function () { s.xy[b.getAttribute('data-xy')] = b.getAttribute('data-k'); self.opts.save(); self.syncCtrl(); self.draw(true); };
        });
        this.root.querySelectorAll('[data-tb]').forEach(function (b) {
            b.onclick = function () { s.tb = +b.getAttribute('data-tb'); self.opts.save(); self.syncCtrl(); self.draw(true); };
        });
        this.root.querySelector('#sc-run').onclick = function () {
            self.run = !self.run; self.tFrozen = self.t; self.syncCtrl(); self.draw(true);
        };
        this.root.querySelector('#sc-clear').onclick = function () { self.n = 0; self.head = 0; self.draw(true); };
        this.root.querySelector('#sc-csv').onclick = function () { self.exportCSV(); };
        this.root.querySelector('#sc-cur').onclick = function () {
            s.cur.on = !s.cur.on; self.opts.save(); self.syncCtrl(); self.draw(true);
        };
        var cv = this.canvas, dragCur = null;
        function fracX(e) {
            var r = cv.getBoundingClientRect(), A = self.lastA;
            if (!A) return null;
            return Math.max(0, Math.min(1, (e.clientX - r.left - A.x) / A.w));
        }
        cv.addEventListener('pointerdown', function (e) {
            if (!s.cur.on) return;
            var fx = fracX(e);
            if (fx === null) return;
            e.preventDefault();
            dragCur = Math.abs(fx - s.cur.a) <= Math.abs(fx - s.cur.b) ? 'a' : 'b';
            s.cur[dragCur] = fx;
            cv.setPointerCapture(e.pointerId);
            self.draw(true);
        });
        cv.addEventListener('pointermove', function (e) {
            if (dragCur) { s.cur[dragCur] = fracX(e); self.draw(true); return; }
            if (s.cur.on) return;
            var r = cv.getBoundingClientRect();
            self.cursor = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
            self.draw(true);
        });
        function endDrag() { if (dragCur) { dragCur = null; self.opts.save(); } }
        cv.addEventListener('pointerup', endDrag);
        cv.addEventListener('pointercancel', endDrag);
        cv.addEventListener('pointerleave', function () { if (!dragCur) { self.cursor = null; self.draw(true); } });
        this.syncCtrl();
    };

    Scope.prototype.syncCtrl = function () {
        var s = this.set, root = this.root;
        root.querySelectorAll('[data-mode]').forEach(function (b) { var on = b.getAttribute('data-mode') === s.mode; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        root.querySelectorAll('[data-ch]').forEach(function (b) { b.classList.toggle('on', !!s.on[b.getAttribute('data-ch')]); });
        root.querySelectorAll('[data-tb]').forEach(function (b) { b.classList.toggle('on', +b.getAttribute('data-tb') === s.tb); });
        root.querySelectorAll('[data-xy]').forEach(function (b) { b.classList.toggle('on', s.xy[b.getAttribute('data-xy')] === b.getAttribute('data-k')); });
        root.querySelectorAll('[data-for]').forEach(function (d) { d.hidden = d.getAttribute('data-for').split(' ').indexOf(s.mode) < 0; });
        var cb = root.querySelector('#sc-cur');
        cb.classList.toggle('cur', !!s.cur.on);
        cb.setAttribute('aria-pressed', s.cur.on ? 'true' : 'false');
        var r = root.querySelector('#sc-run');
        r.textContent = this.run ? 'RUN' : 'STOP';
        r.className = 'sbtn ' + (this.run ? 'run' : 'stop');
        root.querySelector('#sc-hint').innerHTML = {
            trend: 'Registra continuamente lo que miden los aparatos conectados. Con <b>Cursores A–B</b> arrastra A y B por la pantalla para leer valores exactos y diferencias. STOP congela la pantalla.',
            wave: 'CH1: tensión del voltímetro · CH2: corriente del amperímetro. Ojo: con U<sub>12</sub> e I<sub>1</sub> el desfase es φ + 30°. Con los cursores mide Δt entre dos pasos por cero.',
            xy: 'Curva par–velocidad por el <b>método de aceleración</b> (T<sub>m</sub> = J·dω/dt + T<sub>freno</sub>). Con el freno a 0, arranca el motor a tensión reducida para trazar toda la curva. Los cursores leen n, s y T sobre la curva.',
            xyg: 'Representa una magnitud frente a otra con todo el registro (por ejemplo, la curva de vacío: X = corriente de excitación, Y = tensión). Varía <b>despacio</b> la magnitud del eje X para dibujar la curva. «Borrar» empieza una curva nueva; los cursores A y B marcan el punto más cercano.'
        }[s.mode];
    };

    /* ---------------- Adquisición ---------------- */
    Scope.prototype.push = function (t, rd, n, Tm) {
        var i = this.head, d = this.data, ch = this.CH;
        this.time[i] = t;
        for (var k = 0; k < ch.length; k++) d[ch[k].k][i] = ch[k].g(rd, n, Tm);
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
        this.legendBox = null;
        ctx.fillStyle = BG; ctx.fillRect(0, 0, this.W, this.H);
        ctx.font = '11px "Cascadia Mono", Consolas, monospace';
        ctx.textBaseline = 'alphabetic';
        if (this.set.mode === 'trend') this.drawTrend();
        else if (this.set.mode === 'wave') this.drawWave();
        else if (this.set.mode === 'xyg') this.drawXYG();
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
        var keys = this.CH.filter(function (c) { return s.on[c.k]; }).map(function (c) { return c.k; });
        var cursorT = this.cursor ? t0 + Math.max(0, Math.min(1, (this.cursor.x * this.W - A.x) / A.w)) * win : null;
        var cursorI = cursorT !== null ? Math.max(i0, Math.min(i1 - 1, this.from(cursorT))) : null;
        var legend = [], scales = {};
        this.lastA = A;
        keys.forEach(function (k) {
            var arr = self.data[k], c = self.CHK[k], mx = 0, mn = 0, i;
            for (i = i0; i < i1; i++) { var v = arr[self.idx(i)]; if (v > mx) mx = v; if (v < mn) mn = v; }
            var bip = mn < -0.02 * Math.max(mx, -mn), div, zero;
            if (bip) { div = nice(Math.max(mx, -mn) / 4); zero = A.y + A.h / 2; }
            else { div = nice(mx / 8); zero = A.y + A.h; }
            if (mx === 0 && mn === 0) div = { U: 50, I: 1, n: 200, T: 5, Tm: 5 }[k] || 100;
            var py = A.h / 8 / div;
            scales[k] = { zero: zero, py: py };
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
        /* cursores A–B con lectura exacta */
        var curRows = null;
        if (s.cur.on && keys.length) {
            var cx2 = this.drawCursors(A);
            if (i1 > i0) {
                var at = function (fr) { return Math.max(i0, Math.min(i1 - 1, self.from(t0 + fr * win))); };
                var ia = at(s.cur.a), ib = at(s.cur.b), ja = this.idx(ia), jb = this.idx(ib);
                var rows = [row('t (s)', f(this.time[ja] - tEnd, 2), f(this.time[jb] - tEnd, 2), f(this.time[jb] - this.time[ja], 2))];
                keys.forEach(function (k) {
                    var c = self.CHK[k], va = self.data[k][ja], vb = self.data[k][jb], sc = scales[k];
                    rows.push(row(c.l + ' (' + c.u + ')', f(va, c.d), f(vb, c.d), f(vb - va, c.d), c.c));
                    self.curDot('a', cx2.a, sc.zero - va * sc.py);
                    self.curDot('b', cx2.b, sc.zero - vb * sc.py);
                });
                curRows = rows;
            }
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
        if (curRows) this.readout(A, curRows);
        if (!keys.length) this.center(A, 'Activa algún canal');
    };

    Scope.prototype.legend = function (A, items) {
        var ctx = this.ctx, y = A.y + 16, box = this.legendBox = { r: A.x, b: A.y };
        ctx.textAlign = 'left';
        items.forEach(function (it) {
            var w = ctx.measureText(it.s).width;
            box.r = Math.max(box.r, A.x + 28 + w); box.b = y + 6;
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

    /* ---------------- Cursores A–B ---------------- */
    var CUR = { a: { c: '#ffffff', l: 'A' }, b: { c: '#ff8ad8', l: 'B' } };
    /* Líneas verticales de los cursores; devuelve sus posiciones x */
    Scope.prototype.drawCursors = function (A) {
        var ctx = this.ctx, s = this.set.cur, out = {};
        ['a', 'b'].forEach(function (k) {
            var x = Math.round(A.x + s[k] * A.w) + 0.5;
            out[k] = x;
            ctx.strokeStyle = CUR[k].c; ctx.lineWidth = 1.2; ctx.setLineDash([6, 4]);
            ctx.beginPath(); ctx.moveTo(x, A.y); ctx.lineTo(x, A.y + A.h); ctx.stroke(); ctx.setLineDash([]);
            /* lengüeta para arrastrar */
            ctx.fillStyle = CUR[k].c;
            ctx.beginPath(); ctx.moveTo(x - 8, A.y + A.h); ctx.lineTo(x + 8, A.y + A.h); ctx.lineTo(x + 8, A.y + A.h - 12); ctx.lineTo(x, A.y + A.h - 18); ctx.lineTo(x - 8, A.y + A.h - 12); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#06120c'; ctx.textAlign = 'center';
            ctx.fillText(CUR[k].l, x, A.y + A.h - 3);
        });
        return out;
    };
    /* Marca un punto medido por un cursor */
    Scope.prototype.curDot = function (k, x, y) {
        var ctx = this.ctx;
        if (!isFinite(x) || !isFinite(y)) return;
        ctx.fillStyle = CUR[k].c; ctx.strokeStyle = '#06120c'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    };
    /* Tabla de lecturas: filas [etiqueta, A, B, Δ] en la esquina superior derecha */
    Scope.prototype.readout = function (A, rows, where) {
        var ctx = this.ctx, lh = 15, pad = 7;
        rows = [['', 'A', 'B', 'Δ = B − A']].concat(rows);
        var cw = [0, 0, 0, 0];
        rows.forEach(function (r) { r.forEach(function (c, i) { cw[i] = Math.max(cw[i], ctx.measureText(c).width); }); });
        var gap = 12, w = cw[0] + cw[1] + cw[2] + cw[3] + 3 * gap + 2 * pad, h = rows.length * lh + 2 * pad - 3;
        var x0 = A.x + A.w - w - 4, y0 = A.y + 4, L = this.legendBox;
        if (where === 'bl') { x0 = A.x + 8; y0 = A.y + A.h - h - 24; }          /* abajo a la izquierda */
        else if (L && x0 < L.r + 6) y0 = L.b + 4;
        ctx.fillStyle = 'rgba(6,18,12,.9)'; ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = GRID2; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
        rows.forEach(function (r, j) {
            var y = y0 + pad + 9 + j * lh, x = x0 + pad;
            r.forEach(function (c, i) {
                ctx.fillStyle = j === 0 ? (i === 1 ? CUR.a.c : i === 2 ? CUR.b.c : TXT) : (i === 0 ? (r.col || TXT) : '#e8f5ee');
                if (i === 0) { ctx.textAlign = 'left'; ctx.fillText(c, x, y); }
                else { ctx.textAlign = 'right'; ctx.fillText(c, x + cw[i], y); }
                x += cw[i] + gap;
            });
        });
        ctx.textAlign = 'left';
    };
    function row(label, a, b, d, col) { var r = [label, a, b, d]; r.col = col; return r; }

    Scope.prototype.drawWave = function () {
        var ctx = this.ctx, A = this.area(10, 22), rd = this.rd;
        this.lastA = A;
        this.grid(A, 10, 8);
        var cy = A.y + A.h / 2;
        if (!rd) return;
        var U = VEM.Cx.abs(rd.vmC), I = VEM.Cx.abs(rd.amC);
        if (U < 0.5 && I < 0.002) { this.center(A, 'Sin señal: conecta el voltímetro y el amperímetro y alimenta el montaje'); return; }
        var thU = Math.atan2(rd.vmC.im, rd.vmC.re), thI = Math.atan2(rd.amC.im, rd.amC.re);
        var ref = U >= 0.5 ? thU : thI;
        var fw = rd.fw || 50, vdiv = nice(Math.SQRT2 * U / 3.6), adiv = nice(Math.SQRT2 * I / 3.6), T = 0.04, w = 2 * Math.PI * fw;
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
        if (U >= 0.5) trace(U, thU, vdiv, this.CHK.U.c);
        if (I >= 0.002) trace(I, thI, adiv, this.CHK.I.c);
        var dphi = (thU - thI) * 180 / Math.PI;
        while (dphi > 180) dphi -= 360; while (dphi <= -180) dphi += 360;
        var items = [];
        if (U >= 0.5) items.push({ c: this.CHK.U.c, s: 'CH1 u  ' + fmtDiv(vdiv) + ' V/div   ' + f(U, 1) + ' V ef.' });
        if (I >= 0.002) items.push({ c: this.CHK.I.c, s: 'CH2 i  ' + fmtDiv(adiv) + ' A/div   ' + f(I, 3) + ' A ef.' });
        if (U >= 0.5 && I >= 0.002) items.push({ c: '#fff', s: 'Δφ(u→i) ' + f(dphi, 1) + '°  (' + (dphi >= 0 ? 'i retrasada' : 'i adelantada') + ' ' + f(Math.abs(dphi) / 360 * 1000 / fw, 2) + ' ms)' });
        this.legend(A, items);
        /* cursores A–B: valores instantáneos y desfase */
        var cur = this.set.cur;
        if (cur.on) {
            var cxw = this.drawCursors(A);
            var inst = function (mag, th, fr) { return Math.SQRT2 * mag * Math.sin(w * fr * T + th - ref); };
            var ta = cur.a * T * 1000, tb = cur.b * T * 1000, dt = tb - ta;
            var rws = [row('t (ms)', f(ta, 2), f(tb, 2), f(dt, 2))];
            if (U >= 0.5) {
                var ua = inst(U, thU, cur.a), ub = inst(U, thU, cur.b);
                rws.push(row('u (V)', f(ua, 1), f(ub, 1), f(ub - ua, 1), this.CHK.U.c));
                this.curDot('a', cxw.a, cy - ua / vdiv * (A.h / 8)); this.curDot('b', cxw.b, cy - ub / vdiv * (A.h / 8));
            }
            if (I >= 0.002) {
                var ia2 = inst(I, thI, cur.a), ib2 = inst(I, thI, cur.b);
                rws.push(row('i (A)', f(ia2, 3), f(ib2, 3), f(ib2 - ia2, 3), this.CHK.I.c));
                this.curDot('a', cxw.a, cy - ia2 / adiv * (A.h / 8)); this.curDot('b', cxw.b, cy - ib2 / adiv * (A.h / 8));
            }
            rws.push(row('Δt en grados (' + f(fw, fw === 50 ? 0 : 2) + ' Hz)', '', '', f(dt * fw / 1000 * 360, 1) + '°'));
            this.readout(A, rws);
        }
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
        this.lastA = { x: A.x, y: A.y, w: A.w, h: A.h };
        /* cursores A–B: punto de la curva más cercano a la velocidad del cursor */
        var xyRows = null;
        if (s.cur.on) {
            var cxy = this.drawCursors(A), hit = {}, kk2;
            ['a', 'b'].forEach(function (c) {
                var nc = xmin + s.cur[c] * (xmax - xmin), bi = -1, bd = Infinity;
                for (var q = i0; q < i1; q++) { var d = Math.abs(self.data.n[self.idx(q)] - nc); if (d < bd) { bd = d; bi = q; } }
                if (bi >= 0 && bd < (xmax - xmin) * 0.02) {
                    kk2 = self.idx(bi);
                    hit[c] = { n: self.data.n[kk2], T: self.data.Tm[kk2] };
                    self.curDot(c, X(hit[c].n), Y(hit[c].T));
                } else hit[c] = { n: nc, T: NaN };
            });
            var ha = hit.a, hb = hit.b, sl = function (n) { return (ns - n) / ns * 100; };
            xyRows = ([
                row('n (min⁻¹)', f(ha.n, 0), f(hb.n, 0), f(hb.n - ha.n, 0)),
                row('s (%)', f(sl(ha.n), 2), f(sl(hb.n), 2), f(sl(hb.n) - sl(ha.n), 2)),
                row('Tm (N·m)', f(ha.T, 2), f(hb.T, 2), f(hb.T - ha.T, 2), '#f4f4f4')
            ]);
        }
        var items = [];
        if (i1 > i0) {
            var kk = this.idx(i1 - 1);
            items.push({ c: '#ff5b5b', s: 'Actual: ' + f(this.data.n[kk], 0) + ' min⁻¹ · ' + f(this.data.Tm[kk], 2) + ' N·m' });
        }
        if (best && best.T > 0.05) items.push({ c: '#f4f4f4', s: 'Máximo en pantalla: ' + f(best.T, 2) + ' N·m a ' + f(best.n, 0) + ' min⁻¹' });
        if (pts.length) items.push({ c: '#ffd60a', s: 'Puntos de carga registrados: ' + pts.length });
        A.x += 6;
        this.legend(A, items);
        if (xyRows) { A.x -= 6; this.readout(A, xyRows, 'bl'); }
        if (i1 <= i0 && !pts.length) this.center(A, 'Sin datos en la ventana de tiempo');
    };

    /* ---------------- X–Y genérico: una magnitud frente a otra, con todo el registro ---------------- */
    Scope.prototype.drawXYG = function () {
        var ctx = this.ctx, self = this, s = this.set, A = this.area(52, 30);
        var cx = this.CHK[s.xy.x], cy = this.CHK[s.xy.y], X = this.data[cx.k], Y = this.data[cy.k];
        var tEnd = this.run ? this.t : this.tFrozen, i1 = this.run ? this.n : this.from(tEnd + 1e-9), i;
        var xmin = 0, xmax = 0, ymin = 0, ymax = 0;
        for (i = 0; i < i1; i++) {
            var j = this.idx(i), xv = X[j], yv = Y[j];
            if (xv < xmin) xmin = xv; if (xv > xmax) xmax = xv;
            if (yv < ymin) ymin = yv; if (yv > ymax) ymax = yv;
        }
        if (xmax - xmin < 1e-9) xmax = xmin + 1;
        if (ymax - ymin < 1e-9) ymax = ymin + 1;
        var xt = niceTicks(xmin, xmax + (xmax - xmin) * 0.04, 8), yt = niceTicks(ymin, ymax + (ymax - ymin) * 0.06, 6);
        var x0 = Math.min(xmin, xt[0]), x1 = Math.max(xt[xt.length - 1], xmax), y0 = Math.min(ymin, yt[0]), y1 = Math.max(yt[yt.length - 1], ymax);
        function PX(v) { return A.x + (v - x0) / (x1 - x0) * A.w; }
        function PY(v) { return A.y + A.h - (v - y0) / (y1 - y0) * A.h; }
        ctx.lineWidth = 1; ctx.strokeStyle = GRID; ctx.fillStyle = TXT;
        ctx.beginPath();
        xt.forEach(function (v) { ctx.moveTo(Math.round(PX(v)) + 0.5, A.y); ctx.lineTo(Math.round(PX(v)) + 0.5, A.y + A.h); });
        yt.forEach(function (v) { ctx.moveTo(A.x, Math.round(PY(v)) + 0.5); ctx.lineTo(A.x + A.w, Math.round(PY(v)) + 0.5); });
        ctx.stroke();
        ctx.strokeStyle = GRID2; ctx.strokeRect(A.x + 0.5, A.y + 0.5, A.w, A.h);
        /* ejes por el cero */
        ctx.beginPath();
        if (x0 < 0 && x1 > 0) { ctx.moveTo(Math.round(PX(0)) + 0.5, A.y); ctx.lineTo(Math.round(PX(0)) + 0.5, A.y + A.h); }
        if (y0 < 0 && y1 > 0) { ctx.moveTo(A.x, Math.round(PY(0)) + 0.5); ctx.lineTo(A.x + A.w, Math.round(PY(0)) + 0.5); }
        ctx.stroke();
        ctx.fillStyle = TXT; ctx.textAlign = 'center';
        var xs = xt.length > 1 ? xt[1] - xt[0] : 1, ys = yt.length > 1 ? yt[1] - yt[0] : 1;
        xt.forEach(function (v) { ctx.fillText(fmtTick(v, xs), PX(v), A.y + A.h + 14); });
        ctx.textAlign = 'right';
        yt.forEach(function (v) { ctx.fillText(fmtTick(v, ys), A.x - 5, PY(v) + 4); });
        ctx.textAlign = 'center';
        ctx.fillStyle = cx.c; ctx.fillText(cx.l + ' (' + cx.u + ')', A.x + A.w / 2, this.H - 3);
        ctx.save(); ctx.translate(12, A.y + A.h / 2); ctx.rotate(-Math.PI / 2); ctx.fillStyle = cy.c; ctx.fillText(cy.l + ' (' + cy.u + ')', 0, 0); ctx.restore();
        /* traza */
        ctx.save(); ctx.beginPath(); ctx.rect(A.x, A.y, A.w, A.h); ctx.clip();
        ctx.strokeStyle = cy.c; ctx.lineWidth = 1.6; ctx.beginPath();
        var started = false, lx = null, ly = null;
        for (i = 0; i < i1; i++) {
            var k = this.idx(i), px = PX(X[k]), py = PY(Y[k]);
            if (lx !== null && Math.abs(px - lx) < 0.5 && Math.abs(py - ly) < 0.5) continue;
            if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
            lx = px; ly = py;
        }
        ctx.stroke();
        if (i1 > 0) {
            var kl = this.idx(i1 - 1);
            ctx.fillStyle = '#ff5b5b'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(PX(X[kl]), PY(Y[kl]), 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
        this.lastA = { x: A.x, y: A.y, w: A.w, h: A.h };
        var rows = null;
        if (s.cur.on && i1 > 0) {
            var cxy = this.drawCursors(A), hit = {};
            ['a', 'b'].forEach(function (c) {
                var xc = x0 + s.cur[c] * (x1 - x0), bi = -1, bd = Infinity;
                for (var q = i1 - 1; q >= 0; q--) { var d = Math.abs(X[self.idx(q)] - xc); if (d < bd) { bd = d; bi = q; } }
                var kk = self.idx(bi);
                hit[c] = bd < (x1 - x0) * 0.02 ? { x: X[kk], y: Y[kk] } : { x: xc, y: NaN };
                if (isFinite(hit[c].y)) self.curDot(c, PX(hit[c].x), PY(hit[c].y));
            });
            rows = [
                row(cx.l + ' (' + cx.u + ')', f(hit.a.x, cx.d), f(hit.b.x, cx.d), f(hit.b.x - hit.a.x, cx.d), cx.c),
                row(cy.l + ' (' + cy.u + ')', f(hit.a.y, cy.d), f(hit.b.y, cy.d), f(hit.b.y - hit.a.y, cy.d), cy.c)
            ];
        }
        var items = [];
        if (i1 > 0) { var kz = this.idx(i1 - 1); items.push({ c: '#ff5b5b', s: 'Actual: ' + cx.l + ' = ' + f(X[kz], cx.d) + ' ' + cx.u + ' · ' + cy.l + ' = ' + f(Y[kz], cy.d) + ' ' + cy.u }); }
        A.x += 6;
        this.legend(A, items);
        if (rows) { A.x -= 6; this.readout(A, rows, 'bl'); }
        if (!i1) this.center(A, 'Sin datos: el registro está vacío');
        ctx.fillStyle = TXT; ctx.textAlign = 'right';
        ctx.fillText(this.run ? '' : '■ STOP', A.x + A.w, this.H - 3);
    };

    Scope.prototype.exportCSV = function () {
        if (!this.n) { this.opts.toast('El registro está vacío.', 'warn'); return; }
        var CHs = this.CH;
        var lines = ['t (s);' + CHs.map(function (c) { return c.l + ' (' + c.u + ')'; }).join(';')], t0 = this.time[this.idx(0)];
        for (var i = 0; i < this.n; i += 5) {
            var j = this.idx(i), self = this;
            lines.push(String(+(this.time[j] - t0).toFixed(2)).replace('.', ',') + ';' + CHs.map(function (c) { return String(+self.data[c.k][j].toFixed(c.d + 1)).replace('.', ','); }).join(';'));
        }
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'vemlab-registro.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };

    VEM.Scope = Scope;
})();
