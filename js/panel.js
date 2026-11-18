/* =====================================================================
   VEMLAB · Panel lateral
   Guía de cada ensayo con comprobaciones automáticas del montaje,
   cuaderno de medidas, gráficas y comprobación de parámetros.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM, Motor = VEM.Motor, SQ3 = Math.sqrt(3);

    /* ---------------- Formato ---------------- */
    VEM.fmtN = function (v, dec) {
        if (v === null || v === undefined || !isFinite(v)) return '—';
        return Number(v).toFixed(dec === undefined ? 2 : dec).replace('.', ',');
    };
    var f = VEM.fmtN;
    function parseNum(s) {
        s = String(s === undefined || s === null ? '' : s).trim().replace(/\s/g, '').replace(',', '.');
        return s === '' ? NaN : Number(s);
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    /* ---------------- Ensayos ---------------- */
    var TESTS = {
        vacio: { name: 'Vacío', long: 'Ensayo de vacío' },
        cc: { name: 'Cortocircuito', long: 'Ensayo de cortocircuito (rotor bloqueado)' },
        carga: { name: 'Carga', long: 'Ensayo en carga con freno' }
    };

    /* Magnitudes de una fila de medidas (incluye derivadas) */
    var FIELDS = {
        U: { l: 'U', u: 'V', d: 1, t: 'Tensión de línea' },
        U2: { l: 'U²', u: 'V²', d: 0, t: 'Cuadrado de la tensión' },
        I: { l: 'I', u: 'A', d: 3, t: 'Corriente de línea' },
        I2: { l: 'I²', u: 'A²', d: 2, t: 'Cuadrado de la corriente' },
        W1: { l: 'W₁', u: 'W', d: 1, t: 'Lectura del vatímetro W1' },
        W2: { l: 'W₂', u: 'W', d: 1, t: 'Lectura del vatímetro W2' },
        P: { l: 'P', u: 'W', d: 1, t: 'Potencia absorbida W1 + W2' },
        Pfm: { l: 'P − 3I²R₁', u: 'W', d: 1, t: 'Pérdidas en el hierro + mecánicas (usa tu R₁)' },
        cos: { l: 'cos φ', u: '', d: 3, t: 'P / (√3·U·I)' },
        n: { l: 'n', u: 'min⁻¹', d: 0, t: 'Velocidad' },
        s: { l: 's', u: '%', d: 2, t: 'Deslizamiento' },
        T: { l: 'T', u: 'N·m', d: 2, t: 'Par en el eje' },
        Pu: { l: 'Pᵤ', u: 'W', d: 0, t: 'Potencia útil T·ω' },
        eta: { l: 'η', u: '%', d: 1, t: 'Rendimiento Pᵤ/P' }
    };
    var COLS = {
        vacio: ['U', 'I', 'W1', 'W2', 'P', 'cos', 'n'],
        cc: ['U', 'I', 'W1', 'W2', 'P', 'cos', 'T'],
        carga: ['U', 'I', 'W1', 'W2', 'P', 'cos', 'n', 's', 'T', 'Pu', 'eta']
    };
    var PRESETS = {
        vacio: [{ x: 'U2', y: 'P', fit: true, t: 'P₀ – U²' }, { x: 'U2', y: 'Pfm', fit: true, t: 'P₀ − Pcu – U²' }, { x: 'U', y: 'I', t: 'I₀ – U' }, { x: 'U', y: 'cos', t: 'cos φ₀ – U' }],
        cc: [{ x: 'I', y: 'U', fit: true, t: 'Ucc – Icc' }, { x: 'I2', y: 'P', fit: true, t: 'Pcc – Icc²' }, { x: 'I', y: 'T', t: 'Tarr – Icc' }],
        carga: [{ x: 'Pu', y: 'I', t: 'I – Pᵤ' }, { x: 'Pu', y: 'eta', t: 'η – Pᵤ' }, { x: 'Pu', y: 'cos', t: 'cos φ – Pᵤ' }, { x: 'n', y: 'T', t: 'T – n', model: true }, { x: 's', y: 'T', t: 'T – s' }]
    };

    function derive(row, P, R1) {
        var o = Object.assign({}, row);
        o.P = row.W1 + row.W2;
        o.U2 = row.U * row.U;
        o.I2 = row.I * row.I;
        o.cos = o.P / (SQ3 * row.U * row.I);
        var ns = 60 * P.f / P.p;
        o.s = (ns - row.n) / ns * 100;
        o.Pu = row.T * row.n * Math.PI / 30;
        o.eta = o.Pu / o.P * 100;
        o.Pfm = isFinite(R1) ? o.P - 3 * row.I * row.I * R1 : NaN;
        return o;
    }

    /* ---------------- Montaje de referencia (Aron) ---------------- */
    function referenceWiring(P) {
        var c = [
            ['src.L1', 'am.a', 'brown'], ['am.b', 'w1.Ia', 'brown'], ['w1.Ib', 'm.U1', 'brown'],
            ['src.L2', 'w2.Ia', 'black'], ['w2.Ib', 'm.V1', 'black'],
            ['src.L3', 'm.W1', 'grey'],
            ['w1.Ua', 'm.U1', 'red'], ['w1.Ub', 'm.W1', 'yellow'],
            ['w2.Ua', 'm.V1', 'red'], ['w2.Ub', 'm.W1', 'yellow'],
            ['vm.a', 'm.U1', 'blue'], ['vm.b', 'm.V1', 'blue']
        ].map(function (x) { return { a: x[0], b: x[1], color: x[2] }; });
        var br = P.netConn === 'Y' ? { 'W2-U2': 1, 'U2-V2': 1 } : { 'U1-W2': 1, 'V1-U2': 1, 'W1-V2': 1 };
        return { cables: c, bridges: br };
    }

    /* ¿Llega cada fase a un borne distinto (a través de aparatos de baja impedancia)? */
    function linesReachMotor(lab) {
        var parent = {};
        VEM.Circuit.TERMINALS.forEach(function (t) { parent[t] = t; });
        function find(x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; }
        function join(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
        lab.cables.forEach(function (c) { join(c.a, c.b); });
        [['am.a', 'am.b'], ['w1.Ia', 'w1.Ib'], ['w2.Ia', 'w2.Ib']].forEach(function (p) { join(p[0], p[1]); });
        var L = ['src.L1', 'src.L2', 'src.L3'].map(find), seen = {};
        var ok = ['m.U1', 'm.V1', 'm.W1'].every(function (t) {
            var r = find(t), k = L.indexOf(r);
            if (k < 0 || seen[k]) return false;
            seen[k] = 1; return true;
        });
        var shorted = L[0] === L[1] || L[1] === L[2] || L[0] === L[2];
        return { ok: ok && !shorted, shorted: shorted };
    }

    /* ---------------- Panel ---------------- */
    function Panel(root, lab, st, hooks) {
        this.root = root; this.lab = lab; this.st = st; this.hooks = hooks;
        this.shown = null;
        this.prof = /[?&]profesor(=1|&|$)/.test(location.search);
        this.render();
    }

    Panel.prototype.$ = function (s) { return this.root.querySelector(s); };

    Panel.prototype.render = function () {
        var self = this;
        this.renderPlate();
        this.root.querySelectorAll('[data-test]').forEach(function (b) {
            b.onclick = function () { self.st.test = b.getAttribute('data-test'); self.hooks.save(); self.render(); };
            var on = b.getAttribute('data-test') === self.st.test;
            b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
        });
        this.root.querySelectorAll('[data-tab]').forEach(function (b) {
            b.onclick = function () { self.st.tab = b.getAttribute('data-tab'); self.hooks.save(); self.render(); };
            var on = b.getAttribute('data-tab') === self.st.tab;
            b.classList.toggle('on', on); b.setAttribute('aria-selected', on);
        });
        var body = this.$('#tab-body');
        body.innerHTML = '';
        if (this.st.tab === 'guia') this.renderGuide(body);
        else if (this.st.tab === 'medidas') this.renderMeas(body);
        else if (this.st.tab === 'graficas') this.renderChart(body);
        else this.renderCheck(body);
    };

    Panel.prototype.renderPlate = function () {
        var P = this.lab.P, pl = P.plate;
        this.$('#plate').innerHTML =
            '<div class="plate-head"><span>' + esc(P.maker) + '</span><span>Mot. 3~ · ' + esc(P.code) + '</span><span>' + esc(P.name) + '</span></div>' +
            '<div class="plate-grid">' +
            '<div><b>' + f(pl.Pn / 1000, 1) + '</b> kW</div><div><b>' + pl.Ud + '/' + pl.Uy + '</b> V Δ/Y</div><div><b>' + pl.f + '</b> Hz</div>' +
            '<div><b>' + f(pl.Id, 1) + '/' + f(pl.Iy, 2) + '</b> A</div><div><b>' + pl.n + '</b> min⁻¹</div><div>cos φ <b>' + f(pl.cos, 2) + '</b></div>' +
            '</div>';
    };

    /* ---------------- Guía ---------------- */
    var STEPS = {
        vacio: [
            'Con Q1 abierto, coloca los puentes de la caja de bornes según la placa y la red de 400 V.',
            'Conecta los vatímetros en montaje Aron: bobina amperimétrica de W1 en L1 y de W2 en L2; bobinas voltimétricas de cada uno entre su fase y L3.',
            'Intercala el amperímetro en una fase y el voltímetro entre dos fases del motor.',
            'Freno a 0 N·m y rotor libre. Lleva el autotransformador a 0 V y cierra Q1.',
            'Sube la tensión hasta la nominal: el motor arranca y gira casi a la velocidad de sincronismo.',
            'Registra puntos bajando la tensión desde ≈ 1,1·Un hasta que la velocidad empiece a caer de forma apreciable.'
        ],
        cc: [
            'Con Q1 abierto, el mismo montaje que en vacío (puentes según placa, Aron, amperímetro y voltímetro).',
            'Activa el BLOQUEO DEL ROTOR con el motor parado.',
            '¡Autotransformador a 0 V antes de cerrar Q1! A tensión nominal con el rotor bloqueado la corriente sería 5–7 veces la nominal.',
            'Cierra Q1 y sube la tensión despacio (botones − / + del autotransformador) hasta que la corriente sea la nominal.',
            'Registra varios puntos hasta I ≈ In. No mantengas el ensayo mucho tiempo: vigila la temperatura de los devanados.'
        ],
        carga: [
            'Mismo montaje, rotor libre y freno a 0 N·m.',
            'Arranca el motor y ajusta la tensión nominal (400 V entre fases).',
            'Aumenta la consigna de par del freno por escalones, desde vacío hasta ≈ 1,25·Tn, y registra en cada uno.',
            'Comprueba en cada punto que la tensión sigue siendo la nominal; reajústala si hace falta.',
            'Con los puntos obtenidos calcula Pᵤ = T·ω, η, cos φ y s, y compáralos con la placa.'
        ]
    };
    var THEORY = {
        vacio: 'P₀ = W₁ + W₂ · cos φ₀ = P₀ / (√3·U·I₀)<br>P₀ − 3·I₀²·R₁ = P<sub>Fe</sub> + P<sub>m</sub>; extrapolando la recta (P₀ − P<sub>cu</sub>) – U² hasta U = 0 se obtiene P<sub>m</sub>.<br>Por fase (estrella equivalente): R<sub>Fe</sub> = (U/√3)² / (P<sub>Fe</sub>/3), X<sub>μ</sub> ≈ (U/√3) / (I₀·sen φ₀).',
        cc: 'P<sub>cc</sub> = W₁ + W₂ · cos φ<sub>cc</sub> = P<sub>cc</sub> / (√3·U<sub>cc</sub>·I<sub>cc</sub>)<br>R<sub>cc</sub> = P<sub>cc</sub> / (3·I<sub>cc</sub>²) = R₁ + R′₂ · Z<sub>cc</sub> = (U<sub>cc</sub>/√3) / I<sub>cc</sub> · X<sub>cc</sub> = √(Z<sub>cc</sub>² − R<sub>cc</sub>²) = X₁ + X′₂ (habitualmente X₁ = X′₂).',
        carga: 'P₁ = W₁ + W₂ · Pᵤ = T·n·π/30 · η = Pᵤ / P₁<br>s = (n₁ − n)/n₁ · cos φ = P₁ / (√3·U·I)<br>En montaje Aron: tg φ = √3·(W₁ − W₂)/(W₁ + W₂) (con W1 en L1 y W2 en L2, voltimétricas a L3).'
    };

    Panel.prototype.renderGuide = function (body) {
        var self = this, t = this.st.test;
        body.innerHTML =
            '<p class="lead">' + TESTS[t].long + '</p>' +
            '<h3 class="sec">Comprobaciones del montaje</h3><ul class="checks" id="checks"></ul>' +
            '<h3 class="sec">Procedimiento</h3><ol class="steps">' + STEPS[t].map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' +
            '<details class="theory"><summary>Fundamento y fórmulas</summary><p>' + THEORY[t] + '</p></details>' +
            '<details class="theory"><summary>Esquema de conexión (método de los dos vatímetros)</summary>' + schematic(this.lab.P.netConn) + '</details>' +
            '<div class="guide-actions"><button type="button" class="btn" id="btn-ref">Cablear montaje de referencia</button></div>' +
            '<p class="note">El montaje de referencia te ahorra el cableado, pero lo importante es saber hacerlo: intenta primero conectarlo tú.</p>';
        this.$('#btn-ref').onclick = function () { self.hooks.reference(); };
        this.updateChecks();
    };

    Panel.prototype.checks = function () {
        var lab = this.lab, P = lab.P, rd = lab.readings(), t = this.st.test, out = [];
        var on = lab.on, energized = on && lab.variac > 0.01;
        var want = P.netConn, pl = P.plate;
        var cname = { Y: 'estrella (Y)', D: 'triángulo (Δ)' };
        out.push({
            s: lab.conn === want ? 'ok' : (lab.conn ? 'bad' : 'todo'),
            t: 'Caja de bornes en ' + cname[want] + ': placa ' + pl.Ud + '/' + pl.Uy + ' V y red de 400 V',
            h: lab.conn && lab.conn !== want ? 'Está en ' + cname[lab.conn] + ': cada bobina quedaría a ' + (lab.conn === 'D' ? '400 V (sobretensión)' : '231 V (subtensión)') + '.' : ''
        });
        var lr = linesReachMotor(lab);
        out.push({ s: lr.ok ? 'ok' : (lr.shorted ? 'bad' : 'todo'), t: 'L1, L2 y L3 llegan a U1, V1 y W1 (pasando por los aparatos)', h: lr.shorted ? '¡Dos fases están unidas: cortocircuito!' : '' });
        var aron = 'todo', ah = 'Se comprueba con el motor alimentado.';
        if (energized && Math.abs(rd.Pin) > 5) {
            var sum = rd.w1.P + rd.w2.P;
            aron = Math.abs(sum - rd.Pin) < 0.015 * Math.abs(rd.Pin) + 3 && rd.w1.I > 0.01 && rd.w2.I > 0.01 ? 'ok' : 'bad';
            ah = aron === 'ok' ? '' : 'W1 + W2 = ' + f(sum, 0) + ' W, pero el motor absorbe ' + f(rd.Pin, 0) + ' W. Revisa bobinas y polaridades (*).';
        }
        out.push({ s: aron, t: 'Vatímetros en montaje Aron: W₁ + W₂ = potencia absorbida', h: ah });
        var am = 'todo';
        if (energized && rd.Iline > 0.05) am = rd.lines.some(function (x) { return Math.abs(x - rd.am) < 0.03 * x + 0.005; }) ? 'ok' : 'bad';
        out.push({ s: am, t: 'Amperímetro en serie con una fase', h: am === 'bad' ? 'No mide ninguna corriente de línea.' : '' });
        var vm = 'todo';
        if (energized) vm = Math.abs(rd.vm - rd.Uout) < 0.03 * rd.Uout + 0.5 ? 'ok' : 'bad';
        out.push({ s: vm, t: 'Voltímetro midiendo la tensión entre fases', h: vm === 'bad' ? 'La lectura no corresponde a una tensión de línea.' : '' });
        var ns = pl.ns, In = want === 'Y' ? pl.Iy : pl.Id;
        if (t === 'vacio') {
            out.push({ s: !lab.locked && lab.brake < 0.01 ? 'ok' : 'bad', t: 'Rotor libre y freno a 0 N·m' });
            out.push({ s: rd.n > 0.97 * ns ? 'ok' : 'todo', t: 'Motor girando en vacío cerca de ' + ns + ' min⁻¹' });
        } else if (t === 'cc') {
            out.push({ s: lab.locked ? 'ok' : 'todo', t: 'Rotor bloqueado' });
            var ic = 'todo';
            if (energized && lab.locked) ic = Math.abs(rd.am - In) < 0.03 * In ? 'ok' : (rd.am > 1.1 * In ? 'bad' : 'todo');
            out.push({ s: ic, t: 'Corriente de cortocircuito ≈ In = ' + f(In, 2) + ' A', h: ic === 'bad' ? 'Corriente superior a la nominal: baja la tensión.' : '' });
        } else {
            out.push({ s: !lab.locked ? 'ok' : 'bad', t: 'Rotor libre' });
            out.push({ s: energized && Math.abs(rd.vm - 400) < 6 ? 'ok' : 'todo', t: 'Tensión nominal de la red: 400 V' });
            out.push({ s: lab.brake > 0 && Math.abs(rd.n) > 1 ? 'ok' : 'todo', t: 'Freno aplicando par (Tn ≈ ' + f(pl.Tn, 1) + ' N·m)' });
        }
        return out;
    };

    Panel.prototype.updateChecks = function () {
        var ul = this.$('#checks');
        if (!ul) return;
        var ic = { ok: '✓', bad: '✕', todo: '○' };
        var html = this.checks().map(function (c) {
            return '<li class="' + c.s + '"><span class="ck">' + ic[c.s] + '</span><span>' + c.t + (c.h ? '<small>' + c.h + '</small>' : '') + '</span></li>';
        }).join('');
        if (html !== this.lastChecks) { ul.innerHTML = html; this.lastChecks = html; }
    };

    function schematic(conn) {
        var s = '<svg class="sch" viewBox="0 0 330 220" role="img" aria-label="Esquema del montaje Aron">';
        var Ls = [['L1', 40], ['L2', 100], ['L3', 160]];
        Ls.forEach(function (l) { s += '<text x="8" y="' + (l[1] + 4) + '" class="t">' + l[0] + '</text><line x1="28" y1="' + l[1] + '" x2="250" y2="' + l[1] + '" class="w"/>'; });
        /* A en L1 */
        s += '<rect x="44" y="30" width="20" height="20" fill="var(--surface)" class="w"/><circle cx="54" cy="40" r="10" class="c"/><text x="54" y="44" class="t m">A</text>';
        /* W1 */
        s += '<rect x="90" y="33" width="34" height="14" class="c"/><text x="107" y="27" class="t m">W₁</text><text x="86" y="31" class="t s">*</text>';
        s += '<circle cx="150" cy="70" r="8" class="c"/><text x="140" y="60" class="t s">*</text><path d="M142,40 V62 M150,78 V160" class="w"/><circle cx="142" cy="40" r="2.5" class="n"/><circle cx="150" cy="160" r="2.5" class="n"/>';
        /* W2 */
        s += '<rect x="90" y="93" width="34" height="14" class="c"/><text x="107" y="87" class="t m">W₂</text><text x="86" y="91" class="t s">*</text>';
        s += '<circle cx="195" cy="130" r="8" class="c"/><text x="185" y="120" class="t s">*</text><path d="M187,100 V122 M195,138 V160" class="w"/><circle cx="187" cy="100" r="2.5" class="n"/><circle cx="195" cy="160" r="2.5" class="n"/>';
        /* V */
        s += '<circle cx="228" cy="70" r="10" class="c"/><text x="228" y="74" class="t m">V</text><path d="M228,40 V60 M228,80 V100" class="w"/><circle cx="228" cy="40" r="2.5" class="n"/><circle cx="228" cy="100" r="2.5" class="n"/>';
        /* motor */
        s += '<circle cx="290" cy="100" r="30" class="c"/><text x="290" y="96" class="t m">M</text><text x="290" y="112" class="t m s">3~ ' + (conn === 'Y' ? 'Y' : 'Δ') + '</text>';
        s += '<path d="M250,40 H268 V78 M250,100 H260 M250,160 H268 V122" class="w"/>';
        s += '<text x="10" y="205" class="t s">* borne de polaridad · voltimétricas de W₁ y W₂ a L3</text></svg>';
        return s;
    }

    /* ---------------- Medidas ---------------- */
    Panel.prototype.rows = function (t) { return this.st.meas[t] = this.st.meas[t] || []; };

    Panel.prototype.renderMeas = function (body) {
        var self = this, t = this.st.test, cols = COLS[t], P = this.lab.P, R1 = parseNum(this.st.student.R1);
        var rows = this.rows(t);
        var head = '<tr><th>#</th>' + cols.map(function (k) {
            var F = FIELDS[k], der = ['U', 'I', 'W1', 'W2', 'n', 'T'].indexOf(k) < 0;
            return '<th class="' + (der ? 'der' : '') + '" title="' + F.t + '">' + F.l + (F.u ? '<span>' + F.u + '</span>' : '') + '</th>';
        }).join('') + '<th></th></tr>';
        var bodyRows = rows.map(function (r, i) {
            var d = derive(r, P, R1);
            return '<tr><td class="idx">' + (i + 1) + '</td>' + cols.map(function (k) {
                var der = ['U', 'I', 'W1', 'W2', 'n', 'T'].indexOf(k) < 0;
                return '<td class="' + (der ? 'der' : '') + '">' + f(d[k], FIELDS[k].d) + '</td>';
            }).join('') + '<td><button type="button" class="x" data-del="' + i + '" aria-label="Borrar fila ' + (i + 1) + '">×</button></td></tr>';
        }).join('');
        body.innerHTML =
            '<div class="meas-bar"><button type="button" class="btn btn-rec" id="btn-rec"><span class="dot"></span>Registrar medida</button>' +
            '<span class="note">Tecla <kbd>R</kbd></span></div>' +
            '<div class="live" id="live"></div>' +
            '<div class="table-wrap"><table class="meas"><thead>' + head + '</thead><tbody>' +
            (bodyRows || '<tr><td colspan="' + (cols.length + 2) + '" class="empty">Sin medidas. Ajusta el punto de funcionamiento y pulsa «Registrar medida».</td></tr>') +
            '</tbody></table></div>' +
            '<p class="note">Columnas grises: calculadas a partir de las lecturas.</p>' +
            '<div class="guide-actions"><button type="button" class="btn btn-ghost" id="btn-csv">Exportar CSV</button>' +
            '<button type="button" class="btn btn-ghost" id="btn-clear-meas">Vaciar tabla</button></div>';
        this.$('#btn-rec').onclick = function () { self.record(); };
        this.$('#btn-csv').onclick = function () { self.exportCSV(); };
        this.$('#btn-clear-meas').onclick = function () {
            if (!rows.length || !window.confirm('¿Borrar todas las medidas del ' + TESTS[t].long.toLowerCase() + '?')) return;
            self.st.meas[t] = []; self.hooks.save(); self.render();
        };
        body.querySelectorAll('[data-del]').forEach(function (b) {
            b.onclick = function () { rows.splice(+b.getAttribute('data-del'), 1); self.hooks.save(); self.render(); };
        });
        this.updateLive();
    };

    Panel.prototype.updateLive = function () {
        var el = this.$('#live');
        if (!el || !this.shown) return;
        var s = this.shown;
        el.innerHTML = ['U', 'I', 'W1', 'W2', 'n', 'T'].map(function (k) {
            var F = FIELDS[k];
            return '<span><i>' + F.l + '</i>' + f(s[k], F.d) + ' <small>' + F.u + '</small></span>';
        }).join('');
    };

    Panel.prototype.record = function () {
        var s = this.shown;
        if (!s) return;
        if (!this.lab.on) { this.hooks.toast('La fuente está desconectada: no hay nada que medir.', 'warn'); return; }
        var miss = ['U', 'I', 'W1', 'W2'].filter(function (k) { return !isFinite(s[k]); });
        if (miss.length) { this.hooks.toast('Algún aparato marca OL (fuera de escala). Revisa el montaje.', 'warn'); return; }
        var row = { U: +s.U.toFixed(1), I: +s.I.toFixed(3), W1: +s.W1.toFixed(1), W2: +s.W2.toFixed(1), n: Math.round(s.n), T: +s.T.toFixed(2) };
        this.rows(this.st.test).push(row);
        this.hooks.save();
        this.hooks.toast('Medida ' + this.rows(this.st.test).length + ' registrada (' + TESTS[this.st.test].name.toLowerCase() + ').', 'ok');
        if (this.st.tab === 'medidas' || this.st.tab === 'graficas') this.render();
    };

    Panel.prototype.exportCSV = function () {
        var P = this.lab.P, R1 = parseNum(this.st.student.R1), self = this, lines = [];
        lines.push('VEMLAB;' + P.name + ';' + P.code + ';' + P.plate.Pn + ' W');
        Object.keys(TESTS).forEach(function (t) {
            var rows = self.rows(t);
            if (!rows.length) return;
            lines.push('');
            lines.push(TESTS[t].long);
            lines.push(COLS[t].map(function (k) { return FIELDS[k].l + (FIELDS[k].u ? ' (' + FIELDS[k].u + ')' : ''); }).join(';'));
            rows.forEach(function (r) {
                var d = derive(r, P, R1);
                lines.push(COLS[t].map(function (k) { return isFinite(d[k]) ? String(+d[k].toFixed(FIELDS[k].d + 1)).replace('.', ',') : ''; }).join(';'));
            });
        });
        var blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'vemlab-medidas-' + P.id + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };

    /* ---------------- Gráficas ---------------- */
    Panel.prototype.renderChart = function (body) {
        var self = this, t = this.st.test, P = this.lab.P, R1 = parseNum(this.st.student.R1);
        var ch = this.st.chart[t] = this.st.chart[t] || { p: 0 };
        var pre = PRESETS[t][ch.p] || PRESETS[t][0];
        body.innerHTML = '<div class="chips">' + PRESETS[t].map(function (p, i) {
            return '<button type="button" class="chip' + (p === pre ? ' on' : '') + '" data-p="' + i + '">' + p.t + '</button>';
        }).join('') + '</div><div id="chart"></div>';
        body.querySelectorAll('[data-p]').forEach(function (b) {
            b.onclick = function () { ch.p = +b.getAttribute('data-p'); self.hooks.save(); self.render(); };
        });
        var pts = this.rows(t).map(function (r) { var d = derive(r, P, R1); return [d[pre.x], d[pre.y]]; })
            .filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
        var box = this.$('#chart');
        if (pre.y === 'Pfm' && !isFinite(R1)) { box.innerHTML = '<p class="empty">Para esta gráfica escribe tu R₁ (por fase, estrella equivalente) en la pestaña «Comprobar».</p>'; return; }
        if (pts.length < 2) { box.innerHTML = '<p class="empty">Registra al menos dos medidas en este ensayo para ver la gráfica.</p>'; return; }
        var curve = null, note = '';
        if (pre.model) {
            curve = this.modelCurve();
            note = curve ? '<p class="note">Línea discontinua: curva par–velocidad de <b>tu</b> circuito equivalente a ' + f(curve.U, 0) + ' V (pestaña «Comprobar»). Para ver la curva real completa usa el modo «Par–velocidad» del osciloscopio.</p>' :
                '<p class="note">Completa tus parámetros en «Comprobar» para superponer la curva par–velocidad de tu modelo.</p>';
        }
        box.innerHTML = plot(pts, FIELDS[pre.x], FIELDS[pre.y], pre.fit, curve && curve.pts) + note;
    };

    function niceTicks(a, b, n) {
        if (a === b) { a -= 1; b += 1; }
        var span = b - a, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
        if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
        var t0 = Math.floor(a / step) * step, ticks = [];
        for (var v = t0; v < b + step * 0.999; v += step) ticks.push(+v.toPrecision(10));
        return ticks;
    }
    function tickLbl(v) {
        var a = Math.abs(v);
        if (a >= 1e5) return f(v / 1000, 0) + 'k';
        return f(v, a < 1 && a > 0 ? 2 : (a < 10 && v % 1 ? 1 : 0));
    }

    function plot(pts, FX, FY, fit, curve) {
        var Wd = 360, Ht = 250, L = 52, R = 14, T = 14, B = 40;
        var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        var lr = null;
        if (fit && pts.length >= 2) {
            var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
            pts.forEach(function (p) { sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; });
            var den = n * sxx - sx * sx;
            if (Math.abs(den) > 1e-12) {
                var m = (n * sxy - sx * sy) / den, b = (sy - m * sx) / n, ssr = 0, sst = 0, ym = sy / n;
                pts.forEach(function (p) { ssr += Math.pow(p[1] - (m * p[0] + b), 2); sst += Math.pow(p[1] - ym, 2); });
                lr = { m: m, b: b, r2: sst > 0 ? 1 - ssr / sst : 1 };
                x0 = Math.min(x0, 0); y0 = Math.min(y0, b, 0); y1 = Math.max(y1, b);
            }
        }
        if (curve) { x0 = Math.min(x0, 0); curve.forEach(function (p) { if (p[1] > y1) y1 = p[1]; if (p[0] > x1) x1 = p[0]; }); y0 = Math.min(y0, 0); }
        if (y0 > 0 && y0 < 0.4 * y1) y0 = 0;
        var xt = niceTicks(x0, x1, 5), yt = niceTicks(y0, y1, 5);
        x0 = xt[0]; x1 = xt[xt.length - 1]; y0 = yt[0]; y1 = yt[yt.length - 1];
        function X(v) { return L + (v - x0) / (x1 - x0) * (Wd - L - R); }
        function Y(v) { return Ht - B - (v - y0) / (y1 - y0) * (Ht - T - B); }
        var s = '<svg class="plot" viewBox="0 0 ' + Wd + ' ' + Ht + '" role="img" aria-label="' + FY.l + ' frente a ' + FX.l + '">';
        xt.forEach(function (v) { s += '<line x1="' + X(v) + '" x2="' + X(v) + '" y1="' + T + '" y2="' + (Ht - B) + '" class="grid"/><text x="' + X(v) + '" y="' + (Ht - B + 15) + '" class="tk" text-anchor="middle">' + tickLbl(v) + '</text>'; });
        yt.forEach(function (v) { s += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" class="grid"/><text x="' + (L - 6) + '" y="' + (Y(v) + 4) + '" class="tk" text-anchor="end">' + tickLbl(v) + '</text>'; });
        s += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + (Ht - B) + '" y2="' + (Ht - B) + '" class="axis"/><line x1="' + L + '" x2="' + L + '" y1="' + T + '" y2="' + (Ht - B) + '" class="axis"/>';
        s += '<text x="' + ((L + Wd - R) / 2) + '" y="' + (Ht - 6) + '" class="al" text-anchor="middle">' + FX.l + (FX.u ? ' (' + FX.u + ')' : '') + '</text>';
        s += '<text x="12" y="' + ((T + Ht - B) / 2) + '" class="al" text-anchor="middle" transform="rotate(-90 12 ' + ((T + Ht - B) / 2) + ')">' + FY.l + (FY.u ? ' (' + FY.u + ')' : '') + '</text>';
        if (curve) s += '<polyline points="' + curve.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join(' ') + '" class="fit"/>';
        if (lr) s += '<line x1="' + X(x0) + '" y1="' + Y(lr.m * x0 + lr.b) + '" x2="' + X(x1) + '" y2="' + Y(lr.m * x1 + lr.b) + '" class="fit"/>';
        else {
            var sorted = pts.slice().sort(function (a, b) { return a[0] - b[0]; });
            s += '<polyline points="' + sorted.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ') + '" class="line"/>';
        }
        pts.forEach(function (p) { s += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="4" class="pt"><title>' + FX.l + ' = ' + f(p[0], FX.d) + ' · ' + FY.l + ' = ' + f(p[1], FY.d) + '</title></circle>'; });
        s += '</svg>';
        if (lr) s += '<p class="fit-eq">Recta de regresión: ' + FY.l + ' = ' + fmtSci(lr.m) + '·' + FX.l + ' ' + (lr.b < 0 ? '−' : '+') + ' ' + fmtSci(Math.abs(lr.b)) +
            ' &nbsp;·&nbsp; R² = ' + f(lr.r2, 4) + '<br>Ordenada en el origen: <b>' + fmtSci(lr.b) + ' ' + FY.u + '</b></p>';
        return s;
    }
    function fmtSci(v) {
        var a = Math.abs(v);
        if (a === 0) return '0';
        if (a < 0.01 || a >= 1e5) return v.toExponential(3).replace('.', ',').replace('e', '·10^');
        return f(v, a < 1 ? 5 : a < 100 ? 3 : 1);
    }

    /* Curva par útil – velocidad del modelo del alumno a la tensión media de los ensayos en carga */
    Panel.prototype.modelCurve = function () {
        var S = this.st.student, P = this.lab.P, Q = { f: P.f, p: P.p }, ok = true;
        PARAMS.forEach(function (p) { var v = parseNum(S[p.k]); if (!(v >= 0) || (p.k !== 'Pm' && v <= 0)) ok = false; Q[p.k] = v; });
        var rows = this.rows('carga');
        if (!ok || !rows.length) return null;
        var U = rows.reduce(function (a, r) { return a + r.U; }, 0) / rows.length, ns = 60 * P.f / P.p, pts = [];
        for (var i = 0; i <= 160; i++) {
            var s = Math.pow(i / 160, 2) * 0.999 + 0.001, m = Motor.balanced(Q, U / SQ3, s, true);
            pts.push([ns * (1 - s), m.Tu]);
        }
        return { U: U, pts: pts };
    };

    /* ---------------- Comprobar parámetros ---------------- */
    var PARAMS = [
        { k: 'R1', l: 'R₁', u: 'Ω', h: 'Ensayo en c.c. (polímetro)' },
        { k: 'Rfe', l: 'R<sub>Fe</sub>', u: 'Ω', h: 'Vacío' },
        { k: 'Xmu', l: 'X<sub>μ</sub>', u: 'Ω', h: 'Vacío' },
        { k: 'Pm', l: 'P<sub>m</sub>', u: 'W', h: 'Vacío (total)' },
        { k: 'R2', l: 'R′₂', u: 'Ω', h: 'Cortocircuito' },
        { k: 'X1', l: 'X₁', u: 'Ω', h: 'Cortocircuito' },
        { k: 'X2', l: 'X′₂', u: 'Ω', h: 'Cortocircuito' }
    ];

    function starEq(P, conn) {
        var k = conn === 'D' ? 1 / 3 : 1;
        return { R1: P.R1 * k, Rfe: P.Rfe * k, Xmu: P.Xmu * k, Pm: P.Pm, R2: P.R2 * k, X1: P.X1 * k, X2: P.X2 * k };
    }

    Panel.prototype.renderCheck = function (body) {
        var self = this, S = this.st.student, P = this.lab.P;
        var html = '<p class="lead">Escribe los parámetros que has calculado <b>por fase, en la estrella equivalente</b>. Con la tensión y el par que mediste en cada punto, el simulador predice corriente, potencia y velocidad con tu circuito equivalente y las compara con tus medidas.</p><div class="pgrid">';
        PARAMS.forEach(function (p) {
            html += '<label class="param"><span class="pl">' + p.l + '<small>' + p.h + '</small></span><span class="pi"><input type="text" inputmode="decimal" data-k="' + p.k + '" value="' + esc(S[p.k] || '') + '" autocomplete="off"><span class="u">' + p.u + '</span></span></label>';
        });
        html += '</div><div id="cmp"></div>';
        if (this.prof) {
            var T = starEq(P, P.netConn);
            html += '<details class="theory prof" open><summary>Solución (modo profesor)</summary><table class="meas sol"><tr>' +
                PARAMS.map(function (p) { return '<th>' + p.l + '</th>'; }).join('') + '</tr><tr>' +
                PARAMS.map(function (p) { return '<td>' + f(T[p.k], p.k === 'Rfe' || p.k === 'Pm' ? 0 : 3) + '</td>'; }).join('') +
                '</tr></table><p class="note">Estrella equivalente con la conexión ' + (P.netConn === 'Y' ? 'en estrella' : 'en triángulo') + ' (red de 400 V). Valores del circuito exacto; con los métodos aproximados del laboratorio son normales diferencias de algunos %.</p></details>';
        }
        body.innerHTML = html;
        body.querySelectorAll('input[data-k]').forEach(function (inp) {
            inp.addEventListener('input', function () {
                var v = parseNum(inp.value);
                inp.classList.toggle('bad', inp.value.trim() !== '' && !(v >= 0));
                S[inp.getAttribute('data-k')] = inp.value;
                self.hooks.save();
                self.renderCompare();
            });
        });
        this.renderCompare();
    };

    Panel.prototype.renderCompare = function () {
        var box = this.$('#cmp'), S = this.st.student, P = this.lab.P, self = this;
        if (!box) return;
        var Q = { f: P.f, p: P.p }, ok = true;
        PARAMS.forEach(function (p) { var v = parseNum(S[p.k]); if (!(v >= 0) || (p.k !== 'Pm' && v <= 0)) ok = false; Q[p.k] = v; });
        if (!ok) { box.innerHTML = '<p class="empty">Completa los siete parámetros para comparar.</p>'; return; }
        var ns = 60 * P.f / P.p, worst = 0, n = 0, html = '';
        var conn = this.lab.conn || P.netConn, Un = conn === 'D' ? P.plate.Ud : P.plate.Uy;
        ['vacio', 'cc', 'carga'].forEach(function (t) {
            var rows = self.rows(t);
            if (!rows.length) return;
            var last = t === 'cc' ? '<th>T med.</th><th>T sim.</th>' : '<th>n med.</th><th>n sim.</th>';
            html += '<h3 class="sec">' + TESTS[t].long + '</h3><div class="table-wrap"><table class="meas cmp"><thead><tr><th>U</th><th>I med.</th><th>I sim.</th><th>P med.</th><th>P sim.</th>' + last + '</tr></thead><tbody>';
            var skipped = 0;
            rows.forEach(function (r) {
                /* rotor bloqueado: s = 1; en vacío y en carga el deslizamiento se obtiene del par medido */
                var s = t === 'cc' ? 1 : Motor.slipForTorque(Q, r.U / SQ3, t === 'vacio' ? 0 : r.T, true);
                var m = isFinite(s) ? Motor.balanced(Q, r.U / SQ3, s, true) : { I: NaN, P1: NaN, Tem: NaN, n: NaN };
                var Pm = r.W1 + r.W2;
                /* en vacío el modelo lineal solo vale cerca de la tensión nominal (saturación) */
                var inRange = t !== 'vacio' || Math.abs(r.U - Un) <= 0.05 * Un;
                if (!inRange) skipped++;
                function cell(meas, sim, big) {
                    var d = (sim - meas) / Math.abs(meas) * 100, use = inRange && Math.abs(meas) > big;
                    if (use) { worst = Math.max(worst, Math.abs(d)); n++; }
                    var c = !use ? '' : Math.abs(d) <= 5 ? 'ok' : Math.abs(d) <= 10 ? 'warn' : 'bad';
                    return '<td class="sim ' + c + '">' + f(sim, sim > 100 ? 0 : 2) + (use ? '<small>' + (d > 0 ? '+' : '') + f(d, 1) + ' %</small>' : '') + '</td>';
                }
                html += '<tr' + (inRange ? '' : ' class="off" title="Fuera de ±5 % de la tensión nominal: por la saturación, el circuito equivalente lineal no es aplicable"') + '><td>' + f(r.U, 0) + '</td><td>' + f(r.I, 2) + '</td>' + cell(r.I, m.I, 0.05) + '<td>' + f(Pm, 0) + '</td>' + cell(Pm, m.P1, 5) +
                    (t === 'cc' ? '<td>' + f(r.T, 2) + '</td>' + cell(r.T, m.Tem, 0.2) :
                        '<td>' + f(r.n, 0) + '</td><td class="sim">' + f(m.n, 0) + (isFinite(m.n) ? '<small>' + (m.n >= r.n ? '+' : '') + f(m.n - r.n, 0) + ' min⁻¹</small>' : '') + '</td>') + '</tr>';
            });
            html += '</tbody></table></div>';
            if (skipped) html += '<p class="note">Las filas atenuadas (fuera de ±5 % de ' + Un + ' V) no se comparan: con la máquina saturada o poco excitada el circuito equivalente lineal deja de ser válido.</p>';
        });
        if (!n) { box.innerHTML = '<p class="empty">Registra medidas en los ensayos para poder compararlas con tu modelo.</p>'; return; }
        var c = worst <= 5 ? 'ok' : worst <= 10 ? 'warn' : 'bad';
        box.innerHTML = '<p class="verdict ' + c + '">' + (c === 'ok' ? '✓ Tu circuito equivalente reproduce tus medidas (todas las diferencias ≤ 5 %).' :
            c === 'warn' ? 'Diferencias moderadas (máx. ' + f(worst, 1) + ' %). Revisa los cálculos o elige mejor los puntos de ensayo.' :
                '✕ Alguna diferencia supera el 10 % (máx. ' + f(worst, 1) + ' %). Revisa el parámetro relacionado con esa magnitud.') + '</p>' + html;
    };

    /* Llamado periódicamente por la aplicación */
    Panel.prototype.tick = function (shown) {
        this.shown = shown;
        if (this.st.tab === 'guia') this.updateChecks();
        if (this.st.tab === 'medidas') this.updateLive();
    };

    Panel.TESTS = TESTS;
    Panel.referenceWiring = referenceWiring;
    VEM.Panel = Panel;
})();
