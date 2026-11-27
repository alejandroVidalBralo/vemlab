/* =====================================================================
   VEMLAB · Modo libre: motor de cálculo general
   Cualquier número de componentes (fuentes, instrumentos, cargas,
   reóstatos, máquinas asíncronas, de continua y síncronas,
   transformadores, dinamómetros y panel de sincronización) unidos con
   cables, y máquinas acopladas por el eje.

   Método
   - Topología: bornes unidos por cables (y por los contactos cerrados
     de los interruptores) forman nudos. Los nudos acoplados por algún
     elemento forman «islas» que se resuelven por separado.
   - Superposición por componentes de frecuencia, sobre la misma red:
       · c.c. (f = 0): devanados R–L integrados en el tiempo, f.e.m. de
         las máquinas de continua, fuentes de c.c. con diodo de libre
         circulación;
       · red (50 Hz): fuentes trifásicas;
       · un componente por cada máquina síncrona, a su frecuencia p·n/60.
     Cada elemento se estampa con su impedancia a la frecuencia del
     componente. Los fasores se combinan en el marco de la red con el
     ángulo relativo de cada alternador (coherentes si las frecuencias
     son casi iguales; suma cuadrática si no).
   - Mecánica: las máquinas acopladas forman un único eje (inercias y
     pares sumados); el dinamómetro, si está acoplado, actúa sobre él.
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};
    var Cx = VEM.Cx, C = Cx.C, Circuit = VEM.Circuit, Mech = VEM.Mech, RPM = Math.PI / 30, W50 = 2 * Math.PI * 50;
    var Y_AMM = 100, Y_VOLT = 1e-6, Y_MM = 1e-7, LEAK = 1e-9, H = 0.004, COH = 2.5;
    var ZS = C(0.12, 0.22);

    /* ---------------- Utilidades ---------------- */
    function Zero() { return C(0, 0); }
    function polar(m, deg) { return Cx.polar(m, deg); }
    function mulV(Y, V) { return Y.map(function (row) { var s = C(0, 0); for (var j = 0; j < row.length; j++) s = Cx.add(s, Cx.mul(row[j], V[j])); return s; }); }
    function inv3(Mx) {
        var out = [[], [], []];
        for (var col = 0; col < 3; col++) {
            var Ar = new Float64Array(9), Ai = new Float64Array(9), br = new Float64Array(3), bi = new Float64Array(3);
            for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) { Ar[i * 3 + j] = Mx[i][j].re; Ai[i * 3 + j] = Mx[i][j].im; }
            br[col] = 1;
            var x = VEM.solveComplex(3, Ar, Ai, br, bi);
            for (i = 0; i < 3; i++) out[i][col] = C(x.re[i], x.im[i]);
        }
        return out;
    }
    function diag(vals) { return vals.map(function (v, i) { return vals.map(function (w, j) { return i === j ? v : C(0, 0); }); }); }

    /* Valor eficaz de una lista de fasores {v, f}: coherentes por grupos de frecuencia, cuadrática entre grupos */
    function clusters(list) {
        var g = [];
        list.forEach(function (it) {
            if (!it || !it.f) return;
            for (var i = 0; i < g.length; i++) if (Math.abs(g[i].f - it.f) < COH) { g[i].v = Cx.add(g[i].v, it.v); return; }
            g.push({ v: it.v, f: it.f });
        });
        return g;
    }
    function rms(list) { return Math.sqrt(clusters(list).reduce(function (s, c) { return s + Cx.abs2(c.v); }, 0)); }

    /* ================= Catálogo de componentes ================= */
    var PH = ['U', 'V', 'W'];
    var TR_T = [];
    PH.forEach(function (p) { TR_T.push('t.1' + p + '1', 't.1' + p + '2'); });
    PH.forEach(function (p) { TR_T.push('t.2' + p + '1', 't.2' + p + '2', 't.2' + p + '3', 't.2' + p + '4'); });

    var TYPES = {
        ac3: { name: 'Fuente trifásica regulable', short: 'Fuente 3~', cat: 'Fuentes', terms: ['src.L1', 'src.L2', 'src.L3', 'src.N'], source: true },
        dc2: { name: 'Fuente de c.c. doble', short: 'Fuente c.c.', cat: 'Fuentes', terms: ['ps.A+', 'ps.A-', 'ps.F+', 'ps.F-'], source: true },
        exc: { name: 'Fuente de excitación (c.c.)', short: 'Excitación', cat: 'Fuentes', terms: ['ex.+', 'ex.-'], source: true },
        wm: { name: 'Vatímetro', short: 'Vatímetro', cat: 'Instrumentos', terms: ['w.Ia', 'w.Ib', 'w.Ua', 'w.Ub'] },
        am: { name: 'Amperímetro de c.a. (20 A)', short: 'Amperím. c.a.', cat: 'Instrumentos', terms: ['am.a', 'am.b'] },
        vm: { name: 'Voltímetro de c.a. (600 V)', short: 'Voltím. c.a.', cat: 'Instrumentos', terms: ['vm.a', 'vm.b'] },
        adc: { name: 'Amperímetro de c.c. (30 A)', short: 'Amperím. c.c.', cat: 'Instrumentos', terms: ['ad.a', 'ad.b'] },
        adc3: { name: 'Amperímetro de c.c. (3 A)', short: 'Amperím. c.c. 3 A', cat: 'Instrumentos', terms: ['ad.a', 'ad.b'] },
        vdc: { name: 'Voltímetro de c.c. (600 V)', short: 'Voltím. c.c.', cat: 'Instrumentos', terms: ['vd.a', 'vd.b'] },
        mm: { name: 'Polímetro (óhmetro)', short: 'Polímetro', cat: 'Instrumentos', terms: ['mm.a', 'mm.b'] },
        syncp: { name: 'Panel de sincronización', short: 'Sincronización', cat: 'Instrumentos', terms: ['sy.L1', 'sy.L2', 'sy.L3', 'sy.G1', 'sy.G2', 'sy.G3'] },
        rlc: { name: 'Carga trifásica R–L–C', short: 'Carga R–L–C', cat: 'Cargas', terms: ['ld.L1', 'ld.L2', 'ld.L3', 'ld.N'] },
        rdc: { name: 'Carga resistiva de c.c.', short: 'Carga c.c.', cat: 'Cargas', terms: ['ld.+', 'ld.-'] },
        rh: { name: 'Reóstatos (arranque y campo)', short: 'Reóstatos', cat: 'Cargas', terms: ['ra.1', 'ra.2', 'rf.1', 'rf.2'] },
        im: { name: 'Máquina asíncrona', short: 'Asíncrona', cat: 'Máquinas', terms: ['m.U1', 'm.V1', 'm.W1', 'm.U2', 'm.V2', 'm.W2'], machine: true, catalog: function () { return VEM.Motor.catalog; } },
        dcm: { name: 'Máquina de corriente continua', short: 'Máq. c.c.', cat: 'Máquinas', terms: ['d.A1', 'd.A2', 'd.D1', 'd.D2', 'd.E1', 'd.E2'], machine: true, catalog: function () { return VEM.DC.catalog; } },
        sm: { name: 'Máquina síncrona', short: 'Síncrona', cat: 'Máquinas', terms: ['m.U1', 'm.V1', 'm.W1', 'm.U2', 'm.V2', 'm.W2', 'm.F1', 'm.F2'], machine: true, catalog: function () { return VEM.Sync.catalog; } },
        tr: { name: 'Transformador trifásico', short: 'Transformador', cat: 'Máquinas', terms: TR_T, catalog: function () { return VEM.Trafo.catalog; } },
        dyno: { name: 'Dinamómetro', short: 'Dinamómetro', cat: 'Máquinas', terms: [], machine: true },
        /* ---- aparamenta de maniobra, protección y mando ---- */
        ctl: { name: 'Fuente de mando 230 V ~', short: 'Mando 230 V', cat: 'Fuentes', terms: ['cs.L', 'cs.N'], source: true },
        qm: { name: 'Interruptor magnetotérmico tripolar', short: 'Magnetotérm.', cat: 'Aparamenta', terms: ['q.1', 'q.2', 'q.3', 'q.4', 'q.5', 'q.6'] },
        km: { name: 'Contactor (3 polos + NA 13-14 + NC 21-22)', short: 'Contactor', cat: 'Aparamenta', terms: ['k.1', 'k.2', 'k.3', 'k.4', 'k.5', 'k.6', 'k.13', 'k.14', 'k.21', 'k.22', 'k.A1', 'k.A2'] },
        fr: { name: 'Relé térmico', short: 'Relé térmico', cat: 'Aparamenta', terms: ['f.1', 'f.2', 'f.3', 'f.4', 'f.5', 'f.6', 'f.95', 'f.96', 'f.97', 'f.98'] },
        kt: { name: 'Temporizador a la conexión', short: 'Temporizador', cat: 'Aparamenta', terms: ['kt.A1', 'kt.A2', 'kt.15', 'kt.16', 'kt.18'] },
        pbno: { name: 'Pulsador de marcha (NA)', short: 'Pulsador NA', cat: 'Aparamenta', terms: ['pb.13', 'pb.14'] },
        pbnc: { name: 'Pulsador de paro (NC)', short: 'Pulsador NC', cat: 'Aparamenta', terms: ['pb.11', 'pb.12'] },
        estop: { name: 'Seta de emergencia (NC)', short: 'Seta emerg.', cat: 'Aparamenta', terms: ['pb.11', 'pb.12'] },
        sel: { name: 'Selector 0–1 (NA)', short: 'Selector', cat: 'Aparamenta', terms: ['pb.13', 'pb.14'] },
        lamp: { name: 'Piloto de señalización 230 V', short: 'Piloto', cat: 'Aparamenta', terms: ['h.X1', 'h.X2'], catalog: function () { return LAMPS; } }
    };
    var LAMPS = [{ id: 'G', name: 'verde', c: '#4dff88' }, { id: 'R', name: 'rojo', c: '#ff4040' }, { id: 'Y', name: 'ámbar', c: '#ffc233' }, { id: 'W', name: 'blanco', c: '#f4f4f4' }];
    var G_CONTACT = 100;                       /* contacto cerrado: 10 mΩ */
    var COIL = { U: 230, G: 8 / (230 * 230), pick: 0.8, drop: 0.45 };   /* bobina de contactor 230 V ~, ≈ 8 VA */
    var CTL = { U: 230, Z: C(0.4, 0.3), In: 2 };
    /* Contactos cerrados de cada aparato según su estado */
    function contacts(c) {
        var st = c.st, out = [];
        switch (c.type) {
            case 'km':
                if (st.closed) out.push(['k.1', 'k.2'], ['k.3', 'k.4'], ['k.5', 'k.6'], ['k.13', 'k.14']); else out.push(['k.21', 'k.22']);
                break;
            case 'kt': out.push(st.out ? ['kt.15', 'kt.18'] : ['kt.15', 'kt.16']); break;
            case 'fr':
                out.push(['f.1', 'f.2'], ['f.3', 'f.4'], ['f.5', 'f.6']);
                out.push(st.tripped ? ['f.97', 'f.98'] : ['f.95', 'f.96']);
                break;
            case 'qm': if (st.on) out.push(['q.1', 'q.2'], ['q.3', 'q.4'], ['q.5', 'q.6']); break;
            case 'pbno': case 'sel': if (st.pressed) out.push(['pb.13', 'pb.14']); break;
            case 'pbnc': case 'estop': if (!st.pressed) out.push(['pb.11', 'pb.12']); break;
        }
        return out;
    }

    /* ---------------- Datos de los modelos ---------------- */
    var DCSRC = { A: { p: 'ps.A+', n: 'ps.A-', R: 0.15, Umax: 250, Ith: 25, Imag: 80, name: 'inducido' }, F: { p: 'ps.F+', n: 'ps.F-', R: 1.0, Umax: 250, Ith: 3, Imag: 10, name: 'excitación' } };
    var EXSRC = { p: 'ex.+', n: 'ex.-', R: 1.0, Umax: 250, Ith: 5, Imag: 15, name: 'excitación' };
    var RLC = { U: 400, R: 300, L: 300, C: 300, steps: 10 };
    var RDC = { U: 220, P: 250, steps: 10 };
    var RH = { A: { max: 40, I: 15 }, F: { max: 1000, I: 1.5 } };

    function rlcY(ld, f) {
        var V2 = Math.pow(RLC.U / Math.sqrt(3), 2), G = ld.R * RLC.R / 3 / V2, BL50 = ld.L * RLC.L / 3 / V2, BC50 = ld.C * RLC.C / 3 / V2;
        if (!ld.on) return C(0, 0);
        if (f === 0) return C(G + (BL50 > 0 ? BL50 / 0.05 : 0), 0);          /* bobinas: solo su resistencia */
        var k = f / 50, BL = BL50 / k, yl = BL50 > 0 ? Cx.inv(C(0.05 / BL50, 1 / BL)) : C(0, 0);
        return Cx.add(C(G, BC50 * k), yl);
    }

    /* Máquina asíncrona a la frecuencia f (parámetros referidos a 50 Hz) */
    function imScaled(P, f) {
        var k = f / P.f;
        return { R1: P.R1, X1: P.X1 * k, R2: P.R2, X2: P.X2 * k, Rfe: P.Rfe, Xmu: P.Xmu * k, En: P.En * k, Vwn: P.Vwn * k, f: f, p: P.p, Pm: P.Pm };
    }
    /* Transformador: matriz de las 9 puertas a la frecuencia f */
    function trafoY(P, Esat, f) {
        var k = f / 50, a = [1, P.a, P.a];
        var Yw = [Cx.inv(C(P.R1, P.X1 * k)), Cx.inv(C(P.Rh_ref, P.Xh_ref * k)), Cx.inv(C(P.Rh_ref, P.Xh_ref * k))];
        var g = (1 + 0.12 * Math.pow(Math.max(Esat / (P.U1 * k), 0), 9)) / 1.12;
        var Ym = C(1 / P.Rfe, -g / (P.Xmu * k)), Ym0 = C(P.G0, -P.B0 / k);
        var Ymag = Circuit.mat3(Ym0, Ym, Ym), sumY = Cx.add(Cx.add(Yw[0], Yw[1]), Yw[2]);
        var Mm = inv3(Ymag.map(function (r, i) { return r.map(function (y, j) { return i === j ? Cx.add(y, sumY) : y; }); }));
        var Y = [], j, kk, c, d;
        for (j = 0; j < 3; j++) for (c = 0; c < 3; c++) {
            var rowY = [];
            for (kk = 0; kk < 3; kk++) for (d = 0; d < 3; d++) {
                var v = Cx.scale(Cx.mul(Cx.mul(Yw[j], Yw[kk]), Mm[c][d]), -a[j] * a[kk]);
                if (j === kk && c === d) v = Cx.add(v, Cx.scale(Yw[j], a[j] * a[j]));
                rowY.push(v);
            }
            Y.push(rowY);
        }
        return { Y: Y, M: Mm, Yw: Yw, a: a };
    }
    function trWindings() {
        var out = [];
        for (var j = 0; j < 3; j++) for (var c = 0; c < 3; c++) out.push(VEM.Trafo.windings(c)[j]);
        return out;
    }
    var TRW = null;

    /* ================= Red por islas ================= */
    function MNet(isl) { this.isl = isl; this.nets = {}; this.act = {}; }
    MNet.prototype.net = function (k) {
        var n = this.nets[k];
        if (!n) n = this.nets[k] = new Circuit.Net(this.isl.size[k]);
        return n;
    };
    MNet.prototype.where = function (a, b) {
        var I = this.isl, ka = a >= 0 ? I.of[a] : -1, kb = b >= 0 ? I.of[b] : -1;
        return ka >= 0 ? ka : kb;
    };
    MNet.prototype.adm = function (a, b, y) {
        if (a === undefined || b === undefined) return;
        var k = this.where(a, b); if (k < 0) return;
        var I = this.isl;
        this.net(k).adm(a >= 0 ? I.loc[a] : -1, b >= 0 ? I.loc[b] : -1, y);
    };
    MNet.prototype.inj = function (a, j) {
        if (a === undefined || a < 0 || (j.re === 0 && j.im === 0)) return;
        var k = this.isl.of[a];
        this.net(k).inj(this.isl.loc[a], j); this.act[k] = true;
    };
    MNet.prototype.ports = function (ports, Y) {
        var I = this.isl, k = -1;
        ports.forEach(function (p) { if (k < 0) { if (p[0] >= 0) k = I.of[p[0]]; else if (p[1] >= 0) k = I.of[p[1]]; } });
        if (k < 0) return;
        this.net(k).ports(ports.map(function (p) { return [p[0] >= 0 ? I.loc[p[0]] : -1, p[1] >= 0 ? I.loc[p[1]] : -1]; }), Y);
    };
    MNet.prototype.solve = function () {
        var I = this.isl, sol = {}, self = this;
        Object.keys(this.act).forEach(function (k) { sol[k] = self.nets[k].solve(); });
        return function (node) {
            if (node === undefined || node < 0) return C(0, 0);
            var k = I.of[node], x = sol[k];
            if (!x) return C(0, 0);
            var l = I.loc[node];
            return C(x.re[l], x.im[l]);
        };
    };

    /* ================= Laboratorio libre ================= */
    function FreeLab() {
        this.kind = 'free';
        this.comps = [];                 /* {id, type, model, x, y, st, P} */
        this.cables = []; this.bridges = {};
        this.couplings = [];             /* [{a: idComp, b: idComp}] */
        this.variac = 0; this.trip = null; this.events = []; this.trace = null;
        this.next = 1;
        this.t = 0;
        this.rewire();
    }
    FreeLab.TYPES = TYPES; FreeLab.H = H;
    FreeLab.prototype.emit = function (type, msg) { this.events.push({ type: type, msg: msg }); };

    Object.defineProperty(FreeLab.prototype, 'on', {
        get: function () { return this.comps.some(function (c) { return TYPES[c.type].source && (c.type === 'exc' ? c.st.ex.on : c.st.on); }); },
        set: function () { }
    });
    FreeLab.prototype.byId = function (id) { for (var i = 0; i < this.comps.length; i++) if (this.comps[i].id === id) return this.comps[i]; return null; };

    /* ---------------- Alta de componentes ---------------- */
    FreeLab.prototype.add = function (type, model, x, y, st, id) {
        var T = TYPES[type];
        if (!T) return null;
        var c = { id: id || ('c' + this.next++), type: type, model: model || null, x: x || 0, y: y || 0, st: {} };
        var n = parseInt(String(c.id).replace(/\D/g, ''), 10);
        if (n >= this.next) this.next = n + 1;
        this.initComp(c, st || {});
        this.comps.push(c);
        this.rewire();
        return c;
    };
    FreeLab.prototype.remove = function (id) {
        var c = this.byId(id); if (!c) return;
        var pre = id + ':';
        this.comps = this.comps.filter(function (q) { return q.id !== id; });
        this.cables = this.cables.filter(function (k) { return k.a.indexOf(pre) !== 0 && k.b.indexOf(pre) !== 0; });
        this.couplings = this.couplings.filter(function (k) { return k.a !== id && k.b !== id; });
        this.rewire();
    };

    function modelOf(type, id) {
        var cat = TYPES[type].catalog ? TYPES[type].catalog() : null;
        if (!cat) return null;
        return cat.filter(function (m) { return m.id === id; })[0] || cat[0];
    }

    FreeLab.prototype.initComp = function (c, s) {
        var st = c.st, t = c.type;
        function num(v, d, lo, hi) { v = +v; if (!isFinite(v)) v = d; return Math.max(lo, Math.min(hi, v)); }
        switch (t) {
            case 'ac3': st.on = false; st.variac = num(s.variac, 0, 0, 1); st.thSrc = 0; st.trip = null; break;
            case 'dc2':
                st.on = false; st.out = { A: !!(s.out && s.out.A), F: !!(s.out && s.out.F) };
                st.U = { A: num(s.U && s.U.A, 0, 0, 250), F: num(s.U && s.U.F, 0, 0, 250) };
                st.diodes = { A: false, F: false }; st.thSrc = { A: 0, F: 0 }; st.trip = null; break;
            case 'exc': st.on = false; st.ex = { U: num(s.ex && s.ex.U, 0, 0, 250), on: !!(s.ex && s.ex.on) }; st.diode = false; st.th = 0; st.trip = null; break;
            case 'rlc': st.load = { R: num(s.load && s.load.R, 0, 0, 10), L: num(s.load && s.load.L, 0, 0, 10), C: num(s.load && s.load.C, 0, 0, 10), on: !!(s.load && s.load.on) }; break;
            case 'rdc': st.load = { n: num(s.load && s.load.n, 0, 0, 10), on: !!(s.load && s.load.on) }; break;
            case 'rh': st.rh = { A: num(s.rh && s.rh.A, RH.A.max, 0, RH.A.max), F: num(s.rh && s.rh.F, 0, 0, RH.F.max) }; break;
            case 'syncp': st.q2 = false; st.lampMode = s.lampMode === 'rot' ? 'rot' : 'dark'; break;
            case 'im': c.model = modelOf(t, c.model).id; c.P = VEM.Motor.prepare(modelOf(t, c.model)); st.Esat = 0; st.th = 0; break;
            case 'tr': c.model = modelOf(t, c.model).id; c.P = VEM.Trafo.prepare(modelOf(t, c.model)); st.Esat = 0; st.th = 0; break;
            case 'dcm': c.model = modelOf(t, c.model).id; c.P = VEM.DC.prepare(modelOf(t, c.model)); st.i = { a: 0, e: 0, d: 0 }; st.sigma = 1; st.th = 0; break;
            case 'sm': c.model = modelOf(t, c.model).id; c.P = VEM.Sync.prepare(modelOf(t, c.model)); st.If = 0; st.sigma = 1; st.theta = 0; st.th = 0; break;
            case 'dyno':
                st.dyno = new VEM.Dyno(s.dyno || {});
                st.dyno.setTmax(+s.Tmax || 40); st.dyno.nmax = 3600; st.dyno.J = 0.02;
                if (s.dyno) { st.dyno.Tset = num(s.dyno.Tset, 0, -st.dyno.Tmax, st.dyno.Tmax); st.dyno.nset = num(s.dyno.nset, 0, 0, 3600); }
                break;
        }
        switch (t) {
            case 'ctl': st.on = false; st.trip = null; st.th = 0; break;
            case 'qm': st.on = !!s.on; st.In = [2, 4, 6, 10, 16].indexOf(+s.In) >= 0 ? +s.In : 10; st.th = 0; break;
            case 'km': st.closed = false; st.tc = 0; st.to = 0; break;
            case 'kt': st.T = num(s.T, 5, 0.5, 30); st.t = 0; st.out = false; break;
            case 'fr': st.Ir = num(s.Ir, 8, 1, 16); st.th = 0; st.tripped = false; break;
            case 'pbno': case 'pbnc': st.pressed = false; break;
            case 'estop': case 'sel': st.pressed = !!s.pressed; break;
            case 'lamp': c.model = (LAMPS.filter(function (l) { return l.id === c.model; })[0] || LAMPS[0]).id; st.b = 0; break;
        }
        if (TYPES[t].machine) st.w = 0;
    };
    /* Estado persistente de un componente */
    FreeLab.prototype.persistComp = function (c) {
        var st = c.st, o = { id: c.id, type: c.type, model: c.model, x: Math.round(c.x), y: Math.round(c.y), st: {} };
        switch (c.type) {
            case 'ac3': o.st.variac = st.variac; break;
            case 'dc2': o.st.U = st.U; o.st.out = st.out; break;
            case 'exc': o.st.ex = st.ex; break;
            case 'rlc': case 'rdc': o.st.load = st.load; break;
            case 'rh': o.st.rh = st.rh; break;
            case 'syncp': o.st.lampMode = st.lampMode; break;
            case 'dyno': o.st.dyno = st.dyno.state(); o.st.Tmax = st.dyno.Tmax; break;
            case 'qm': o.st.In = st.In; break;
            case 'kt': o.st.T = st.T; break;
            case 'fr': o.st.Ir = st.Ir; break;
            case 'estop': case 'sel': o.st.pressed = st.pressed; break;
        }
        return o;
    };
    FreeLab.prototype.persist = function () {
        var self = this;
        return { comps: this.comps.map(function (c) { return self.persistComp(c); }), cables: this.cables, couplings: this.couplings };
    };
    FreeLab.prototype.load = function (o) {
        var self = this;
        this.comps = []; this.cables = []; this.couplings = []; this.next = 1;
        (o.comps || []).forEach(function (c) { if (TYPES[c.type]) self.add(c.type, c.model, c.x, c.y, c.st || {}, c.id); });
        var T = this.terminalSet();
        this.cables = (o.cables || []).filter(function (k) { return T[k.a] && T[k.b]; }).map(function (k) { return { a: k.a, b: k.b, color: k.color || 'red' }; });
        this.couplings = (o.couplings || []).filter(function (k) { return self.byId(k.a) && self.byId(k.b) && k.a !== k.b; });
        this.rewire();
    };

    /* ---------------- Bornes y topología ---------------- */
    FreeLab.prototype.terminalSet = function () {
        var T = {};
        this.comps.forEach(function (c) { TYPES[c.type].terms.forEach(function (t) { T[c.id + ':' + t] = true; }); });
        return T;
    };
    Object.defineProperty(FreeLab.prototype, 'terminals', { get: function () { return Object.keys(this.terminalSet()); } });

    FreeLab.prototype.rewire = function () {
        var terms = ['GND'], defs = {}, br = {};
        this.comps.forEach(function (c) {
            TYPES[c.type].terms.forEach(function (t) { terms.push(c.id + ':' + t); });
            /* el neutro de cada fuente trifásica es la tierra común de la red */
            if (c.type === 'ac3') { defs[c.id + 'N'] = [c.id + ':src.N', 'GND']; br[c.id + 'N'] = 1; }
            if (c.type === 'ctl') { defs[c.id + 'N'] = [c.id + ':cs.N', 'GND']; br[c.id + 'N'] = 1; }
            if (c.type === 'syncp' && c.st.q2) [1, 2, 3].forEach(function (i) { defs[c.id + 'Q' + i] = [c.id + ':sy.L' + i, c.id + ':sy.G' + i]; br[c.id + 'Q' + i] = 1; });
        });
        this.topo = Circuit.topology(this.cables, br, terms, defs, 'GND');
        this.islands();
        this.shafts();
    };
    /* nudo de un borne local de un componente */
    FreeLab.prototype.N = function (c, t) { return this.topo.node[c.id + ':' + t]; };

    /* Grupos de bornes acoplados por elementos de cada componente (para formar las islas) */
    function groups(c) {
        switch (c.type) {
            case 'ac3': return [['src.L1', 'src.L2', 'src.L3', 'src.N']];
            case 'dc2': return [['ps.A+', 'ps.A-'], ['ps.F+', 'ps.F-']];
            case 'exc': return [['ex.+', 'ex.-']];
            case 'wm': return [['w.Ia', 'w.Ib'], ['w.Ua', 'w.Ub']];
            case 'am': return [['am.a', 'am.b']];
            case 'vm': return [['vm.a', 'vm.b']];
            case 'adc': case 'adc3': return [['ad.a', 'ad.b']];
            case 'vdc': return [['vd.a', 'vd.b']];
            case 'mm': return [['mm.a', 'mm.b']];
            case 'rlc': return [['ld.L1', 'ld.L2', 'ld.L3', 'ld.N']];
            case 'rdc': return [['ld.+', 'ld.-']];
            case 'rh': return [['ra.1', 'ra.2'], ['rf.1', 'rf.2']];
            case 'im': return [TYPES.im.terms];
            case 'tr': return [TR_T];
            case 'dcm': return [['d.A1', 'd.A2'], ['d.D1', 'd.D2'], ['d.E1', 'd.E2']];
            case 'sm': return [['m.U1', 'm.V1', 'm.W1', 'm.U2', 'm.V2', 'm.W2'], ['m.F1', 'm.F2']];
            case 'ctl': return [['cs.L', 'cs.N']];
            case 'qm': return [['q.1', 'q.2'], ['q.3', 'q.4'], ['q.5', 'q.6']];
            case 'km': return [['k.1', 'k.2'], ['k.3', 'k.4'], ['k.5', 'k.6'], ['k.13', 'k.14'], ['k.21', 'k.22'], ['k.A1', 'k.A2']];
            case 'fr': return [['f.1', 'f.2'], ['f.3', 'f.4'], ['f.5', 'f.6'], ['f.95', 'f.96'], ['f.97', 'f.98']];
            case 'kt': return [['kt.A1', 'kt.A2'], ['kt.15', 'kt.16', 'kt.18']];
            case 'pbno': case 'sel': return [['pb.13', 'pb.14']];
            case 'pbnc': case 'estop': return [['pb.11', 'pb.12']];
            case 'lamp': return [['h.X1', 'h.X2']];
        }
        return [];
    }
    FreeLab.prototype.islands = function () {
        var n = this.topo.n, par = new Int32Array(n + 1), self = this, i;
        for (i = 0; i <= n; i++) par[i] = i;
        function f(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
        function idx(node) { return node < 0 ? n : node; }      /* tierra = n */
        this.comps.forEach(function (c) {
            groups(c).forEach(function (g) {
                var a = null;
                g.forEach(function (t) {
                    var nd = self.N(c, t); if (nd === undefined) return;
                    var b = f(idx(nd));
                    if (a === null) a = b; else if (a !== b) { par[b] = a; }
                });
            });
        });
        var of = new Int32Array(n), loc = new Int32Array(n), size = {}, map = {}, k = 0, g = f(n);
        for (i = 0; i < n; i++) {
            var r = f(i);
            if (map[r] === undefined) { map[r] = k; size[k] = 0; k++; }
            of[i] = map[r]; loc[i] = size[of[i]]++;
        }
        this.isl = { of: of, loc: loc, size: size, count: k, ground: map[g] };
    };

    /* Ejes: grupos de máquinas acopladas */
    FreeLab.prototype.shafts = function () {
        var par = {}, self = this;
        this.comps.forEach(function (c) { if (TYPES[c.type].machine) par[c.id] = c.id; });
        function f(x) { while (par[x] !== x) x = par[x] = par[par[x]]; return x; }
        this.couplings.forEach(function (k) { if (par[k.a] && par[k.b]) { var a = f(k.a), b = f(k.b); if (a !== b) par[b] = a; } });
        var groupsM = {};
        Object.keys(par).forEach(function (id) { var r = f(id); (groupsM[r] = groupsM[r] || []).push(self.byId(id)); });
        var old = this.shaftList || [];
        this.shaftList = Object.keys(groupsM).map(function (r) {
            var cs = groupsM[r], w = 0, cnt = 0;
            cs.forEach(function (c) { w += c.st.w || 0; cnt++; });
            return { comps: cs, w: cnt ? w / cnt : 0 };
        });
        this.shaftList.forEach(function (s) { s.comps.forEach(function (c) { c.st.w = s.w; c.shaft = s; }); });
        void old;
    };
    FreeLab.prototype.shaftOf = function (c) { return c.shaft; };

    /* ---------------- Fuentes ---------------- */
    FreeLab.prototype.switchOff = function () { this.comps.forEach(function (c) { if (TYPES[c.type].source) { c.st.on = false; if (c.type === 'exc') c.st.ex.on = false; } }); };
    FreeLab.prototype.compSwitch = function (c, on) {
        if (on) {
            var hot = this.comps.filter(function (q) { return q.st.th > 100; })[0];
            if (hot) { this.emit('error', 'La protección térmica de ' + this.label(hot) + ' sigue activada. Espera a que se enfríen los devanados.'); return false; }
            c.st.on = true; c.st.trip = null; this.trip = null;
        } else c.st.on = false;
        return true;
    };
    FreeLab.prototype.label = function (c) { return TYPES[c.type].short + ' ' + c.id.replace('c', '#'); };
    FreeLab.prototype.tripAll = function (msg) {
        this.switchOff();
        this.trip = msg;
        this.comps.forEach(function (c) {
            if (c.type === 'syncp' && c.st.q2) c.st.q2 = false;
            if (c.type === 'dyno') { var d = c.st.dyno; if (d.mode === 'n' || d.Tset < 0) { d.setMode('T', c.st.w); d.Tset = Math.max(0, d.Tset); } }
        });
        this.rewire();
        this.emit('trip', msg); this.emit('dyno', 'T');
    };

    /* ================= Componentes de frecuencia ================= */
    FreeLab.prototype.components = function () {
        var K = [{ id: 'dc', f: 0, rot: C(1, 0) }];
        if (this.comps.some(function (c) { return (c.type === 'ac3' && c.st.on && c.st.variac > 0) || (c.type === 'ctl' && c.st.on); })) K.push({ id: 'grid', f: 50, rot: C(1, 0) });
        var self = this;
        this.comps.forEach(function (c) {
            if (c.type !== 'sm') return;
            var e = self.smEmf(c);
            c.emf = e;
            if (e.f > 0.5 && e.E > 0.05) K.push({ id: c.id, f: e.f, owner: c, rot: polar(1, c.st.theta * 180 / Math.PI) });
        });
        return K;
    };
    FreeLab.prototype.smEmf = function (c) {
        var P = c.P, st = c.st, x = st.If / P.If0;
        if (x > 0.25) st.sigma = 1; else if (x < -0.25) st.sigma = -1;
        return { E: P.Vwn * VEM.Sync.gS(Math.abs(x + 0.02 * st.sigma)) * Math.abs(st.w) / P.wn, f: P.p * Math.abs(st.w) / (2 * Math.PI), sg: st.w < 0 ? -1 : 1 };
    };
    FreeLab.prototype.dcKphi = function (c) {
        var P = c.P, i = c.st.i, u = (i.e + P.kSer * i.d) / P.Ifn, ia = i.a / P.In;
        if (u > 0.25) c.st.sigma = 1; else if (u < -0.25) c.st.sigma = -1;
        return P.kPhi * VEM.DC.gMag(u * (1 - 0.04 * Math.min(4, ia * ia)) + 0.035 * c.st.sigma);
    };

    /* Estampa todos los componentes para el componente de frecuencia K */
    FreeLab.prototype.stamp = function (K, mode) {
        var self = this, net = new MNet(this.isl), f = K.f, dc = f === 0, k = f / 50;
        function N(c, t) { return self.N(c, t); }
        this.comps.forEach(function (c) {
            var st = c.st, P = c.P;
            /* contactos cerrados de la aparamenta (en todos los componentes de frecuencia y en el óhmetro) */
            contacts(c).forEach(function (q) { net.adm(N(c, q[0]), N(c, q[1]), C(G_CONTACT)); });
            switch (c.type) {
                case 'ctl': {
                    if (!st.on) break;
                    var Yc = dc ? C(1 / CTL.Z.re) : Cx.inv(C(CTL.Z.re, CTL.Z.im * k));
                    net.adm(N(c, 'cs.L'), N(c, 'cs.N'), Yc);
                    if (K.id === 'grid') net.inj(N(c, 'cs.L'), Cx.mul(C(CTL.U), Yc));
                    break;
                }
                case 'km': net.adm(N(c, 'k.A1'), N(c, 'k.A2'), C(COIL.G)); break;
                case 'kt': net.adm(N(c, 'kt.A1'), N(c, 'kt.A2'), C(2 / (230 * 230))); break;
                case 'lamp': net.adm(N(c, 'h.X1'), N(c, 'h.X2'), C(2.5 / (230 * 230))); break;
                case 'ac3': {
                    if (!st.on) break;
                    var Y = dc ? C(1 / ZS.re) : Cx.inv(C(ZS.re, ZS.im * k)), Eph = st.variac * 440 / Math.sqrt(3);
                    ['src.L1', 'src.L2', 'src.L3'].forEach(function (t, i) {
                        net.adm(N(c, t), N(c, 'src.N'), Y);
                        if (K.id === 'grid') net.inj(N(c, t), Cx.mul(polar(Eph, -120 * i), Y));
                    });
                    break;
                }
                case 'dc2':
                    ['A', 'F'].forEach(function (q) {
                        var s = DCSRC[q], p = N(c, s.p), n = N(c, s.n), live = st.on && st.out[q];
                        if (live) { net.adm(p, n, C(1 / s.R)); if (dc && mode !== 'ohm') { net.inj(p, C(st.U[q] / s.R)); net.inj(n, C(-st.U[q] / s.R)); } }
                        if (dc && mode !== 'ohm') net.adm(p, n, C(st.diodes[q] ? 200 : 1e-7));
                    });
                    break;
                case 'exc': {
                    var p = N(c, 'ex.+'), n = N(c, 'ex.-'), live = st.ex.on;
                    if (live) { net.adm(p, n, C(1 / EXSRC.R)); if (dc && mode !== 'ohm') { net.inj(p, C(st.ex.U / EXSRC.R)); net.inj(n, C(-st.ex.U / EXSRC.R)); } }
                    if (dc && mode !== 'ohm') net.adm(p, n, C(st.diode ? 200 : 1e-7));
                    break;
                }
                case 'wm': net.adm(N(c, 'w.Ia'), N(c, 'w.Ib'), C(Y_AMM)); net.adm(N(c, 'w.Ua'), N(c, 'w.Ub'), C(Y_VOLT)); break;
                case 'am': net.adm(N(c, 'am.a'), N(c, 'am.b'), C(Y_AMM)); break;
                case 'vm': net.adm(N(c, 'vm.a'), N(c, 'vm.b'), C(Y_VOLT)); break;
                case 'adc': case 'adc3': net.adm(N(c, 'ad.a'), N(c, 'ad.b'), C(Y_AMM)); break;
                case 'vdc': net.adm(N(c, 'vd.a'), N(c, 'vd.b'), C(Y_VOLT)); break;
                case 'mm': if (mode !== 'ohm') net.adm(N(c, 'mm.a'), N(c, 'mm.b'), C(Y_MM)); break;
                case 'rlc': { var yl = rlcY(st.load, f); if (yl.re || yl.im) ['ld.L1', 'ld.L2', 'ld.L3'].forEach(function (t) { net.adm(N(c, t), N(c, 'ld.N'), yl); }); break; }
                case 'rdc': if (st.load.on && st.load.n > 0) net.adm(N(c, 'ld.+'), N(c, 'ld.-'), C(st.load.n * RDC.P / (RDC.U * RDC.U))); break;
                case 'rh':
                    net.adm(N(c, 'ra.1'), N(c, 'ra.2'), C(1 / Math.max(0.01, st.rh.A)));
                    net.adm(N(c, 'rf.1'), N(c, 'rf.2'), C(1 / Math.max(0.05, st.rh.F)));
                    break;
                case 'im': {
                    var ports = [['m.U1', 'm.U2'], ['m.V1', 'm.V2'], ['m.W1', 'm.W2']].map(function (q) { return [N(c, q[0]), N(c, q[1])]; });
                    if (dc) { net.ports(ports, diag([C(1 / P.R1), C(1 / P.R1), C(1 / P.R1)])); break; }
                    var Ps = imScaled(P, f), ws1 = 2 * Math.PI * f / P.p, s = 1 - st.w / ws1;
                    if (Math.abs(s) < 1e-7) s = 1e-7;
                    var Ym = VEM.Motor.magY(Ps, st.Esat * 1);
                    var Yp = Cx.inv(VEM.Motor.seqZ(Ps, s, Ym)), Yn = Cx.inv(VEM.Motor.seqZ(Ps, 2 - s, Ym)), Y0 = Cx.inv(C(Ps.R1, Ps.X1));
                    c.Yk = c.Yk || {}; c.Yk[K.id] = { Y: Circuit.mat3(Y0, Yp, Yn), Yp: Yp, Yn: Yn, s: s, Ps: Ps };
                    net.ports(ports, c.Yk[K.id].Y);
                    break;
                }
                case 'tr': {
                    TRW = TRW || trWindings();
                    var tp = TRW.map(function (w) { return [N(c, w[0]), N(c, w[1])]; });
                    if (dc) { net.ports(tp, diag(TRW.map(function (w, i) { return C(1 / (i < 3 ? P.R1 : P.Rh)); }))); break; }
                    var pm = trafoY(P, st.Esat * 1, f);
                    c.Yk = c.Yk || {}; c.Yk[K.id] = pm;
                    net.ports(tp, pm.Y);
                    break;
                }
                case 'dcm': {
                    var br = [['d.A1', 'd.A2', P.Ra, P.La, 'a'], ['d.E1', 'd.E2', P.Rsh, P.Lsh, 'e'], ['d.D1', 'd.D2', P.Rs, P.Ls, 'd']];
                    c.br = c.br || {};
                    br.forEach(function (b) {
                        var a = N(c, b[0]), z = N(c, b[1]);
                        if (mode === 'ohm') { net.adm(a, z, C(1 / b[2])); return; }
                        if (!dc) { net.adm(a, z, Cx.inv(C(b[2], 2 * Math.PI * f * b[3]))); return; }
                        var Lh = b[3] / H, G = 1 / (b[2] + Lh), e = b[4] === 'a' ? c.kphi * st.w : 0, J = G * (Lh * st.i[b[4]] - e);
                        net.adm(a, z, C(G)); net.inj(a, C(-J)); net.inj(z, C(J));
                        c.br[b[4]] = { G: G, J: J, a: a, z: z };
                    });
                    break;
                }
                case 'sm': {
                    var sp = [['m.U1', 'm.U2'], ['m.V1', 'm.V2'], ['m.W1', 'm.W2']].map(function (q) { return [N(c, q[0]), N(c, q[1])]; });
                    var f1 = N(c, 'm.F1'), f2 = N(c, 'm.F2');
                    if (dc) {
                        net.ports(sp, diag([C(1 / P.Ra), C(1 / P.Ra), C(1 / P.Ra)]));
                        if (mode === 'ohm') { net.adm(f1, f2, C(1 / P.Rf)); break; }
                        var LhF = P.Lf / H, GF = 1 / (P.Rf + LhF), JF = GF * LhF * st.If;
                        net.adm(f1, f2, C(GF)); net.inj(f1, C(-JF)); net.inj(f2, C(JF));
                        c.fb = { G: GF, J: JF, a: f1, z: f2 };
                        break;
                    }
                    var kk2 = Math.max(f, 0.5) / P.f;
                    var Ys = Circuit.mat3(Cx.inv(C(P.Ra, P.X0 * kk2)), Cx.inv(C(P.Ra, P.Xs * kk2)), Cx.inv(C(P.Ra, P.X2 * kk2)));
                    net.ports(sp, Ys);
                    var Ev = [C(0), C(0), C(0)];
                    if (K.owner === c) {
                        var e2 = c.emf;
                        Ev = [polar(e2.E, 0), polar(e2.E, -120 * e2.sg), polar(e2.E, 120 * e2.sg)];
                        var Jv = mulV(Ys, Ev);
                        sp.forEach(function (q, i) { net.inj(q[0], Jv[i]); net.inj(q[1], Cx.scale(Jv[i], -1)); });
                    }
                    c.Yk = c.Yk || {}; c.Yk[K.id] = { Y: Ys, Ev: Ev };
                    break;
                }
            }
        });
        if (mode === 'ohm') return net;
        return net;
    };

    /* Resuelve todos los componentes de frecuencia */
    FreeLab.prototype.solveAll = function () {
        var K = this.components(), self = this, sols = {};
        /* c.c. con iteración de los diodos de libre circulación */
        for (var it = 0; it < 4; it++) {
            var V = this.stamp(K[0]).solve(), ch = false;
            this.comps.forEach(function (c) {
                function chk(p, n, d) { var u = V(self.N(c, p)).re - V(self.N(c, n)).re; return d ? u < 0.05 : u < -0.7; }
                if (c.type === 'dc2') ['A', 'F'].forEach(function (q) { var nd = chk(DCSRC[q].p, DCSRC[q].n, c.st.diodes[q]); if (nd !== c.st.diodes[q]) { c.st.diodes[q] = nd; ch = true; } });
                if (c.type === 'exc') { var nd = chk('ex.+', 'ex.-', c.st.diode); if (nd !== c.st.diode) { c.st.diode = nd; ch = true; } }
            });
            sols.dc = V;
            if (!ch) break;
        }
        for (var i = 1; i < K.length; i++) sols[K[i].id] = this.stamp(K[i]).solve();
        return { K: K, V: sols };
    };

    /* ================= Paso de simulación ================= */
    FreeLab.prototype.step = function (dt) {
        dt = Math.min(dt, 0.1);
        var n = Math.max(1, Math.ceil(dt / H)), self = this;
        for (var s = 0; s < n; s++) {
            this.t += H;
            this.comps.forEach(function (c) { if (c.type === 'dcm') c.kphi = self.dcKphi(c); });
            var S = this.solveAll();
            this.S = S;
            var trip = this.post(S);
            this.mech(S);
            if (trip) { this.tripAll(trip); }
        }
        return this.S;
    };

    /* Tensión de un borne a otro en un componente de frecuencia (en el marco de la red) */
    FreeLab.prototype.vk = function (S, Kk, a, b) {
        var V = S.V[Kk.id], va = V(a), vb = b === undefined ? C(0) : V(b);
        return Cx.mul(Cx.sub(va, vb), Kk.rot);
    };
    /* Lista {v, f} de una tensión entre nudos en todos los componentes de alterna */
    FreeLab.prototype.acList = function (S, a, b, scale) {
        var self = this;
        return S.K.slice(1).map(function (Kk) { return { v: Cx.scale(self.vk(S, Kk, a, b), scale || 1), f: Kk.f }; });
    };

    /* Corrientes, pares, saturación y protecciones tras resolver */
    FreeLab.prototype.post = function (S) {
        var self = this, trip = null, K = S.K;
        /* tensión eficaz total (alterna + continua) entre dos bornes y corriente por un contacto cerrado */
        function vtot(c, a, b) {
            var na = self.N(c, a), nb = self.N(c, b), dcv = S.V.dc(na).re - S.V.dc(nb).re;
            return Math.sqrt(Math.pow(rms(self.acList(S, na, nb)), 2) + dcv * dcv);
        }
        function itot(c, a, b) { return vtot(c, a, b) * G_CONTACT; }
        this.comps.forEach(function (c) {
            var st = c.st, P = c.P;
            function N(t) { return self.N(c, t); }
            switch (c.type) {
                case 'ctl': {
                    if (!st.on) { st.I = 0; st.th *= Math.exp(-H / 30); break; }
                    var Vl = S.V.grid ? S.V.grid(N('cs.L')) : C(0), Yc = Cx.inv(CTL.Z);
                    st.I = Math.sqrt(Cx.abs2(Cx.mul(Cx.sub(C(CTL.U), Vl), Yc)) + Math.pow(S.V.dc(N('cs.L')).re / CTL.Z.re, 2));
                    if (st.I > 10 * CTL.In) { st.on = false; self.trip = 'Disparo del magnetotérmico de ' + self.label(c) + ': cortocircuito en el circuito de mando (' + Math.round(st.I) + ' A).'; self.emit('trip', self.trip); break; }
                    var xc = st.I / CTL.In;
                    if (xc > 1.05) st.th += (xc * xc - 1) * H; else st.th *= Math.exp(-H / 30);
                    if (st.th > 30) { st.th = 0; st.on = false; self.trip = 'Disparo térmico de ' + self.label(c) + ': el circuito de mando consume más de ' + CTL.In + ' A.'; self.emit('trip', self.trip); }
                    break;
                }
                case 'km': {
                    var Vk = st.Vc = vtot(c, 'k.A1', 'k.A2');
                    if (!st.closed) { st.to = 0; if (Vk > COIL.pick * COIL.U) { st.tc += H; if (st.tc >= 0.02) { st.closed = true; st.tc = 0; } } else st.tc = 0; }
                    else { st.tc = 0; if (Vk < COIL.drop * COIL.U) { st.to += H; if (st.to >= 0.012) { st.closed = false; st.to = 0; } } else st.to = 0; }
                    break;
                }
                case 'kt': {
                    var Vt2 = vtot(c, 'kt.A1', 'kt.A2');
                    if (Vt2 > 0.7 * 230) { st.t += H; st.out = st.t >= st.T; } else { st.t = 0; st.out = false; }
                    break;
                }
                case 'lamp': st.b = vtot(c, 'h.X1', 'h.X2') / 230; break;
                case 'fr': {
                    var If = Math.max(itot(c, 'f.1', 'f.2'), itot(c, 'f.3', 'f.4'), itot(c, 'f.5', 'f.6'));
                    st.I = If;
                    var xr = If / st.Ir;
                    if (xr > 1.05) st.th += (xr * xr - 1) * H; else st.th *= Math.exp(-H / 90);
                    if (!st.tripped && st.th > 150) { st.tripped = true; self.emit('warn', 'Ha disparado el ' + self.label(c) + ': ' + VEM.fmtN(If, 1) + ' A con el ajuste en ' + VEM.fmtN(st.Ir, 1) + ' A. Abre su contacto 95-96 y cierra el 97-98.'); }
                    break;
                }
                case 'qm': {
                    if (!st.on) { st.I = 0; st.th *= Math.exp(-H / 30); break; }
                    var Iq = st.I = Math.max(itot(c, 'q.1', 'q.2'), itot(c, 'q.3', 'q.4'), itot(c, 'q.5', 'q.6'));
                    if (Iq > 8 * st.In) { st.on = false; st.th = 0; self.emit('trip', 'Disparo magnético de ' + self.label(c) + ' (C' + st.In + '): ' + Math.round(Iq) + ' A.'); break; }
                    var xq = Iq / st.In;
                    if (xq > 1.13) st.th += (xq * xq - 1) * H; else st.th *= Math.exp(-H / 60);
                    if (st.th > 60) { st.on = false; st.th = 0; self.emit('trip', 'Disparo térmico de ' + self.label(c) + ' (C' + st.In + '): sobrecarga mantenida de ' + VEM.fmtN(Iq, 1) + ' A.'); }
                    break;
                }
                case 'ac3': {
                    if (!st.on) { st.I = [0, 0, 0]; st.thSrc *= Math.exp(-H / 30); break; }
                    var Ys = Cx.inv(ZS), Eph = st.variac * 440 / Math.sqrt(3);
                    st.I = ['src.L1', 'src.L2', 'src.L3'].map(function (t, i) {
                        var list = K.slice(1).map(function (Kk) {
                            var Vt = S.V[Kk.id](N(t)), Yk = Cx.inv(C(ZS.re, ZS.im * Kk.f / 50));
                            var E = Kk.id === 'grid' ? polar(Eph, -120 * i) : C(0);
                            return { v: Cx.mul(Cx.mul(Cx.sub(E, Vt), Yk), Kk.rot), f: Kk.f };
                        });
                        var idc = S.V.dc(N(t)).re / ZS.re;
                        return Math.sqrt(Math.pow(rms(list), 2) + idc * idc);
                    });
                    var Il = Math.max.apply(null, st.I);
                    if (Il > 100) trip = trip || 'Disparo magnético de ' + self.label(c) + ': ' + Math.round(Il) + ' A. ¿Cortocircuito en el montaje?';
                    var xs = Il / 16;
                    if (xs > 1) st.thSrc += (xs * xs - 1) * H; else st.thSrc *= Math.exp(-H / 30);
                    if (st.thSrc > 60) { st.thSrc = 0; trip = trip || 'Disparo térmico de ' + self.label(c) + ': sobrecarga por encima de 16 A.'; }
                    break;
                }
                case 'dc2':
                    st.I = {};
                    ['A', 'F'].forEach(function (q) {
                        var sc = DCSRC[q], live = st.on && st.out[q], u = S.V.dc(N(sc.p)).re - S.V.dc(N(sc.n)).re;
                        var I = live ? (st.U[q] - u) / sc.R : 0;
                        st.I[q] = I;
                        if (live && Math.abs(I) > sc.Imag) trip = trip || 'Disparo magnético de ' + self.label(c) + ': ' + Math.round(Math.abs(I)) + ' A en la salida de ' + sc.name + '. ¿Arranque sin limitar la corriente o cortocircuito?';
                        var x = Math.abs(I) / sc.Ith;
                        if (x > 1) st.thSrc[q] += (x * x - 1) * H; else st.thSrc[q] *= Math.exp(-H / 30);
                        if (st.thSrc[q] > 40) { st.thSrc[q] = 0; trip = trip || 'Disparo térmico de ' + self.label(c) + ' (salida de ' + sc.name + ').'; }
                    });
                    break;
                case 'exc': {
                    var live2 = st.ex.on, u2 = S.V.dc(N('ex.+')).re - S.V.dc(N('ex.-')).re;
                    st.I = live2 ? (st.ex.U - u2) / EXSRC.R : 0;
                    if (live2 && Math.abs(st.I) > EXSRC.Imag) trip = trip || 'Disparo de ' + self.label(c) + ': cortocircuito en la salida.';
                    var xe = Math.abs(st.I) / EXSRC.Ith;
                    if (xe > 1) st.th += (xe * xe - 1) * H; else st.th *= Math.exp(-H / 20);
                    if (st.th > 20) { st.th = 0; trip = trip || 'Disparo térmico de ' + self.label(c) + '.'; }
                    break;
                }
                case 'im': {
                    var ports = [['m.U1', 'm.U2'], ['m.V1', 'm.V2'], ['m.W1', 'm.W2']];
                    var Tem = 0, Emax = 0, Iw = [[], [], []];
                    K.slice(1).forEach(function (Kk) {
                        var yk = c.Yk && c.Yk[Kk.id]; if (!yk) return;
                        var Vw = ports.map(function (q) { return Cx.sub(S.V[Kk.id](N(q[0])), S.V[Kk.id](N(q[1]))); });
                        var Ik = mulV(yk.Y, Vw);
                        Ik.forEach(function (I, i) { Iw[i].push({ v: Cx.mul(I, Kk.rot), f: Kk.f }); });
                        var V012 = Circuit.seq(Vw), Z1 = C(yk.Ps.R1, yk.Ps.X1);
                        var Ip = Cx.mul(yk.Yp, V012[1]), In = Cx.mul(yk.Yn, V012[2]);
                        var Ep = Cx.sub(V012[1], Cx.mul(Ip, Z1)), En = Cx.sub(V012[2], Cx.mul(In, Z1));
                        var rho = function (s) { return s * yk.Ps.R2 / (yk.Ps.R2 * yk.Ps.R2 + s * s * yk.Ps.X2 * yk.Ps.X2); };
                        var w1 = 2 * Math.PI * Kk.f / P.p;
                        Tem += 3 * (Cx.abs2(Ep) * rho(yk.s) - Cx.abs2(En) * rho(2 - yk.s)) / w1;
                        Emax = Math.max(Emax, Math.sqrt(Cx.abs2(Ep) + Cx.abs2(En)) * 50 / Kk.f);
                    });
                    st.Esat += (Emax - st.Esat) * 0.5;
                    c.Tem = Tem;
                    var idc = ports.map(function (q) { return (S.V.dc(N(q[0])).re - S.V.dc(N(q[1])).re) / P.R1; });
                    st.Iw = Iw.map(function (l, i) { return Math.sqrt(Math.pow(rms(l), 2) + idc[i] * idc[i]); });
                    var xm = Math.max.apply(null, st.Iw) / P.Iwn;
                    if (xm > 1.05) st.th += (xm * xm - 1.1) * H; else st.th *= Math.exp(-H / 20);
                    if (st.th > 150) trip = trip || 'Disparo de las sondas PTC de ' + self.label(c) + ': sobrecorriente mantenida en los devanados.';
                    break;
                }
                case 'tr': {
                    TRW = TRW || trWindings();
                    var Em = 0, IwT = TRW.map(function () { return []; });
                    K.slice(1).forEach(function (Kk) {
                        var pm = c.Yk && c.Yk[Kk.id]; if (!pm) return;
                        var Vw = TRW.map(function (w) { return Cx.sub(S.V[Kk.id](N(w[0])), S.V[Kk.id](N(w[1]))); });
                        mulV(pm.Y, Vw).forEach(function (I, i) { IwT[i].push({ v: Cx.mul(I, Kk.rot), f: Kk.f }); });
                        for (var col = 0; col < 3; col++) {
                            var acc = C(0);
                            for (var d = 0; d < 3; d++) for (var j = 0; j < 3; j++) acc = Cx.add(acc, Cx.mul(pm.M[col][d], Cx.scale(Cx.mul(pm.Yw[j], Vw[j * 3 + d]), pm.a[j])));
                            Em = Math.max(Em, Cx.abs(acc) * 50 / Kk.f);
                        }
                    });
                    st.Esat += (Em - st.Esat) * 0.6;
                    st.Iw = IwT.map(function (l, i) {
                        var w = TRW[i], idc2 = (S.V.dc(N(w[0])).re - S.V.dc(N(w[1])).re) / (i < 3 ? P.R1 : P.Rh);
                        return Math.sqrt(Math.pow(rms(l), 2) + idc2 * idc2);
                    });
                    var xt = 0;
                    st.Iw.forEach(function (I, i) { xt = Math.max(xt, I / (i < 3 ? P.I1n : P.I2n)); });
                    if (xt > 1.05) st.th += (xt * xt - 1.1) * H; else st.th *= Math.exp(-H / 25);
                    if (st.th > 180) trip = trip || 'Disparo de la protección térmica de ' + self.label(c) + '.';
                    break;
                }
                case 'dcm': {
                    var ni = {};
                    ['a', 'e', 'd'].forEach(function (b) { var q = c.br[b]; ni[b] = q.G * (S.V.dc(q.a).re - S.V.dc(q.z).re) + q.J; });
                    st.i = ni;
                    c.Tem = c.kphi * ni.a;
                    var xd = Math.max(Math.abs(ni.a) / P.In, Math.abs(ni.d) / P.In, Math.abs(ni.e) / (1.4 * P.Ifn));
                    if (xd > 1.05) st.th += (xd * xd - 1.1) * H; else st.th *= Math.exp(-H / 20);
                    if (st.th > 150) trip = trip || 'Disparo de las sondas PTC de ' + self.label(c) + ': sobrecorriente mantenida en los devanados.';
                    break;
                }
                case 'sm': {
                    var fb = c.fb;
                    st.If = fb ? fb.G * (S.V.dc(fb.a).re - S.V.dc(fb.z).re) + fb.J : 0;
                    var sp = [['m.U1', 'm.U2'], ['m.V1', 'm.V2'], ['m.W1', 'm.W2']], own = null;
                    K.forEach(function (Kk) { if (Kk.owner === c) own = Kk; });
                    var Iout = {}, Pe = 0, IwS = [[], [], []], Vt = 0, Td = 0;
                    K.slice(1).forEach(function (Kk) {
                        var yk = c.Yk && c.Yk[Kk.id]; if (!yk) return;
                        var Vp = sp.map(function (q) { return Cx.sub(S.V[Kk.id](N(q[0])), S.V[Kk.id](N(q[1]))); });
                        var I = mulV(yk.Y, yk.Ev.map(function (e, i) { return Cx.sub(e, Vp[i]); }));
                        Iout[Kk.id] = I;
                        I.forEach(function (x, i) { IwS[i].push({ v: Cx.mul(x, Kk.rot), f: Kk.f }); });
                        Vt = Math.max(Vt, Cx.abs(Vp[0]));
                        /* amortiguador respecto a cada red ajena a la que está conectada */
                        if (Kk !== own) {
                            var Va = Cx.abs(Vp[0]) / P.Vwn;
                            if (Va > 0.05) { var wsm = 2 * Math.PI * Kk.f / P.p * (st.w >= 0 ? 1 : -1); Td += Math.max(-P.Tdmax, Math.min(P.Tdmax, P.Kd * (wsm - st.w))) * Va * Va; }
                        }
                    });
                    if (own) {
                        var Ev = c.Yk[own.id].Ev;
                        K.slice(1).forEach(function (Kk) {
                            var I = Iout[Kk.id]; if (!I) return;
                            if (Kk !== own && Math.abs(Kk.f - own.f) > 5) return;
                            var rotRel = Kk === own ? C(1) : Cx.div(own.rot, Kk.rot);
                            for (var i = 0; i < 3; i++) { var Er = Cx.mul(Ev[i], rotRel); Pe += Er.re * I[i].re + Er.im * I[i].im; }
                        });
                    }
                    c.Tem = (Math.abs(st.w) > 1e-3 ? -Pe / st.w : 0) + Td;
                    c.Vt = Vt;
                    st.Iw = IwS.map(function (l) { return rms(l); });
                    var xs2 = Math.max(Math.max.apply(null, st.Iw) / P.In, Math.abs(st.If) / (1.3 * P.Ifn));
                    if (xs2 > 1.05) st.th += (xs2 * xs2 - 1.1) * H; else st.th *= Math.exp(-H / 20);
                    if (st.th > 150) trip = trip || 'Disparo de las sondas PTC de ' + self.label(c) + ': sobrecorriente mantenida.';
                    break;
                }
                case 'syncp': {
                    /* relé de pérdida de sincronismo: Q2 cerrado con frecuencias distintas a ambos lados */
                    break;
                }
            }
        });
        return trip;
    };

    /* ---------------- Mecánica de los ejes ---------------- */
    FreeLab.prototype.lossTorque = function (c, w) {
        var P = c.P, st = c.st;
        switch (c.type) {
            case 'im': return VEM.Motor.frictionTorque(P, w);
            case 'dcm': { var s = 0.3 + 0.7 * Math.abs(w) / P.wn, fr = (c.kphi || 0) / P.kPhi; return (P.Pm + P.Pfe * fr * fr) / P.wn * s; }
            case 'sm': { var s2 = 0.3 + 0.7 * Math.abs(w) / P.wn, fe = Math.min(1.3, (c.Vt || 0) / P.Vwn); return (P.Pm + P.Pfe * fe * fe) / P.wn * s2; }
            case 'dyno': return 0.02 * (0.3 + Math.abs(w) / 157);
        }
        return 0;
    };
    FreeLab.prototype.mech = function (S) {
        var self = this, trip = null;
        this.shaftList.forEach(function (sh) {
            var J = 0, Tem = 0, drive = 0, brake = 0, nmax = Infinity;
            sh.comps.forEach(function (c) {
                if (c.type === 'dyno') {
                    J += c.st.dyno.J;
                } else { J += c.P.J; Tem += c.Tem || 0; nmax = Math.min(nmax, c.P.nmax || (c.P.plate && c.P.plate.ns * 1.25) || 3600); }
            });
            sh.comps.forEach(function (c) {
                if (c.type !== 'dyno') return;
                var d = c.st.dyno;
                d.nmax = Math.min(3600, isFinite(nmax) ? nmax : 3600);
                var u = d.update(sh.w, H, J);
                drive += u.drive; brake += u.brake;
            });
            var w0 = sh.w;
            sh.w = Mech.shaftStep({ w: sh.w, J: J, Tem: Tem, drive: drive, brake: brake, locked: false, h: H,
                Tloss: function (w) { var t = 0; sh.comps.forEach(function (c) { t += self.lossTorque(c, w); }); return t; } });
            sh.Tem = Tem; sh.J = J; sh.alpha = (sh.w - w0) / H;
            sh.comps.forEach(function (c) {
                c.st.w = sh.w;
                if (c.type === 'sm') { c.st.theta += (c.P.p * Math.abs(sh.w) - W50) * H; c.st.theta = Math.atan2(Math.sin(c.st.theta), Math.cos(c.st.theta)); }
            });
            if (isFinite(nmax) && Math.abs(sh.w) > 1.1 * nmax * RPM && !trip) {
                trip = 'Disparo por sobrevelocidad: ' + Math.round(Math.abs(sh.w) / RPM) + ' min⁻¹ en el eje de ' + sh.comps.filter(function (c) { return c.type !== 'dyno'; }).map(function (c) { return self.label(c); }).join(' + ') + '.';
            }
        });
        if (trip) {
            this.tripAll(trip);
            this.comps.forEach(function (c) { if (c.type === 'dyno') c.st.dyno.Tset = Math.max(c.st.dyno.Tset, 5); });
        }
    };

    /* Par medido por un dinamómetro (convenio motor de la máquina acoplada) */
    FreeLab.prototype.dynoTorque = function (c) {
        var sh = c.shaft, d = c.st.dyno;
        if (!sh) return 0;
        var Tother = sh.Tem || 0;
        return Mech.shaftTorque(d, sh.w, Tother, 0, false);
    };

    /* ---------------- Polímetro ---------------- */
    FreeLab.prototype.ohm = function (c) {
        var a = this.N(c, 'mm.a'), b = this.N(c, 'mm.b');
        if (a === b) return 0;
        var net = this.stamp({ id: 'dc', f: 0 }, 'ohm');
        net.inj(b, C(-1e-3)); net.inj(a, C(1e-3));
        /* fuerza a resolver la isla aunque solo haya la corriente de prueba */
        var V = net.solve();
        return (V(a).re - V(b).re) / 1e-3;
    };

    /* ================= Lecturas ================= */
    FreeLab.prototype.readings = function () {
        if (!this.S) this.step(H);
        var S = this.S, self = this, out = { comps: {} };
        function acV(c, a, b) { return rms(self.acList(S, self.N(c, a), self.N(c, b))); }
        function dcV(c, a, b) { return S.V.dc(self.N(c, a)).re - S.V.dc(self.N(c, b)).re; }
        function phasor(c, a, b) {
            /* fasor del componente dominante (para el modo «ondas») */
            var best = null;
            S.K.slice(1).forEach(function (Kk) { var v = self.vk(S, Kk, self.N(c, a), self.N(c, b)); if (!best || Cx.abs(v) > Cx.abs(best.v)) best = { v: v, f: Kk.f }; });
            return best || { v: C(0), f: 50 };
        }
        this.comps.forEach(function (c) {
            var r = {}, st = c.st;
            switch (c.type) {
                case 'ac3': r.U = st.on ? acV(c, 'src.L1', 'src.L2') : 0; r.I = st.I || [0, 0, 0]; break;
                case 'dc2': r.uA = st.on && st.out.A ? dcV(c, 'ps.A+', 'ps.A-') : 0; r.uF = st.on && st.out.F ? dcV(c, 'ps.F+', 'ps.F-') : 0; r.I = st.I || { A: 0, F: 0 }; break;
                case 'exc': r.U = st.ex.on ? dcV(c, 'ex.+', 'ex.-') : 0; r.I = st.I || 0; break;
                case 'wm': {
                    var Ul = self.acList(S, self.N(c, 'w.Ua'), self.N(c, 'w.Ub')), Il = self.acList(S, self.N(c, 'w.Ia'), self.N(c, 'w.Ib'), Y_AMM);
                    var cu = clusters(Ul), ci = clusters(Il), Pw = 0, Qw = 0, fw = 0, best = 0;
                    cu.forEach(function (u) {
                        ci.forEach(function (i) { if (Math.abs(u.f - i.f) < COH) { Pw += u.v.re * i.v.re + u.v.im * i.v.im; Qw += u.v.im * i.v.re - u.v.re * i.v.im; } });
                        if (Cx.abs(u.v) > best) { best = Cx.abs(u.v); fw = u.f; }
                    });
                    r.Q = Qw; r.f = fw;
                    Pw += dcV(c, 'w.Ua', 'w.Ub') * dcV(c, 'w.Ia', 'w.Ib') * Y_AMM;
                    r.P = Pw; r.U = rms(Ul); r.I = rms(Il);
                    break;
                }
                case 'am': r.v = acV(c, 'am.a', 'am.b') * Y_AMM; r.ph = phasor(c, 'am.a', 'am.b'); r.ph.v = Cx.scale(r.ph.v, Y_AMM); break;
                case 'vm': r.v = acV(c, 'vm.a', 'vm.b'); r.ph = phasor(c, 'vm.a', 'vm.b'); break;
                case 'adc': case 'adc3': r.v = dcV(c, 'ad.a', 'ad.b') * Y_AMM; break;
                case 'vdc': r.v = dcV(c, 'vd.a', 'vd.b'); break;
                case 'mm': {
                    var live = Math.abs(dcV(c, 'mm.a', 'mm.b')) + acV(c, 'mm.a', 'mm.b');
                    r.mm = live > 0.5 ? { live: true } : { R: self.ohm(c) };
                    break;
                }
                case 'syncp': {
                    var L = ['sy.L1', 'sy.L2', 'sy.L3'], G = ['sy.G1', 'sy.G2', 'sy.G3'];
                    r.uL = acV(c, L[0], L[1]); r.uG = acV(c, G[0], G[1]);
                    function dom(t) {
                        var best = null;
                        S.K.slice(1).forEach(function (Kk) { var v = self.vk(S, Kk, self.N(c, t)); if (!best || Cx.abs(v) > Cx.abs(best.v)) best = { v: v, f: Kk.f }; });
                        return best;
                    }
                    var dl = dom(L[0]), dg = dom(G[0]);
                    r.fL = r.uL > 5 && dl ? dl.f : 0; r.fG = r.uG > 5 && dg ? dg.f : 0;
                    var vL = C(0), vG = C(0);
                    S.K.slice(1).forEach(function (Kk) { vL = Cx.add(vL, self.vk(S, Kk, self.N(c, L[0]))); vG = Cx.add(vG, self.vk(S, Kk, self.N(c, G[0]))); });
                    r.phi = Math.atan2(vG.im, vG.re) - Math.atan2(vL.im, vL.re);
                    r.phi = Math.atan2(Math.sin(r.phi), Math.cos(r.phi));
                    r.sync = r.uL > 5 && r.uG > 5 && !st.q2;
                    var perm = st.lampMode === 'rot' ? [0, 2, 1] : [0, 1, 2];
                    var d = perm.map(function (j, i) {
                        return S.K.slice(1).map(function (Kk) { return { v: self.vk(S, Kk, self.N(c, L[i]), self.N(c, G[j])), f: Kk.f }; });
                    });
                    /* sin componente homopolar */
                    var mean = [0, 1, 2].map(function (q) { return S.K.slice(1).map(function (Kk, kk) { return Cx.scale(Cx.add(Cx.add(d[0][kk].v, d[1][kk].v), d[2][kk].v), 1 / 3); }); })[0];
                    r.lamps = d.map(function (l) { return Math.min(1.2, rms(l.map(function (it, kk) { return { v: Cx.sub(it.v, mean[kk]), f: it.f }; })) / 460); });
                    r.q2 = st.q2;
                    break;
                }
                case 'im': case 'dcm': case 'sm':
                    r.n = st.w / RPM; r.thermal = Math.min(1, st.th / 150);
                    if (c.type === 'sm') { r.If = st.If; r.f = c.P.p * Math.abs(st.w) / (2 * Math.PI); }
                    if (c.type === 'dcm') { r.ia = st.i.a; }
                    if (c.type === 'im') r.Iw = st.Iw || [0, 0, 0];
                    break;
                case 'tr': r.thermal = Math.min(1, st.th / 180); r.Iw = st.Iw || []; break;
                case 'ctl': r.on = st.on; r.I = st.I || 0; break;
                case 'km': r.closed = st.closed; r.Vc = st.Vc || 0; break;
                case 'kt': r.out = st.out; r.t = st.t; break;
                case 'fr': r.tripped = st.tripped; r.I = st.I || 0; r.th = Math.min(1, st.th / 150); break;
                case 'qm': r.on = st.on; r.I = st.I || 0; break;
                case 'lamp': r.b = st.b || 0; break;
                case 'dyno': {
                    var T = self.dynoTorque(c);
                    r.n = st.w / RPM; r.T = T; r.Pm = T * Math.abs(st.w);
                    var mx = 0;
                    (c.shaft ? c.shaft.comps : []).forEach(function (q) { if (q.type !== 'dyno') mx = Math.max(mx, Math.min(1, q.st.th / 150)); });
                    r.thermal = mx;
                    break;
                }
            }
            out.comps[c.id] = r;
            if (c.type === 'vm' && !out.vmC) { out.vmC = r.ph.v; out.fw = r.ph.f; }
            if (c.type === 'am' && !out.amC) { out.amC = r.ph.v; if (!out.fw) out.fw = r.ph.f; }
        });
        out.vmC = out.vmC || C(0); out.amC = out.amC || C(0); out.fw = out.fw || 50;
        out.thermal = 0;
        return out;
    };

    /* ---------------- Panel de sincronización: Q2 ---------------- */
    FreeLab.prototype.setQ2 = function (c, close) {
        if (!close) { c.st.q2 = false; this.rewire(); return true; }
        var r = this.readings().comps[c.id] || {};
        var dV = Math.max.apply(null, (r.lamps || [0, 0, 0]).map(function (x) { return x * 460; }));
        var df = Math.abs((r.fL || 0) - (r.fG || 0));
        c.st.q2 = true; this.rewire();
        if (r.uL > 20 && r.uG > 20) {
            if (dV > 300 || (df > 2 && dV > 150)) {
                this.tripAll('Disparo al cerrar Q2 fuera de sincronismo (' + this.label(c) + '): ΔU ≈ ' + Math.round(dV) + ' V entre contactos, Δf = ' + VEM.fmtN(df, 2) + ' Hz.');
                return false;
            }
            if (dV > 60 || df > 0.3) this.emit('warn', 'Acoplamiento brusco en ' + this.label(c) + ': ΔU ≈ ' + Math.round(dV) + ' V entre contactos de Q2, Δf = ' + VEM.fmtN(df, 2) + ' Hz.');
        }
        return true;
    };

    VEM.Free = { LAMPS: LAMPS, TYPES: TYPES, RLC: RLC, RDC: RDC, RH: RH, DCSRC: DCSRC, EXSRC: EXSRC, clusters: clusters, rms: rms };
    VEM.FreeLab = FreeLab;
    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
