/* =====================================================================
   VEMLAB · Modelo físico
   - Aritmética compleja y resolución de sistemas lineales complejos.
   - Máquina asíncrona trifásica: circuito equivalente exacto por bobina,
     resuelto por componentes simétricas (directa / inversa / homopolar),
     de modo que cualquier conexión (estrella, triángulo, falta de fase,
     secuencia invertida…) se comporta como en el laboratorio.
   - Saturación del circuito magnético (Xμ disminuye por encima de la
     tensión nominal).
   - Catálogo de motores de ensayo.
   ===================================================================== */
(function (root) {
    'use strict';
    var VEM = root.VEM = root.VEM || {};

    /* ---------------- Complejos ---------------- */
    function C(re, im) { return { re: re, im: im || 0 }; }
    var Cx = {
        C: C,
        add: function (a, b) { return C(a.re + b.re, a.im + b.im); },
        sub: function (a, b) { return C(a.re - b.re, a.im - b.im); },
        mul: function (a, b) { return C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re); },
        div: function (a, b) {
            var d = b.re * b.re + b.im * b.im;
            return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
        },
        inv: function (a) { var d = a.re * a.re + a.im * a.im; return C(a.re / d, -a.im / d); },
        scale: function (a, k) { return C(a.re * k, a.im * k); },
        conj: function (a) { return C(a.re, -a.im); },
        abs: function (a) { return Math.sqrt(a.re * a.re + a.im * a.im); },
        abs2: function (a) { return a.re * a.re + a.im * a.im; },
        polar: function (m, deg) { var t = deg * Math.PI / 180; return C(m * Math.cos(t), m * Math.sin(t)); }
    };
    VEM.Cx = Cx;

    /* Resuelve A·x = b (complejo) por eliminación gaussiana con pivote parcial.
       A: Float64Array n·n (re, im), b: Float64Array n (re, im). Modifica A y b. */
    VEM.solveComplex = function (n, Ar, Ai, br, bi) {
        var i, j, k;
        for (k = 0; k < n; k++) {
            var piv = k, best = Ar[k * n + k] * Ar[k * n + k] + Ai[k * n + k] * Ai[k * n + k];
            for (i = k + 1; i < n; i++) {
                var m = Ar[i * n + k] * Ar[i * n + k] + Ai[i * n + k] * Ai[i * n + k];
                if (m > best) { best = m; piv = i; }
            }
            if (best === 0) continue;
            if (piv !== k) {
                for (j = 0; j < n; j++) {
                    var t = Ar[k * n + j]; Ar[k * n + j] = Ar[piv * n + j]; Ar[piv * n + j] = t;
                    t = Ai[k * n + j]; Ai[k * n + j] = Ai[piv * n + j]; Ai[piv * n + j] = t;
                }
                var tb = br[k]; br[k] = br[piv]; br[piv] = tb;
                tb = bi[k]; bi[k] = bi[piv]; bi[piv] = tb;
            }
            var pr = Ar[k * n + k], pi = Ai[k * n + k], pd = pr * pr + pi * pi;
            var ir = pr / pd, ii = -pi / pd;
            for (i = k + 1; i < n; i++) {
                var ar = Ar[i * n + k], ai = Ai[i * n + k];
                if (ar === 0 && ai === 0) continue;
                var fr = ar * ir - ai * ii, fi = ar * ii + ai * ir;
                for (j = k; j < n; j++) {
                    var xr = Ar[k * n + j], xi = Ai[k * n + j];
                    Ar[i * n + j] -= fr * xr - fi * xi;
                    Ai[i * n + j] -= fr * xi + fi * xr;
                }
                br[i] -= fr * br[k] - fi * bi[k];
                bi[i] -= fr * bi[k] + fi * br[k];
            }
        }
        var xr = new Float64Array(n), xi = new Float64Array(n);
        for (i = n - 1; i >= 0; i--) {
            var sr = br[i], si = bi[i];
            for (j = i + 1; j < n; j++) {
                sr -= Ar[i * n + j] * xr[j] - Ai[i * n + j] * xi[j];
                si -= Ar[i * n + j] * xi[j] + Ai[i * n + j] * xr[j];
            }
            var dr = Ar[i * n + i], di = Ai[i * n + i], dd = dr * dr + di * di;
            if (dd === 0) { xr[i] = 0; xi[i] = 0; continue; }
            xr[i] = (sr * dr + si * di) / dd;
            xi[i] = (si * dr - sr * di) / dd;
        }
        return { re: xr, im: xi };
    };

    /* ---------------- Máquina asíncrona ---------------- */
    var SAT_C = 0.22, SAT_M = 7;           /* curva de magnetización */

    function ws(P) { return 2 * Math.PI * P.f / P.p; }

    /* Factor de saturación: Iμ = E/Xμ · g(E/En), con g(1) = 1 */
    function satG(x) { return (1 + SAT_C * Math.pow(Math.max(x, 0), SAT_M)) / (1 + SAT_C); }

    /* Admitancia de la rama de vacío con la f.e.m. E (módulo) */
    function magY(P, E, linear) {
        var g = linear ? 1 : satG(E / P.En);
        return C(1 / P.Rfe, -g / P.Xmu);
    }
    /* Admitancia de la rama del rotor: 1/(R2/s + jX2) = s/(R2 + j s X2) */
    function rotY(P, s) { return Cx.div(C(s), C(P.R2, s * P.X2)); }

    /* Impedancia de secuencia vista desde los bornes de una bobina */
    function seqZ(P, s, Ym) {
        return Cx.add(C(P.R1, P.X1), Cx.inv(Cx.add(Ym, rotY(P, s))));
    }
    function z0(P) { return C(P.R1, P.X1); }

    /* Pérdidas mecánicas (rozamiento + ventilación): par resistente.
       A velocidad de sincronismo disipan exactamente Pm. */
    function frictionTorque(P, w) {
        var w1 = ws(P);
        return P.Pm / w1 * (0.25 + 0.75 * Math.abs(w) / w1);
    }

    /* Funcionamiento equilibrado con tensión de bobina Vw (eficaz) y deslizamiento s.
       Devuelve magnitudes por bobina y totales. Itera la saturación. */
    function balanced(P, Vw, s, linear) {
        var E = Vw * 0.95, Ym, Z, I, Em, i;
        for (i = 0; i < 30; i++) {
            Ym = magY(P, E, linear);
            Z = seqZ(P, s, Ym);
            I = Cx.div(C(Vw), Z);
            Em = Cx.sub(C(Vw), Cx.mul(I, C(P.R1, P.X1)));
            var En = Cx.abs(Em);
            if (Math.abs(En - E) < 1e-9 * Vw) { E = En; break; }
            E = linear ? En : 0.5 * E + 0.5 * En;
        }
        var Y2 = rotY(P, s);
        var I2 = Cx.mul(Em, Y2);
        var Pag = 3 * Cx.abs2(Em) * (s * P.R2) / (P.R2 * P.R2 + s * s * P.X2 * P.X2);
        var w = ws(P) * (1 - s);
        var Tem = Pag / ws(P);
        var Tf = frictionTorque(P, w);
        var Tu = Tem - Tf;
        var P1 = 3 * Vw * I.re;
        return {
            s: s, V: Vw, I: Cx.abs(I), I2: Cx.abs(I2), E: E, P1: P1, Q1: -3 * Vw * I.im,
            cos: I.re / Cx.abs(I), Pag: Pag, Tem: Tem, Tu: Tu, w: w,
            n: 60 * P.f / P.p * (1 - s), Pu: Tu * w, eta: Tu * w / P1
        };
    }

    /* Deslizamiento con el que el par útil es T (rama estable). */
    function slipForTorque(P, Vw, T, linear) {
        var a = 1e-7, b, i;
        /* rama estable: hasta el deslizamiento de par máximo */
        var sm = P.R2 / Math.sqrt(P.R1 * P.R1 + Math.pow(P.X1 + P.X2, 2));
        b = Math.min(0.9, sm);
        if (balanced(P, Vw, b, linear).Tu < T) return NaN;
        for (i = 0; i < 90; i++) {
            var m = Math.sqrt(a * b);
            if (balanced(P, Vw, m, linear).Tu < T) a = m; else b = m;
        }
        return Math.sqrt(a * b);
    }

    /* ---------------- Catálogo ---------------- */
    /* Parámetros por BOBINA (por fase del devanado), referidos al estátor. */
    var CATALOG = [
        { id: 'M1', name: 'Motor A', Pn: 1500, Vwn: 230, f: 50, p: 2,
          R1: 4.6, X1: 5.6, R2: 3.9, X2: 6.4, Rfe: 2350, Xmu: 145, Pm: 32, J: 0.012, maker: 'VEM-LAB', code: '90L-4', ip: 'IP55', cls: 'F' },
        { id: 'M2', name: 'Motor B', Pn: 4000, Vwn: 230, f: 50, p: 2,
          R1: 1.42, X1: 2.3, R2: 1.15, X2: 3.0, Rfe: 1150, Xmu: 66, Pm: 70, J: 0.03, maker: 'VEM-LAB', code: '112M-4', ip: 'IP55', cls: 'F' },
        { id: 'M3', name: 'Motor C', Pn: 3000, Vwn: 400, f: 50, p: 1,
          R1: 4.9, X1: 6.4, R2: 4.0, X2: 8.0, Rfe: 3600, Xmu: 185, Pm: 95, J: 0.01, maker: 'VEM-LAB', code: '100L-2', ip: 'IP55', cls: 'F' }
    ];

    /* Completa los datos derivados y la placa de características. */
    function prepare(M) {
        var P = Object.assign({}, M);
        /* f.e.m. nominal en vacío (modelo lineal) para referenciar la saturación */
        P.En = 1;
        var nl = balanced(P, P.Vwn, 1e-5, true);
        P.En = nl.E;
        /* punto nominal: potencia útil = Pn */
        var a = 1e-4, b = 0.25;
        for (var i = 0; i < 80; i++) {
            var m = (a + b) / 2;
            if (balanced(P, P.Vwn, m).Pu < P.Pn) a = m; else b = m;
        }
        var r = balanced(P, P.Vwn, (a + b) / 2);
        var star = P.Vwn * Math.sqrt(3);
        P.rated = r;
        P.Iwn = r.I;
        P.plate = {
            Pn: P.Pn,
            Ud: Math.round(P.Vwn), Uy: Math.round(star / 10) * 10,           /* Δ / Y */
            Id: r.I * Math.sqrt(3), Iy: r.I,
            n: Math.round(r.n / 5) * 5, cos: r.cos, eta: r.eta, f: P.f, p: P.p,
            Tn: r.Tu, ns: 60 * P.f / P.p
        };
        /* conexión adecuada para una red de 400 V entre fases */
        P.netConn = P.Vwn < 300 ? 'Y' : 'D';
        return P;
    }

    VEM.Motor = {
        catalog: CATALOG, prepare: prepare, balanced: balanced, slipForTorque: slipForTorque,
        ws: ws, satG: satG, magY: magY, rotY: rotY, seqZ: seqZ, z0: z0, frictionTorque: frictionTorque
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = VEM;
})(typeof window !== 'undefined' ? window : globalThis);
