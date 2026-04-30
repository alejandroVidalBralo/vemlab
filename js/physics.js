/* ============================================
   VEMLAB Physics Engine
   Complex number arithmetic & circuit solvers
   ============================================ */
(function () {
    'use strict';

    class Complex {
        constructor(re, im) { this.re = re; this.im = im || 0; }
        add(c) { return new Complex(this.re + c.re, this.im + c.im); }
        sub(c) { return new Complex(this.re - c.re, this.im - c.im); }
        mult(c) {
            return new Complex(
                this.re * c.re - this.im * c.im,
                this.re * c.im + this.im * c.re
            );
        }
        div(c) {
            const den = c.re * c.re + c.im * c.im;
            if (den === 0) return new Complex(0, 0);
            return new Complex(
                (this.re * c.re + this.im * c.im) / den,
                (this.im * c.re - this.re * c.im) / den
            );
        }
        mag() { return Math.sqrt(this.re * this.re + this.im * this.im); }
        angle() { return Math.atan2(this.im, this.re); }
    }

    /**
     * Solve the T-model equivalent circuit of an asynchronous motor.
     * @param {number} slip - Motor slip (0..1)
     * @param {object} p   - Motor parameters
     * @returns {object} Electrical results
     */
    function solveAsyncCircuit(slip, p) {
        const V_phase = p.V_line / Math.sqrt(3);
        const w_sync = (4 * Math.PI * p.f) / p.p;

        let s = slip;
        if (Math.abs(s) < 1e-7) s = 1e-7;

        const R2_total = p.R2 + (p.Rext || 0);

        const Z1 = new Complex(p.R1, p.X1);
        const Zmag = new Complex(0, p.Rc * p.Xm).div(new Complex(p.Rc, p.Xm));
        const Z2 = new Complex(R2_total / s, p.X2);

        const Zp = Zmag.mult(Z2).div(Zmag.add(Z2));
        const Ztotal = Z1.add(Zp);

        const I1_mag = V_phase / Ztotal.mag();
        const pf_angle = Ztotal.angle();
        const pf = Math.cos(pf_angle);

        const E1_mag = I1_mag * Zp.mag();
        const I2_mag = E1_mag / Z2.mag();

        const P_in = Math.sqrt(3) * p.V_line * I1_mag * pf;
        const P_gap = 3 * I2_mag * I2_mag * (R2_total / s);
        const Torque = P_gap / w_sync;
        const w_actual = w_sync * (1 - s);
        const P_out = Torque * w_actual;
        const efficiency = (P_in > 0 && P_out > 0) ? (P_out / P_in) * 100 : 0;

        const PR1 = 3 * I1_mag * I1_mag * p.R1;
        const QX1 = 3 * I1_mag * I1_mag * p.X1;
        const PRc = 3 * E1_mag * E1_mag / p.Rc;
        const QXm = 3 * E1_mag * E1_mag / p.Xm;
        const PR2 = 3 * I2_mag * I2_mag * p.R2;
        const QX2 = 3 * I2_mag * I2_mag * p.X2;
        const PRext = 3 * I2_mag * I2_mag * (p.Rext || 0);
        const PConv = P_gap * (1 - s);

        return {
            I1: I1_mag, I2: I2_mag,
            pf: pf, pfAngle: pf_angle,
            Torque: Torque,
            P_in: P_in, P_out: P_out, P_gap: P_gap,
            Eff: efficiency, w_sync: w_sync,
            circuit: { PR1, QX1, PRc, QXm, PR2, QX2, PRext, PConv }
        };
    }

    function getLoadTorque(w, w_sync, base, type) {
        let ratio = w / w_sync;
        if (ratio < 0) ratio = 0;
        switch (type) {
            case 'constant': return base;
            case 'linear': return base * ratio;
            case 'quadratic': return base * ratio * ratio;
            default: return 0;
        }
    }

    function formatPower(val) {
        if (Math.abs(val) >= 1000) return (val / 1000).toFixed(2) + ' k';
        return val.toFixed(1) + ' ';
    }

    window.VEMLAB = window.VEMLAB || {};
    window.VEMLAB.Physics = {
        Complex: Complex,
        solveAsyncCircuit: solveAsyncCircuit,
        getLoadTorque: getLoadTorque,
        formatPower: formatPower
    };
})();
