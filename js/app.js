/* =====================================================================
   VEMLAB · Aplicación
   Estado persistente, bucle de simulación en tiempo real, registro de
   eventos, avisos y barra superior.
   ===================================================================== */
(function () {
    'use strict';
    var VEM = window.VEM;
    var $ = function (id) { return document.getElementById(id); };
    var fN = VEM.fmtN;

    /* ---------------- Máquinas del laboratorio ---------------- */
    var HELP_COMMON_CABLES = '<li><b>Cables.</b> Toca un borne y después otro (o arrastra de uno a otro). Elige el color arriba. Toca un cable para seleccionarlo y pulsa «Quitar cable» (con ratón también sirve doble clic, clic derecho o <kbd>Supr</kbd>). «Deshacer» o <kbd>Ctrl</kbd>+<kbd>Z</kbd> deshace.</li>' +
        '<li><b>Vatímetros.</b> El borne marcado con * es el de polaridad: la corriente debe entrar por I* y U* debe ir a la misma fase que I*.</li>' +
        '<li><b>Fuente.</b> Con el montaje terminado, ajusta el autotransformador (arrastra el mando, rueda del ratón o botones − / +, de 0,5 V en 0,5 V) y cierra el interruptor Q1. Por seguridad no se puede modificar el montaje con tensión.</li>';
    var HELP_SCOPE = '<li><b>Osciloscopio y registro.</b> Se abren con los botones de la barra inferior; puedes moverlos por la cabecera y cambiar su tamaño con el asa de la esquina. Con «Cursores A–B» lees valores exactos y diferencias.</li>';
    var HELP_DYNO = '<li><b>Dinamómetro.</b> En modo <b>PAR</b> es un freno: la consigna carga la máquina que trabaja como motor. En modo <b>VELOCIDAD</b> arrastra la máquina a la velocidad de consigna, en el sentido elegido (para ensayarla como generador) o la retiene si es un motor. El par se muestra con convenio motor: positivo si la máquina entrega potencia mecánica, negativo si la absorbe.</li>';
    function chn(k, l, u, c, d, t, g) { return { k: k, l: l, u: u, c: c, d: d, t: t, g: g }; }
    var CH_DC = [
        chn('V1', 'V1', 'V', '#ffd60a', 1, 'Voltímetro V1', function (r) { return r.v1; }),
        chn('A1', 'A1', 'A', '#2ee6ff', 2, 'Amperímetro A1', function (r) { return r.a1; }),
        chn('V2', 'V2', 'V', '#ff9f43', 1, 'Voltímetro V2', function (r) { return r.v2; }),
        chn('A2', 'A2', 'A', '#c39bff', 3, 'Amperímetro A2', function (r) { return r.a2; }),
        chn('n', 'n', 'min⁻¹', '#4dff88', 0, 'Velocidad (dinamómetro)', function (r, n) { return n; }),
        chn('T', 'T', 'N·m', '#ff5b5b', 2, 'Par en el acoplamiento (dinamómetro)', function (r) { return r.T; }),
        chn('Pm', 'Pmec', 'W', '#ff5fd2', 0, 'Potencia mecánica T·ω (dinamómetro)', function (r) { return r.Pm; })
    ];
    var CH_SY = [
        chn('U', 'U', 'V', '#ffd60a', 1, 'Tensión (voltímetro)', function (r) { return r.vm; }),
        chn('I', 'I', 'A', '#2ee6ff', 3, 'Corriente (amperímetro)', function (r) { return r.am; }),
        chn('W1', 'W₁', 'W', '#ff9f43', 0, 'Vatímetro W1', function (r) { return r.w1.P; }),
        chn('W2', 'W₂', 'W', '#c39bff', 0, 'Vatímetro W2', function (r) { return r.w2.P; }),
        chn('P', 'P', 'W', '#ff5fd2', 0, 'Potencia W1 + W2', function (r) { return r.w1.P + r.w2.P; }),
        chn('Iex', 'Iexc', 'A', '#9be15d', 3, 'Corriente de excitación', function (r) { return Math.abs(r.If); }),
        chn('n', 'n', 'min⁻¹', '#4dff88', 0, 'Velocidad (dinamómetro)', function (r, n) { return n; }),
        chn('T', 'T', 'N·m', '#ff5b5b', 2, 'Par en el acoplamiento (dinamómetro)', function (r) { return r.T; }),
        chn('fG', 'f alt.', 'Hz', '#f4f4f4', 2, 'Frecuencia del alternador', function (r) { return r.fG; })
    ];
    var MACHINES = {
        asincrona: {
            key: 'vemlab4', title: 'Máquina asíncrona trifásica',
            catalog: VEM.Motor.catalog, def: 'M2',
            label: function (m) { return m.name + ' · ' + fN(m.Pn / 1000, 1) + ' kW'; },
            make: function (m) { return new VEM.Lab(m); }, Bench: VEM.Bench,
            restore: function (lab, s) { lab.brake = +s.brake || 0; },
            persist: function (lab) { return { brake: lab.brake }; },
            modelChanged: function (lab) { lab.locked = false; lab.brake = 0; },
            scope: {},
            status: function (lab, r) {
                var n = Math.abs(r.n);
                if (lab.locked) return 'Rotor bloqueado · alimentado';
                if (n < 1 && Math.max(r.Iw[0], r.Iw[1], r.Iw[2]) > 0.3 * lab.P.Iwn) return 'Motor alimentado pero sin girar (zumba)';
                if (n < 1) return 'Fuente conectada';
                return 'Motor girando · ' + Math.round(n) + ' min⁻¹' + (r.n < 0 ? ' (sentido antihorario)' : '');
            },
            help: '<li><b>Puentes.</b> En la caja de bornes pulsa entre dos bornes para poner o quitar una chapa de puente (o usa los botones Estrella / Triángulo). Mira la placa: con una red de 400 V entre fases, un motor 230/400 V va en estrella y uno 400/690 V en triángulo.</li>' +
                HELP_COMMON_CABLES +
                '<li><b>Freno.</b> La consigna de par carga el motor. El bloqueo del rotor (solo con el motor parado) sirve para el ensayo de cortocircuito.</li>' +
                HELP_SCOPE.replace('</li>', ' «Par–velocidad» traza la curva T–n por el método de aceleración (arranca con el freno a 0, mejor a tensión reducida).</li>'),
            note: 'Como en el laboratorio real, el interruptor dispara ante un cortocircuito y las sondas térmicas del motor lo desconectan si los devanados soportan demasiada corriente durante demasiado tiempo.'
        },
        transformador: {
            key: 'vemlab-trafo1', title: 'Transformador trifásico',
            catalog: VEM.Trafo.catalog, def: 'TA',
            label: function (m) { return m.name + ' · ' + fN(m.Sn / 1000, 0) + ' kVA'; },
            make: function (m) { return new VEM.TrafoLab(m); }, Bench: VEM.TrafoBench,
            restore: function (lab, s) {
                var l = s.load || {};
                lab.load = { R: +l.R || 0, L: +l.L || 0, C: +l.C || 0, on: !!l.on };
            },
            persist: function (lab) { return { load: lab.load }; },
            modelChanged: function () { },
            scope: { channels: ['U', 'I', 'W1', 'W2', 'P'], modes: ['trend', 'wave'] },
            status: function (lab) {
                return 'Transformador alimentado' + (lab.load.on && (lab.load.R + lab.load.L + lab.load.C) > 0 ? ' · carga conectada' : '');
            },
            help: '<li><b>Placa de bornes.</b> Cada columna del núcleo tiene un devanado de alta tensión (1U1–1U2) y el de baja tensión partido en dos mitades (2U1–2U2 y 2U3–2U4). El punto • marca el principio de cada devanado. Todas las conexiones se hacen con cables: estrella, triángulo, mitades de BT en serie (2U2–2U3) o zigzag combinando mitades de columnas distintas.</li>' +
                '<li><b>Placa de características.</b> Indica la tensión e intensidad asignadas de <i>cada devanado</i>: elige la conexión para que, con la tensión de la fuente, cada devanado quede a su tensión asignada.</li>' +
                HELP_COMMON_CABLES +
                '<li><b>Banco de cargas.</b> Selecciona los escalones de R, L y C (valores a 230 V entre fases) y cierra el interruptor CARGA. Conecta L1, L2, L3 y, si quieres cuatro hilos, N.</li>' +
                HELP_SCOPE,
            note: 'Como en el laboratorio real, el interruptor de la fuente dispara ante un cortocircuito (¡ojo con cortocircuitar la BT a tensión nominal!) y las sondas térmicas desconectan el transformador si los devanados se sobrecargan durante demasiado tiempo.'
        },
        continua: {
            key: 'vemlab-dc1', title: 'Máquina de corriente continua',
            catalog: VEM.DC.catalog, def: 'CA',
            label: function (m) { return m.name + ' · ' + fN(m.Pn / 1000, 1) + ' kW'; },
            make: function (m) { return new VEM.DCLab(m); }, Bench: VEM.DCBench,
            restore: function (lab, s) {
                var u = s.U || {}, o = s.out || {}, rh = s.rh || {}, l = s.load || {}, d = s.dyno || {}, R = VEM.DC.RH;
                lab.U = { A: Math.min(250, Math.max(0, +u.A || 0)), F: Math.min(250, Math.max(0, +u.F || 0)) };
                lab.out = { A: !!o.A, F: !!o.F };
                lab.rh = { A: rh.A === undefined ? R.A.max : Math.min(R.A.max, Math.max(0, +rh.A)), F: Math.min(R.F.max, Math.max(0, +rh.F || 0)) };
                lab.load = { n: Math.min(VEM.DC.LOAD.steps, Math.max(0, Math.round(+l.n || 0))), on: !!l.on };
                lab.dyno.mode = d.mode === 'n' ? 'n' : 'T';
                lab.dyno.Tset = Math.min(lab.dyno.Tmax, Math.max(-lab.dyno.Tmax, +d.Tset || 0));
                lab.dyno.nset = Math.min(lab.dyno.nmax, Math.max(0, +d.nset || 0));
                lab.dyno.dir = d.dir === -1 ? -1 : 1;
                lab.dyno.setMode(lab.dyno.mode, 0);
            },
            persist: function (lab) { return { U: lab.U, out: lab.out, rh: lab.rh, load: lab.load, dyno: lab.dyno.state() }; },
            modelChanged: function (lab) { lab.dyno.setMode('T', 0); lab.dyno.Tset = 0; },
            scope: { CH: CH_DC, defaultOn: { V1: 1, A1: 1, n: 1 }, xy: { x: 'A2', y: 'V1' }, modes: ['trend', 'xyg'] },
            status: function (lab, r) { return dcStatus(lab, r, true); },
            statusOff: function (lab, r) { return Math.abs(r.n) >= 1 ? dcStatus(lab, r, false) : null; },
            help: '<li><b>Caja de bornes.</b> A1–A2 es el inducido, D1–D2 el devanado de excitación serie y E1–E2 el de excitación derivación (o independiente). Todo se conecta con cables: excitación independiente, derivación, serie o compuesta, como motor o como generador.</li>' +
                '<li><b>Fuente de c.c. doble.</b> Q1 es el interruptor general; cada salida (INDUCIDO y EXCITACIÓN) tiene su tensión y su contactor (0 / I). Al arrancar un motor, conecta primero la excitación y limita la corriente de inducido con el reóstato de arranque o subiendo la tensión poco a poco.</li>' +
                '<li><b>Reóstatos.</b> El de arranque (0–40 Ω) va en serie con el inducido; el de campo (0–1000 Ω) en serie con la excitación derivación. Se ajustan con el mando, incluso con tensión.</li>' +
                '<li><b>Instrumentos de c.c.</b> Los amperímetros y voltímetros leen con signo: la corriente debe entrar por el borne + del amperímetro. A1 tiene 30 A de alcance y A2 3 A (para la excitación).</li>' +
                HELP_COMMON_CABLES.replace(/<li><b>Vatímetros\.<\/b>[^]*?<\/li>/, '').replace(/<li><b>Fuente\.<\/b>[^]*?<\/li>/, '') +
                HELP_DYNO +
                '<li><b>Osciloscopio.</b> En «X–Y» elige qué magnitud va en cada eje: por ejemplo, X = A2 (corriente de excitación) e Y = V1 (tensión de inducido) para la curva de vacío, o X = A1 e Y = V1 para la característica externa del generador. Se abre y se mueve como una ventana.</li>',
            note: 'Como en el laboratorio real, Q1 dispara si arrancas sin limitar la corriente o hay un cortocircuito, las sondas térmicas protegen los devanados y la protección de sobrevelocidad desconecta todo si la máquina se embala (motor serie en vacío, excitación abierta o demasiado débil).'
        }
    };
    MACHINES.sincrona = {
        key: 'vemlab-sync1', title: 'Máquina síncrona trifásica',
        catalog: VEM.Sync.catalog, def: 'S1',
        label: function (m) { return m.name + ' · ' + fN(m.Sn / 1000, 1) + ' kVA'; },
        make: function (m) { return new VEM.SyncLab(m); }, Bench: VEM.SyncBench,
        restore: function (lab, s) {
            var e = s.ex || {}, l = s.load || {}, d = s.dyno || {};
            lab.ex = { U: Math.min(VEM.Sync.EXC.Umax, Math.max(0, +e.U || 0)), on: !!e.on };
            lab.load = { R: +l.R || 0, L: +l.L || 0, C: +l.C || 0, on: !!l.on };
            lab.lampMode = s.lampMode === 'rot' ? 'rot' : 'dark';
            lab.dyno.mode = d.mode === 'n' ? 'n' : 'T';
            lab.dyno.Tset = Math.min(lab.dyno.Tmax, Math.max(-lab.dyno.Tmax, +d.Tset || 0));
            lab.dyno.nset = Math.min(lab.dyno.nmax, Math.max(0, +d.nset || 0));
            lab.dyno.dir = d.dir === -1 ? -1 : 1;
            lab.dyno.setMode(lab.dyno.mode, 0);
        },
        persist: function (lab) { return { ex: lab.ex, load: lab.load, lampMode: lab.lampMode, dyno: lab.dyno.state() }; },
        modelChanged: function (lab) { lab.dyno.setMode('T', 0); lab.dyno.Tset = 0; lab.openQ2(); },
        scope: { CH: CH_SY, defaultOn: { U: 1, I: 1, n: 1 }, xy: { x: 'Iex', y: 'I' }, modes: ['trend', 'wave', 'xyg'] },
        status: function (lab, r) { return syncStatus(lab, r); },
        statusOff: function (lab, r) { return Math.abs(r.n) >= 1 ? syncStatus(lab, r) + ' · red desconectada' : null; },
        help: '<li><b>Caja de bornes.</b> U1–U2, V1–V2 y W1–W2 son las bobinas del estátor (pulsa entre bornes para poner puentes, o usa Estrella / Triángulo); F1–F2 es el devanado de excitación del rotor, que se alimenta desde la fuente de EXCITACIÓN (con su voltímetro y amperímetro incorporados).</li>' +
            '<li><b>Panel de sincronización.</b> Conecta la red a L1–L2–L3 y el alternador a G1–G2–G3. Con Q2 abierto, el doble voltímetro y el doble frecuencímetro comparan las dos tensiones; el sincronoscopio gira hacia RÁPIDO si el alternador va más deprisa que la red; las lámparas (apagadas o giratorias) parpadean con la diferencia de frecuencia. Cierra Q2 con tensiones iguales, frecuencias casi iguales y el sincronoscopio en la marca verde (lámparas apagadas).</li>' +
            HELP_COMMON_CABLES +
            HELP_DYNO +
            '<li><b>Una vez acoplada.</b> Pasa el dinamómetro a modo PAR: con consigna negativa arrastra la máquina y ésta entrega potencia activa a la red (generador); con consigna positiva la frena y la máquina absorbe potencia (motor síncrono). Con la excitación varías la potencia reactiva: curvas en V.</li>' +
            '<li><b>Carga R–L–C.</b> Para ensayar el alternador aislado de la red (con Q2 abierto), conéctala a la salida del alternador.</li>' +
            HELP_SCOPE.replace('</li>', ' En «X–Y» puedes dibujar la curva en V: X = corriente de excitación, Y = corriente del estátor.</li>'),
        note: 'Como en el laboratorio real, acoplar fuera de sincronismo provoca un golpe de corriente y de par (y puede disparar el interruptor), y si el par supera el máximo que permite la excitación la máquina pierde el sincronismo y el relé abre Q2.'
    };
    var PAL = ['#ffd60a', '#2ee6ff', '#ff9f43', '#c39bff', '#ff5fd2', '#4dff88', '#ff5b5b', '#9be15d', '#f4f4f4', '#5ec8ff', '#ffb3c7', '#d4a373'];
    /* Canales del osciloscopio en el modo libre: uno por cada instrumento / máquina del lienzo */
    function freeChannels(lab) {
        var out = [], k = 0;
        function add(key, l, u, d, t, g) { out.push(chn(key, l, u, PAL[k++ % PAL.length], d, t, g)); }
        lab.comps.forEach(function (c) {
            var id = c.id, n = id.replace('c', '#');
            function r(rd) { return rd.comps && rd.comps[id] || {}; }
            switch (c.type) {
                case 'wm': add('P' + id, 'W' + n, 'W', 0, 'Vatímetro ' + n, function (rd) { return r(rd).P || 0; }); break;
                case 'am': add('I' + id, 'A' + n, 'A', 3, 'Amperímetro de c.a. ' + n, function (rd) { return r(rd).v || 0; }); break;
                case 'vm': add('U' + id, 'V' + n, 'V', 1, 'Voltímetro de c.a. ' + n, function (rd) { return r(rd).v || 0; }); break;
                case 'adc': case 'adc3': add('I' + id, 'A' + n, 'A', 3, 'Amperímetro de c.c. ' + n, function (rd) { return r(rd).v || 0; }); break;
                case 'vdc': add('U' + id, 'V' + n, 'V', 1, 'Voltímetro de c.c. ' + n, function (rd) { return r(rd).v || 0; }); break;
                case 'exc': add('X' + id, 'Iexc' + n, 'A', 3, 'Corriente de la fuente de excitación ' + n, function (rd) { return Math.abs(r(rd).I || 0); }); break;
                case 'dyno':
                    add('n' + id, 'n' + n, 'min⁻¹', 0, 'Velocidad (dinamómetro ' + n + ')', function (rd) { return r(rd).n || 0; });
                    add('T' + id, 'T' + n, 'N·m', 2, 'Par (dinamómetro ' + n + ')', function (rd) { return r(rd).T || 0; });
                    break;
                case 'im': case 'dcm': case 'sm':
                    add('n' + id, 'n' + n, 'min⁻¹', 0, 'Velocidad de la máquina ' + n, function (rd) { return r(rd).n || 0; });
                    if (c.type === 'sm') add('F' + id, 'If' + n, 'A', 3, 'Corriente de excitación de la síncrona ' + n, function (rd) { return Math.abs(r(rd).If || 0); });
                    break;
            }
        });
        if (!out.length) out.push(chn('none', '—', '', '#9fd8b8', 0, 'Sin instrumentos', function () { return 0; }));
        return out;
    }
    MACHINES.libre = {
        key: 'vemlab-free1', title: 'Modo libre', free: true,
        catalog: [{ id: 'free', name: 'Montaje libre' }], def: 'free',
        label: function () { return 'Montaje libre'; },
        make: function () { return new VEM.FreeLab(); }, Bench: VEM.FreeBench,
        restore: function (lab, s) {
            if (s.free && s.free.comps) lab.load(s.free);
            else lab.load(VEM.FreeBench.TEMPLATES[1].data);
        },
        persist: function (lab, bench) { return { free: lab.persist(), view: bench ? bench.view : null }; },
        modelChanged: function () { },
        scope: function (lab) {
            var CH = freeChannels(lab), on = {};
            CH.slice(0, 3).forEach(function (c) { on[c.k] = 1; });
            var hasAC = lab.comps.some(function (c) { return c.type === 'am' || c.type === 'vm'; });
            return { CH: CH, defaultOn: on, xy: { x: CH[0].k, y: (CH[1] || CH[0]).k }, modes: hasAC ? ['trend', 'wave', 'xyg'] : ['trend', 'xyg'] };
        },
        status: function (lab) { return freeStatus(lab); },
        statusOff: function (lab) { return freeStatus(lab); },
        help: '<li><b>Componentes.</b> Añádelos con el menú «Añadir» de la barra superior (aparecen en el centro de la vista). Arrástralos por cualquier zona que no sea un mando o un borne. Para quitar uno, selecciónalo y pulsa «Quitar componente» (o <kbd>Supr</kbd>). Las plantillas cargan montajes de ejemplo sin cablear.</li>' +
            '<li><b>Lienzo.</b> Arrastra el fondo para desplazarte; rueda del ratón o pellizco para acercar y alejar; «Encuadrar» muestra todo el montaje.</li>' +
            '<li><b>Ejes.</b> Cada máquina (y el dinamómetro) tiene un extremo de eje: pulsa el de una y después el de otra para acoplarlas mecánicamente. Las máquinas acopladas giran juntas (inercias y pares se suman). Doble clic sobre el acoplamiento para soltarlo. Solo con las máquinas paradas.</li>' +
            HELP_COMMON_CABLES.replace(/<li><b>Fuente\.<\/b>[^]*?<\/li>/, '') +
            '<li><b>Aparamenta.</b> Contactores (polos 1-2, 3-4, 5-6, auxiliares 13-14 NA y 21-22 NC, bobina A1-A2 a 230 V ~), relé térmico (ajuste Ir, contactos 95-96 NC y 97-98 NA, rearme RESET), magnetotérmico tripolar (curva C, calibre seleccionable), temporizador a la conexión (15-16 NC y 15-18 NA temporizados), pulsadores de marcha y paro, seta de emergencia, selector y pilotos. Alimenta el mando con la <b>fuente de mando 230 V ~</b>. Los pulsadores se accionan mientras los mantienes pulsados.</li>' +
            '<li><b>Fuentes.</b> Cada fuente tiene su interruptor (la de excitación, su contactor). El neutro N de todas las fuentes trifásicas es la misma red. Mientras haya alguna fuente conectada no se puede modificar el montaje.</li>' +
            '<li><b>Todo vale.</b> Cualquier combinación de fuentes, máquinas, transformadores, cargas e instrumentos se calcula: un motor de c.c. moviendo un alternador que se acopla a la red, un motor asíncrono arrastrando una dinamo, dos asíncronas acopladas, un transformador alimentando un motor… Si te equivocas, pasa lo mismo que en el laboratorio: disparos, sobrevelocidad o lecturas absurdas.</li>' +
            '<li><b>Compartir.</b> «Exportar» guarda el montaje en un archivo .json; «Importar» lo carga en otro equipo. Así un docente puede preparar un montaje y repartirlo a sus alumnos.</li>' +
            HELP_SCOPE.replace('</li>', ' En el modo libre cada instrumento y cada máquina tiene su canal.</li>'),
        note: 'El modo libre usa los mismos modelos que los bancos guiados. Cada componente lleva un número (#) que aparece en el registro, en las protecciones y en los canales del osciloscopio.'
    };
    function freeStatus(lab) {
        var n = lab.comps.length, on = lab.comps.filter(function (c) { return VEM.Free.TYPES[c.type].source && (c.type === 'exc' ? c.st.ex.on : c.st.on); }).length;
        var spin = lab.comps.filter(function (c) { return c.st.w && Math.abs(c.st.w) > 0.1 && c.type !== 'dyno'; }).length;
        return 'Modo libre · ' + n + ' componente' + (n === 1 ? '' : 's') + ' · ' + (on ? on + ' fuente' + (on === 1 ? '' : 's') + ' conectada' + (on === 1 ? '' : 's') : 'fuentes desconectadas') + (spin ? ' · ' + spin + ' máquina' + (spin === 1 ? '' : 's') + ' girando' : '');
    }
    function syncStatus(lab, r) {
        var n = Math.abs(r.n);
        if (n < 1) return lab.q2 ? 'Q2 cerrado con la máquina parada' : 'Red conectada · máquina parada';
        if (lab.q2 && lab.on) return 'Acoplada a la red · ' + Math.round(n) + ' min⁻¹';
        return 'Alternador girando · ' + Math.round(n) + ' min⁻¹ · ' + VEM.fmtN(r.fG, 2) + ' Hz' + (r.uG > 5 ? ' · ' + Math.round(r.uG) + ' V' : '');
    }
    function dcStatus(lab, r, on) {
        var n = Math.abs(r.n), gen = r.T < -0.05 && n >= 1;
        if (n < 1) return lab.out.A ? (Math.abs(r.ia) > 0.3 * lab.P.In ? 'Inducido alimentado con el rotor parado' : 'Fuente conectada') : 'Fuente conectada · salida de inducido desconectada';
        return (gen ? 'Máquina arrastrada (generador)' : 'Máquina girando') + ' · ' + Math.round(n) + ' min⁻¹' + (r.n < 0 ? ' (antihorario)' : '') + (on ? '' : ' · Q1 abierto');
    }
    var route = (location.hash || '').replace('#', '');
    var MC = MACHINES[route] || null;
    var KEY = MC ? MC.key : 'vemlab4';

    function load() {
        var s = null;
        try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
        s = s || {};
        if (!MC) return s;
        s.model = s.model || s.motor;
        s.model = MC.catalog.some(function (m) { return m.id === s.model; }) ? s.model : MC.def;
        s.cables = Array.isArray(s.cables) ? s.cables : [];
        s.bridges = s.bridges || {};
        s.variac = +s.variac || 0;
        s.color = s.color || 'red';
        return s;
    }
    var st = load();
    var lab, bench, scope, saveTimer = null, drawTick = 0;
    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
            var o = Object.assign({
                model: st.model, seenHelp: st.seenHelp, color: bench ? bench.color : st.color,
                cables: lab.cables, bridges: lab.bridges, variac: lab.variac, scope: st.scope, ui: st.ui
            }, MC.persist(lab, bench));
            try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* sin almacenamiento */ }
        }, 200);
    }
    function model() { return MC.catalog.filter(function (m) { return m.id === st.model; })[0]; }

    /* ---------------- Avisos y registro ---------------- */
    function toast(msg, type) {
        var box = $('toasts'), t = document.createElement('div');
        t.className = 'toast ' + (type || '');
        t.setAttribute('role', 'status');
        t.textContent = msg;
        box.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('in'); });
        setTimeout(function () { t.classList.remove('in'); setTimeout(function () { t.remove(); }, 300); }, type === 'warn' ? 4200 : 2600);
    }
    function log(msg, type) {
        var ol = $('log'), li = document.createElement('li'), d = new Date();
        li.className = type || '';
        li.innerHTML = '<time>' + d.toLocaleTimeString('es-ES') + '</time>';
        li.appendChild(document.createTextNode(msg));
        ol.insertBefore(li, ol.firstChild);
        while (ol.children.length > 40) ol.lastChild.remove();
        if (type && $('win-log').hidden) $('btn-log').classList.add('has-news');
    }
    function alarm(msg) {
        var a = $('alarm');
        if (!msg) { a.hidden = true; return; }
        a.innerHTML = '<strong>⚠ Disparo de protección</strong><span>' + msg + '</span><button type="button" class="btn btn-sm" id="alarm-ok">Entendido</button>';
        a.hidden = false;
        $('alarm-ok').onclick = function () { a.hidden = true; };
    }

    /* ---------------- Barra superior ---------------- */
    function renderModelSelect() {
        var sel = $('motor-sel');
        sel.innerHTML = MC.catalog.map(function (m) {
            return '<option value="' + m.id + '"' + (m.id === st.model ? ' selected' : '') + '>' + MC.label(m) + '</option>';
        }).join('');
        sel.onchange = function () {
            if (lab.on) { toast('Abre el interruptor Q1 antes de cambiar de máquina.', 'warn'); sel.value = st.model; return; }
            st.model = sel.value;
            lab.setModel(model());
            MC.modelChanged(lab);
            bench.modelChanged();
            log('Máquina de ensayo cambiada a ' + MC.label(lab.P) + '.');
            save();
        };
    }

    /* ---------------- Ventanas de medida de los vatímetros ----------------
       Como un analizador de potencia moderno: P, S, Q, factor de potencia, φ, U, I y f
       de la tensión y la corriente que ve ese vatímetro. */
    var meterWins = {};
    function meterInfo(o) {
        if (meterWins[o.key]) { closeMeter(o.key); return; }
        var stage = $('app').querySelector('.bench-stage'), sr = stage.getBoundingClientRect();
        var w = document.createElement('section');
        w.className = 'wm-pop';
        w.setAttribute('aria-label', o.title + ': medidas');
        w.innerHTML = '<div class="wm-pop-head"><span>' + o.title + '</span><button type="button" class="float-x" aria-label="Cerrar">×</button></div>' +
            '<div class="wm-pop-body">' + [['P', 'W', 'Potencia activa'], ['S', 'VA', 'Potencia aparente'], ['Q', 'var', 'Potencia reactiva'], ['FP', '', 'Factor de potencia'],
                ['φ', '°', 'Desfase entre U e I'], ['U', 'V', 'Tensión eficaz'], ['I', 'A', 'Corriente eficaz'], ['f', 'Hz', 'Frecuencia']].map(function (r) {
                return '<div class="wm-row" title="' + r[2] + '"><span class="wm-k">' + r[0] + '</span><span class="wm-v" data-v="' + r[0] + '">—</span><span class="wm-u" data-u="' + r[0] + '">' + r[1] + '</span></div>';
            }).join('') + '</div><p class="wm-pop-note">Valores de la U y la I que ve este vatímetro.</p>';
        stage.appendChild(w);
        var m = meterWins[o.key] = { el: w, get: o.get, title: o.title };
        var x = Math.min(sr.width - w.offsetWidth - 6, Math.max(6, o.x - sr.left + 6)), y = Math.min(sr.height - w.offsetHeight - 6, Math.max(6, o.y - sr.top));
        w.style.left = x + 'px'; w.style.top = y + 'px'; w.style.zIndex = ++zTop;
        w.querySelector('.float-x').onclick = function () { closeMeter(o.key); };
        var head = w.querySelector('.wm-pop-head'), d = null;
        w.addEventListener('pointerdown', function () { w.style.zIndex = ++zTop; });
        head.addEventListener('pointerdown', function (e) {
            if (e.target.closest('button')) return;
            e.preventDefault(); head.setPointerCapture(e.pointerId);
            d = { x: e.clientX - w.offsetLeft, y: e.clientY - w.offsetTop };
        });
        head.addEventListener('pointermove', function (e) {
            if (!d) return;
            w.style.left = Math.max(0, Math.min(stage.clientWidth - w.offsetWidth, e.clientX - d.x)) + 'px';
            w.style.top = Math.max(0, Math.min(stage.clientHeight - w.offsetHeight, e.clientY - d.y)) + 'px';
        });
        head.addEventListener('pointerup', function () { d = null; });
        head.addEventListener('pointercancel', function () { d = null; });
        updateMeter(m, lab.readings());
    }
    function closeMeter(k) { var m = meterWins[k]; if (m) { m.el.remove(); delete meterWins[k]; } }
    function updateMeter(m, rd) {
        var r = m.get(rd);
        if (!r) { closeMeter(Object.keys(meterWins).filter(function (k) { return meterWins[k] === m; })[0]); return; }
        var nz = VEM.Bench.noisy, ol = r.I > 20 || r.U > 600, out = {};
        if (ol) ['P', 'S', 'Q', 'FP', 'φ', 'U', 'I', 'f'].forEach(function (k) { out[k] = 'OL'; });
        else {
            var U = r.U < 0.05 ? 0 : nz(r.U, 0.0008), I = r.I < 0.0005 ? 0 : nz(r.I, 0.001), P = nz(r.P, 0.0015), Q = nz(r.Q || 0, 0.002);
            var S = U * I, f = r.f !== undefined ? r.f : (rd.fw || 50);
            if (Math.abs(P) < 0.05) P = 0;
            if (Math.abs(Q) < 0.05) Q = 0;
            out.P = fN(P, 1); out.S = fN(S, 1); out.U = fN(U, 1); out.I = fN(I, 3);
            /* Convenio de 4 cuadrantes (IEC): importar = sentido I* → I. Cuadrantes I y III inductivos,
               II y IV capacitivos (un generador que exporta P y absorbe Q trabaja en el II: capacitivo) */
            var hasQ = Math.abs(Q) > 0.05, hasP = Math.abs(P) > 0.05;
            var ch = out.ch = !hasQ ? '' : !hasP ? (Q > 0 ? 'ind.' : 'cap.') : (P * Q > 0 ? 'ind.' : 'cap.');
            if (hasP || hasQ) {
                var cuad = P >= 0 ? (Q >= 0 ? 'I' : 'IV') : (Q >= 0 ? 'II' : 'III');
                out.note = 'Cuadrante ' + cuad + ' · P ' + (!hasP ? 'nula' : P > 0 ? 'importada' : 'exportada') + ' · Q ' + (!hasQ ? 'nula' : Q > 0 ? 'importada' : 'exportada');
            }
            out.Q = fN(Q, 1);
            if (S > 0.5) {
                var pf = Math.max(-1, Math.min(1, P / S)), phi = Math.atan2(Q, P) * 180 / Math.PI;
                out.FP = fN(pf, 3); out['φ'] = fN(phi, 1);
            } else { out.FP = '—'; out['φ'] = '—'; }
            out.f = U > 1 && f ? fN(f, 2) : '—';
        }
        m.el.querySelectorAll('[data-v]').forEach(function (s) { s.textContent = out[s.getAttribute('data-v')]; });
        /* carácter inductivo / capacitivo junto a Q y al factor de potencia */
        var car = ol ? '' : (out.ch || '');
        m.el.querySelector('.wm-pop-note').textContent = !ol && out.note ? out.note + ' (importar: de I* hacia I)' : 'Valores de la U y la I que ve este vatímetro.';
        m.el.querySelector('[data-u="Q"]').textContent = 'var' + (car ? ' ' + car : '');
        m.el.querySelector('[data-u="FP"]').textContent = out.FP === '—' ? '' : car;
    }

    /* Osciloscopio del modo libre: se rehace cuando cambian los componentes */
    function rebuildScope() {
        if (!MC.free) return;
        scope = new VEM.Scope($('scope'), lab, Object.assign({ settings: st.scope, save: save, toast: toast }, MC.scope(lab)));
        if (VEM.app) VEM.app.scope = scope;
        scope.draw(true);
    }
    function renderFreeTools() {
        var T = VEM.Free.TYPES, sel = $('motor-sel');
        sel.closest('.motor-pick').querySelector('.motor-lbl').textContent = 'Añadir';
        var cats = {}, html = '<option value="">Añadir componente…</option>';
        Object.keys(T).forEach(function (k) { (cats[T[k].cat] = cats[T[k].cat] || []).push(k); });
        ['Fuentes', 'Instrumentos', 'Aparamenta', 'Cargas', 'Máquinas'].forEach(function (cat) {
            html += '<optgroup label="' + cat + '">';
            (cats[cat] || []).forEach(function (k) {
                var t = T[k];
                if (t.catalog) t.catalog().forEach(function (m) {
                    var extra = m.Pn ? fN(m.Pn / 1000, 1) + ' kW' : m.Sn ? fN(m.Sn / 1000, 1) + ' kVA' : '';
                    html += '<option value="' + k + '|' + m.id + '">' + t.name + ' · ' + m.name + (extra ? ' · ' + extra : '') + '</option>';
                });
                else html += '<option value="' + k + '">' + t.name + '</option>';
            });
            html += '</optgroup>';
        });
        sel.innerHTML = html;
        sel.setAttribute('aria-label', 'Añadir componente');
        sel.onchange = function () {
            var v = sel.value; sel.value = '';
            if (!v) return;
            var p = v.split('|');
            bench.addComp(p[0], p[1]);
        };
        var grp = document.createElement('div');
        grp.className = 'tool-group lab-only free-tools';
        grp.innerHTML = '<button type="button" class="btn btn-ghost btn-sm" id="btn-rmcomp" hidden>Quitar componente</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="btn-fit" title="Ver todo el montaje">Encuadrar</button>' +
            '<select id="tpl-sel" class="btn btn-ghost btn-sm" aria-label="Plantillas"><option value="">Plantillas…</option>' +
            VEM.FreeBench.TEMPLATES.map(function (t, i) { return '<option value="' + i + '">' + t.name + '</option>'; }).join('') + '</select>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="btn-export" title="Guardar el montaje en un archivo">Exportar</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" id="btn-import" title="Cargar un montaje desde un archivo">Importar</button>' +
            '<input type="file" id="file-import" accept=".json,application/json" hidden>';
        sel.closest('.motor-pick').after(grp);
        $('btn-rmcomp').onclick = function () { if (bench.selComp) bench.removeComp(bench.selComp); };
        $('btn-fit').onclick = function () { bench.fit(); };
        $('tpl-sel').onchange = function () {
            var i = $('tpl-sel').value; $('tpl-sel').value = '';
            if (i === '') return;
            if (lab.on) { bench.canEdit(); return; }
            var t = VEM.FreeBench.TEMPLATES[+i];
            if (lab.comps.length && !window.confirm('¿Sustituir el montaje actual por la plantilla «' + t.name + '»?')) return;
            loadFree(t.data, 'Plantilla cargada: ' + t.name + '.');
        };
        $('btn-export').onclick = function () {
            var o = Object.assign({ vemlab: 'montaje-libre', version: 1, fecha: new Date().toISOString() }, lab.persist());
            var blob = new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' });
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = 'vemlab-montaje.json';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
            log('Montaje exportado a vemlab-montaje.json.');
        };
        $('btn-import').onclick = function () { if (lab.on) { bench.canEdit(); return; } $('file-import').click(); };
        $('file-import').onchange = function () {
            var fl = $('file-import').files[0];
            if (!fl) return;
            var rdr = new FileReader();
            rdr.onload = function () {
                try {
                    var o = JSON.parse(rdr.result);
                    if (!o || !Array.isArray(o.comps)) throw new Error('formato');
                    loadFree(o, 'Montaje importado: ' + fl.name + '.');
                } catch (e) { toast('El archivo no es un montaje de VEMLAB válido.', 'warn'); }
                $('file-import').value = '';
            };
            rdr.readAsText(fl);
        };
    }
    function loadFree(data, msg) {
        bench.snapshotAll();
        lab.load(data);
        bench.selComp = null; bench.sel = -1;
        bench.renderAll(); bench.fit();
        rebuildScope();
        log(msg); save();
    }

    function renderColors() {
        var box = $('colors');
        box.innerHTML = VEM.Bench.COLORS.map(function (c) {
            return '<button type="button" class="swatch' + (c.id === bench.color ? ' on' : '') + '" data-c="' + c.id + '" style="--c:' + c.c + '" title="Cable ' + c.name.toLowerCase() + '" aria-label="Cable ' + c.name.toLowerCase() + '"></button>';
        }).join('');
        box.querySelectorAll('[data-c]').forEach(function (b) {
            b.onclick = function () { bench.setColor(b.getAttribute('data-c')); renderColors(); save(); };
        });
    }

    function applyTheme(t) {
        if (t) document.documentElement.setAttribute('data-theme', t);
        var cur = document.documentElement.getAttribute('data-theme');
        var dark = cur ? cur === 'dark' : window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
        $('btn-theme').textContent = dark ? '☀' : '☾';
        $('btn-theme').title = dark ? 'Tema claro' : 'Tema oscuro';
        return dark;
    }

    /* ---------------- Bucle ---------------- */
    var last = 0, acc = 0, rd = null;
    function loop(t) {
        try { frame(t); } catch (e) { if (window.console) console.error(e); }
        requestAnimationFrame(loop);
    }
    function frame(t) {
        var dt = last ? (t - last) / 1000 : 0.016;
        last = t;
        dt = Math.min(dt, 0.1);
        lab.step(dt);
        rd = lab.readings();
        bench.frame(dt, rd);
        scope.sample(dt, rd);
        if (++drawTick % 2 === 0) scope.draw();
        acc += dt;
        if (acc >= 0.25) {
            acc = 0;
            bench.displays(rd);
            status(rd);
            Object.keys(meterWins).forEach(function (k) { if (meterWins[k]) updateMeter(meterWins[k], rd); });
        }
        lab.events.splice(0).forEach(function (e) {
            if (e.type === 'trip') { log(e.msg, 'bad'); alarm(e.msg); }
            else if (e.type === 'dyno') { if (bench.dynoChanged) bench.dynoChanged(); save(); }
            else { log(e.msg, 'warn'); toast(e.msg, 'warn'); }
        });
    }

    var lastStatus = '';
    function status(r) {
        var s, cls;
        var off = !lab.on && MC.statusOff ? MC.statusOff(lab, r) : null;
        if (MC.free) { s = MC.status(lab, r); cls = lab.on ? 'on' : (lab.trip ? 'bad' : ''); if (lab.trip && !lab.on) s = 'Protección disparada · ' + s; var h = '<span class="dot ' + cls + '"></span>' + s; if (h !== lastStatus) { $('status').innerHTML = h; lastStatus = h; } return; }
        if (lab.on) { s = MC.status(lab, r); cls = 'on'; }
        else if (off) { s = off; cls = 'on'; }
        else { s = lab.trip ? 'Protección disparada · fuente desconectada' : 'Fuente desconectada · puedes modificar el montaje'; cls = lab.trip ? 'bad' : ''; }
        var html = '<span class="dot ' + cls + '"></span>' + s;
        if (html !== lastStatus) { $('status').innerHTML = html; lastStatus = html; }
    }

    /* ---------------- Ventanas flotantes: osciloscopio y registro ----------------
       En horizontal flotan sobre el banco y se arrastran por la cabecera.
       En vertical (tablet de pie) se apilan bajo el banco. */
    var WIN = { scope: 'win-scope', log: 'win-log' }, BTN = { scope: 'btn-scope', log: 'btn-log' };
    var portrait = window.matchMedia ? matchMedia('(orientation: portrait)') : { matches: false };
    var zTop = 10;
    function ui() { return st.ui = st.ui || {}; }
    var MIN = { scope: { w: 480, h: 230 }, log: { w: 260, h: 120 } };
    function clampWin(k) {
        var w = $(WIN[k]), app = $('app'), stage = app.querySelector('.bench-stage');
        if (w.hidden) return;
        if (portrait.matches) { w.style.width = w.style.height = ''; w.classList.remove('sized'); return; }
        var pos = ui()[k + 'Pos'], size = ui()[k + 'Size'], W = stage.clientWidth, H = stage.clientHeight;
        if (size) {   /* tamaño elegido por el usuario, sin salirse del banco */
            w.style.width = Math.max(Math.min(MIN[k].w, W - 12), Math.min(W - 12, size.w)) + 'px';
            w.style.height = Math.max(Math.min(MIN[k].h, H - 12), Math.min(H - 12, size.h)) + 'px';
            w.classList.add('sized');
        }
        var ww = w.offsetWidth, wh = w.offsetHeight;
        var x, y;
        if (pos) { x = pos.x * W - ww / 2; y = pos.y * H - wh / 2; }
        else if (k === 'scope') { x = (W - ww) / 2; y = H - wh - 8; }       /* abajo, centrado */
        else { x = 8; y = H - wh - 8; }                                      /* abajo a la izquierda */
        x = Math.max(6, Math.min(W - ww - 6, x));
        y = Math.max(6, Math.min(H - wh - 6, y));
        w.style.left = x + 'px'; w.style.top = y + 'px';
    }
    function rememberPos(k) {
        var w = $(WIN[k]), stage = $('app').querySelector('.bench-stage');
        ui()[k + 'Pos'] = { x: (w.offsetLeft + w.offsetWidth / 2) / stage.clientWidth, y: (w.offsetTop + w.offsetHeight / 2) / stage.clientHeight };
    }
    function showWin(k, on) {
        var w = $(WIN[k]);
        w.hidden = !on;
        ui()[k] = !!on;
        $(BTN[k]).setAttribute('aria-pressed', on ? 'true' : 'false');
        if (k === 'log' && on) $('btn-log').classList.remove('has-news');
        if (on) { w.style.zIndex = ++zTop; clampWin(k); if (k === 'scope') scope.draw(true); }
        save();
    }
    function dragWin(k) {
        var w = $(WIN[k]), head = w.querySelector('.float-head'), d = null;
        w.addEventListener('pointerdown', function () { w.style.zIndex = ++zTop; });
        head.addEventListener('pointerdown', function (e) {
            if (portrait.matches || e.target.closest('button')) return;
            e.preventDefault();
            head.setPointerCapture(e.pointerId);
            d = { x: e.clientX - w.offsetLeft, y: e.clientY - w.offsetTop };
            w.classList.add('dragging');
        });
        head.addEventListener('pointermove', function (e) {
            if (!d) return;
            w.style.left = (e.clientX - d.x) + 'px'; w.style.top = (e.clientY - d.y) + 'px';
        });
        function end() {
            if (!d) return;
            d = null; w.classList.remove('dragging');
            rememberPos(k); clampWin(k); save();
        }
        head.addEventListener('pointerup', end);
        head.addEventListener('pointercancel', end);
        /* cambiar el tamaño con el asa de la esquina */
        var grip = w.querySelector('.float-grip'), rs = null;
        grip.addEventListener('pointerdown', function (e) {
            if (portrait.matches) return;
            e.preventDefault(); e.stopPropagation();
            grip.setPointerCapture(e.pointerId);
            rs = { x: e.clientX, y: e.clientY, w: w.offsetWidth, h: w.offsetHeight };
            w.classList.add('resizing');
        });
        grip.addEventListener('pointermove', function (e) {
            if (!rs) return;
            var stage = $('app').querySelector('.bench-stage');
            var nw = Math.max(MIN[k].w, Math.min(stage.clientWidth - w.offsetLeft - 6, rs.w + e.clientX - rs.x));
            var nh = Math.max(MIN[k].h, Math.min(stage.clientHeight - w.offsetTop - 6, rs.h + e.clientY - rs.y));
            w.style.width = nw + 'px'; w.style.height = nh + 'px';
            w.classList.add('sized');
            if (k === 'scope') scope.draw(true);
        });
        function endResize() {
            if (!rs) return;
            rs = null; w.classList.remove('resizing');
            ui()[k + 'Size'] = { w: w.offsetWidth, h: w.offsetHeight };
            rememberPos(k); clampWin(k); save();
            if (k === 'scope') scope.draw(true);
        }
        grip.addEventListener('pointerup', endResize);
        grip.addEventListener('pointercancel', endResize);
        /* doble clic en el asa: tamaño por defecto */
        grip.addEventListener('dblclick', function () {
            delete ui()[k + 'Size'];
            w.style.width = w.style.height = ''; w.classList.remove('sized');
            clampWin(k); save(); if (k === 'scope') scope.draw(true);
        });
    }
    function initWindows() {
        Object.keys(WIN).forEach(function (k) {
            $(BTN[k]).onclick = function () { showWin(k, $(WIN[k]).hidden); };
            $(WIN[k]).querySelector('[data-close]').onclick = function () { showWin(k, false); };
            dragWin(k);
        });
        var u = ui();
        showWin('scope', u.scope === undefined ? portrait.matches : u.scope);
        showWin('log', !!u.log);
        var relayout = function () { clampWin('scope'); clampWin('log'); scope.draw(true); };
        window.addEventListener('resize', relayout);
        if (portrait.addEventListener) portrait.addEventListener('change', function () {
            ['scope', 'log'].forEach(function (k) { var w = $(WIN[k]); if (portrait.matches) { w.style.left = w.style.top = ''; } });
            relayout();
        });
    }

    function applyThemeInit() {
        var t = null;
        try { t = localStorage.getItem('vemlab4.theme'); } catch (e) { t = null; }
        applyTheme(t);
        $('btn-theme').onclick = function () {
            var nt = applyTheme() ? 'light' : 'dark';
            applyTheme(nt);
            try { localStorage.setItem('vemlab4.theme', nt); } catch (e) { /* nada */ }
        };
    }

    /* ---------------- Portada: elegir máquina ---------------- */
    function initLanding() {
        document.body.classList.add('is-landing');
        document.title = 'VEMLAB · Laboratorio virtual de máquinas eléctricas';
        $('landing').hidden = false;
        $('app').hidden = true;
        applyThemeInit();
    }

    function init() {
        window.addEventListener('hashchange', function () { location.reload(); });
        if (!MC) { initLanding(); return; }
        document.body.classList.add('is-lab');
        $('landing').hidden = true;
        $('brand-sub').textContent = 'Laboratorio virtual · ' + MC.title;
        document.title = 'VEMLAB · ' + MC.title;
        $('help-list').innerHTML = MC.help;
        $('help-note').textContent = MC.note;
        lab = MC.make(model());
        var T = lab.terminals;
        lab.cables = st.cables.filter(function (c) { return T.indexOf(c.a) >= 0 && T.indexOf(c.b) >= 0; });
        lab.bridges = st.bridges;
        lab.variac = Math.min(1, Math.max(0, st.variac));
        MC.restore(lab, st);
        lab.rewire();
        var hooks = {
            view: MC.free ? st.view || null : null,
            structure: function () { rebuildScope(); },
            compSelection: function (id) { var b = $('btn-rmcomp'); if (b) b.hidden = !id; },
            meterInfo: meterInfo,
            changed: function () { save(); },
            toast: toast, log: log,
            hover: function (s) { $('hover').textContent = s || 'Pulsa un borne y después otro para tender un cable. Clic en un cable para seleccionarlo; doble clic o Supr para quitarlo. Ctrl+Z deshace.'; },
            selection: function (i) {
                var b = $('btn-del');
                if (b) b.hidden = i < 0;
            }
        };
        bench = new MC.Bench($('bench'), lab, hooks);
        bench.color = st.color;
        hooks.hover(null);
        st.scope = st.scope || {};
        scope = new VEM.Scope($('scope'), lab, Object.assign({ settings: st.scope, save: save, toast: toast }, typeof MC.scope === 'function' ? MC.scope(lab) : MC.scope));
        initWindows();
        if (MC.free) { document.body.classList.add('is-free'); renderFreeTools(); } else renderModelSelect();
        renderColors();
        $('btn-undo').onclick = function () { bench.undo(); };
        $('btn-clear').onclick = function () {
            if (!lab.cables.length) return;
            if (lab.on) { bench.canEdit(); return; }
            if (window.confirm('¿Quitar todos los cables del banco?')) bench.clearCables();
        };
        $('btn-del').onclick = function () { bench.removeCable(bench.sel); };
        $('btn-help').onclick = function () { $('help').showModal(); };
        $('help-close').onclick = function () { $('help').close(); };
        $('btn-home').onclick = function () {
            if (lab.on && !window.confirm('La fuente está conectada. ¿Salir del banco? (se desconectará)')) return;
            lab.switchOff(); save();
            location.hash = '';
        };
        applyThemeInit();
        log(MC.free ? 'Modo libre preparado: ' + lab.comps.length + ' componentes. Fuentes desconectadas.' : 'Banco preparado: ' + MC.label(lab.P) + '. Fuente desconectada.');
        if (!st.seenHelp && !/[?&]nohelp/.test(location.search)) { $('help').showModal(); st.seenHelp = true; save(); }
        VEM.app = { lab: lab, bench: bench, scope: scope, st: st, machine: route, rebuildScope: rebuildScope };
        requestAnimationFrame(loop);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
