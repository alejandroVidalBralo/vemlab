/* ============================================
   VEMLAB Application
   State management, simulation loop, UI updates
   ============================================ */
(function () {
    'use strict';

    var Physics = window.VEMLAB.Physics;
    var Challenges = window.VEMLAB.Challenges;

    /* ---------- Constants ---------- */
    var TIME_SCALE = 0.05;
    var PHYSICS_SUBSTEPS = 20;
    var FRAME_DT = 0.015;
    var DT = (FRAME_DT * TIME_SCALE) / PHYSICS_SUBSTEPS;

    /* ---------- State ---------- */
    var state = {
        mode: 'auto',
        view: 'scope',
        mechSpeedRad: 0,
        visualRotorAngle: 0,
        time: 0,
        torqueM: 0,
        torqueL: 0,
        currentAmp: 0,
        pfAngle: 0,
        efficiency: 0,
        pOut: 0,
        isStalled: false,
        circuitData: { PR1: 0, QX1: 0, PRc: 0, QXm: 0, PR2: 0, QX2: 0, PRext: 0, PConv: 0 }
    };

    var motorStaticParams = {};
    var frameCount = 0;
    var chartCurve = null;

    /* ---------- DOM Cache ---------- */
    var dom = {};

    function cacheDom() {
        dom.v_line = document.getElementById('v_line');
        dom.freq = document.getElementById('freq');
        dom.poles = document.getElementById('poles');
        dom.inertia = document.getElementById('inertia');
        dom.r1 = document.getElementById('r1');
        dom.x1 = document.getElementById('x1');
        dom.r2 = document.getElementById('r2');
        dom.x2 = document.getElementById('x2');
        dom.rc = document.getElementById('rc');
        dom.xm = document.getElementById('xm');
        dom.load_type = document.getElementById('load_type');
        dom.load_slider = document.getElementById('load_slider');
        dom.rext_slider = document.getElementById('rext_slider');
        dom.slip_slider = document.getElementById('slip_slider');
        dom.scopeCanvas = document.getElementById('scopeCanvas');
        dom.ctxScope = dom.scopeCanvas.getContext('2d');
    }

    /* ---------- Parameter Management ---------- */
    function applyMotorChanges() {
        motorStaticParams = {
            V_line: parseFloat(dom.v_line.value) || 400,
            f: parseFloat(dom.freq.value) || 50,
            p: parseFloat(dom.poles.value) || 4,
            J: parseFloat(dom.inertia.value) || 0.1,
            R1: parseFloat(dom.r1.value),
            X1: parseFloat(dom.x1.value),
            R2: parseFloat(dom.r2.value),
            X2: parseFloat(dom.x2.value),
            Rc: parseFloat(dom.rc.value),
            Xm: parseFloat(dom.xm.value)
        };
        var btn = document.getElementById('btnApply');
        if (btn) {
            btn.classList.add('blink-success');
            setTimeout(function () { btn.classList.remove('blink-success'); }, 500);
        }
        updateStaticChart();
        renderChallenge();
    }

    function getParams() {
        return Object.assign({}, motorStaticParams, {
            Rext: parseFloat(dom.rext_slider.value),
            LoadBase: parseFloat(dom.load_slider.value),
            LoadType: dom.load_type.value,
            ManualSlip: parseFloat(dom.slip_slider.value)
        });
    }

    function getStaticParams() {
        return Object.assign({}, motorStaticParams, { Rext: 0 });
    }

    /* ---------- Mode & View ---------- */
    function setMode(m) {
        state.mode = m;
        document.getElementById('btn-auto').className = 'mode-option ' + (m === 'auto' ? 'active' : '');
        document.getElementById('btn-manual').className = 'mode-option ' + (m === 'manual' ? 'active' : '');
        document.getElementById('ctrl-auto').className = 'control-section ' + (m === 'auto' ? 'active' : '');
        document.getElementById('ctrl-manual').className = 'control-section ' + (m === 'manual' ? 'active' : '');
    }

    function toggleView() {
        var canvas = dom.scopeCanvas;
        var circuit = document.getElementById('circuitView');
        if (state.view === 'scope') {
            state.view = 'circuit';
            canvas.style.display = 'none';
            circuit.style.display = 'block';
        } else {
            state.view = 'scope';
            canvas.style.display = 'block';
            circuit.style.display = 'none';
        }
    }

    function resetSimulation() { state.mechSpeedRad = 0; }

    /* ---------- Physics Step ---------- */
    function runPhysicsStep() {
        var p = getParams();
        var w_syn = (4 * Math.PI * p.f) / p.p;

        if (state.mode === 'manual') {
            var currentS = p.ManualSlip;
            state.mechSpeedRad = w_syn * (1 - currentS);
            var elec = Physics.solveAsyncCircuit(currentS, p);
            state.torqueM = elec.Torque;
            state.torqueL = Physics.getLoadTorque(state.mechSpeedRad, w_syn, p.LoadBase, p.LoadType);
            state.currentAmp = elec.I1;
            state.pfAngle = elec.pfAngle;
            state.efficiency = elec.Eff;
            state.pOut = elec.P_out;
            state.circuitData = elec.circuit;
            state.isStalled = false;
            return;
        }

        for (var i = 0; i < PHYSICS_SUBSTEPS; i++) {
            var s = (w_syn - state.mechSpeedRad) / w_syn;
            var elec2 = Physics.solveAsyncCircuit(s, p);
            var loadT = Physics.getLoadTorque(state.mechSpeedRad, w_syn, p.LoadBase, p.LoadType);
            var damping = 0.05 * state.mechSpeedRad;
            var T_net = elec2.Torque - loadT - damping;
            var alpha = T_net / p.J;
            state.mechSpeedRad += alpha * DT;
            if (state.mechSpeedRad < 0) state.mechSpeedRad = 0;
            if (state.mechSpeedRad > w_syn * 1.02) state.mechSpeedRad = w_syn * 1.02;

            if (i === PHYSICS_SUBSTEPS - 1) {
                state.torqueM = elec2.Torque;
                state.torqueL = loadT;
                state.currentAmp = elec2.I1;
                state.pfAngle = elec2.pfAngle;
                state.efficiency = elec2.Eff;
                state.pOut = elec2.P_out;
                state.circuitData = elec2.circuit;
            }
        }
        state.isStalled = (Math.abs(state.mechSpeedRad) < 2 && state.torqueM < state.torqueL);
    }

    /* ---------- Chart ---------- */
    function initChart() {
        var ctx = document.getElementById('curveCanvas').getContext('2d');
        chartCurve = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [
                    { label: 'Motor', data: [], borderColor: '#6366f1', borderWidth: 2, pointRadius: 0, tension: 0.4, order: 2 },
                    { label: 'Carga', data: [], borderColor: '#ef4444', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, order: 3 },
                    { label: 'Operación', type: 'scatter', data: [], backgroundColor: '#fff', borderColor: '#10b981', borderWidth: 3, pointRadius: 8, order: 1 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 0 },
                plugins: {
                    legend: { labels: { color: '#94a3b8', font: { family: "'Inter', sans-serif", size: 11 } } },
                    tooltip: { enabled: false }
                },
                scales: {
                    x: { type: 'linear', title: { display: true, text: 'RPM', color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } },
                    y: { min: 0, title: { display: true, text: 'Par (Nm)', color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } }
                }
            }
        });
    }

    function updateStaticChart() {
        if (!chartCurve) return;
        var p = getParams();
        var w_syn = (4 * Math.PI * p.f) / p.p;
        var synRPM = (w_syn * 60) / (2 * Math.PI);
        var dataM = [];
        for (var rpm = 0; rpm <= synRPM * 1.05; rpm += 15) {
            var rad = (rpm * 2 * Math.PI) / 60;
            var s_calc = (w_syn - rad) / w_syn;
            var pt = Physics.solveAsyncCircuit(s_calc, p);
            dataM.push({ x: rpm, y: pt.Torque });
        }
        chartCurve.data.datasets[0].data = dataM;
        chartCurve.options.scales.x.max = synRPM * 1.1;
    }

    /* ---------- UI Updates ---------- */
    function updateUI(w_syn, s) {
        var rpm = (state.mechSpeedRad * 60) / (2 * Math.PI);
        document.getElementById('kpi_rpm').innerText = rpm.toFixed(0);
        document.getElementById('kpi_current').innerText = state.currentAmp.toFixed(1);
        document.getElementById('kpi_torque').innerText = state.torqueM.toFixed(1);
        document.getElementById('kpi_eff').innerText = state.efficiency.toFixed(1) + '%';
        document.getElementById('kpi_pout').innerText = (state.pOut / 1000).toFixed(2);
        document.getElementById('kpi_pf').innerText = Math.cos(state.pfAngle).toFixed(2);
        document.getElementById('slip_val_ui').innerText = (s * 100).toFixed(1) + '%';

        var statusDiv = document.getElementById('motor_status');
        if (state.isStalled) {
            statusDiv.innerText = '⚠️ CALADO';
            statusDiv.className = 'status-tag st-stall';
        } else {
            statusDiv.innerText = '✓ EN MARCHA';
            statusDiv.className = 'status-tag st-run';
        }

        var angleDeg = (state.visualRotorAngle * 180) / Math.PI;
        document.getElementById('rotorVis').style.transform = 'rotate(' + angleDeg + 'deg)';

        if (state.view === 'circuit') {
            var d = state.circuitData;
            var fmt = Physics.formatPower;
            document.getElementById('val_pr1').textContent = fmt(d.PR1) + 'W';
            document.getElementById('val_qx1').textContent = fmt(d.QX1) + 'VAR';
            document.getElementById('val_prc').textContent = fmt(d.PRc) + 'W';
            document.getElementById('val_qxm').textContent = fmt(d.QXm) + 'VAR';
            document.getElementById('val_pr2').textContent = fmt(d.PR2) + 'W';
            document.getElementById('val_qx2').textContent = fmt(d.QX2) + 'VAR';
            document.getElementById('val_prext').textContent = fmt(d.PRext) + 'W';
            document.getElementById('val_pmech').textContent = fmt(d.PConv) + 'W';
        }
    }

    /* ---------- Scope Renderer ---------- */
    function renderScope() {
        var canvas = dom.scopeCanvas;
        var ctx = dom.ctxScope;
        var w = canvas.width;
        var h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        for (var gy = 0; gy < h; gy += h / 6) {
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
        }

        function drawWave(color, phaseOffset, amplitudeRatio, lw) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            for (var x = 0; x < w; x++) {
                var t = (x * 0.02) - (state.time * 0.5);
                var y = (h / 2) + Math.sin(t - phaseOffset) * (h / 2.5) * amplitudeRatio;
                if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        drawWave('#3b82f6', 0, 0.8, 2);
        var visualAmp = (state.currentAmp / 50) * 0.8;
        if (visualAmp > 0.95) visualAmp = 0.95;
        drawWave('#ef4444', state.pfAngle, visualAmp, 3);

        // Legend
        ctx.font = '10px Inter, sans-serif';
        ctx.fillStyle = '#3b82f6';
        ctx.fillText('— Tensión', 10, 18);
        ctx.fillStyle = '#ef4444';
        ctx.fillText('— Corriente', 80, 18);
    }

    /* ---------- Challenge UI ---------- */
    function renderChallenge() {
        var ch = Challenges.getCurrent();
        var params = getStaticParams();
        var diff = Challenges.getDifficultyLabel(ch.difficulty);

        document.getElementById('ch-title').textContent = ch.title;
        document.getElementById('ch-badge').textContent = diff.text;
        document.getElementById('ch-badge').className = 'challenge-badge ' + diff.cls;
        document.getElementById('ch-description').innerHTML = Challenges.formatDescription(ch, params);
        document.getElementById('ch-unit').textContent = ch.unit || '—';
        document.getElementById('ch-input').value = '';
        document.getElementById('ch-feedback').className = 'challenge-feedback';
        document.getElementById('ch-feedback').textContent = '';
        document.getElementById('ch-hints-area').innerHTML = '';

        var idx = Challenges.getCurrentIndex();
        var total = Challenges.getCount();
        document.getElementById('ch-progress-text').textContent = (idx + 1) + ' / ' + total;

        // Progress bar
        var solved = Challenges.getSolvedCount();
        var pct = (solved / total) * 100;
        document.getElementById('ch-progress-fill').style.width = pct + '%';
        document.getElementById('ch-solved-count').textContent = solved + ' / ' + total + ' resueltos';

        // Solved indicator
        if (Challenges.isSolved(ch.id)) {
            document.getElementById('ch-input').placeholder = '✓ Resuelto';
            document.getElementById('ch-input').style.borderColor = '#10b981';
        } else {
            document.getElementById('ch-input').placeholder = 'Tu respuesta...';
            document.getElementById('ch-input').style.borderColor = '';
        }
    }

    function submitChallenge() {
        var ch = Challenges.getCurrent();
        var params = getStaticParams();
        var userVal = parseFloat(document.getElementById('ch-input').value);
        if (isNaN(userVal)) return;

        var result = Challenges.checkAnswer(ch, userVal, params);
        var fb = document.getElementById('ch-feedback');
        if (result.correct) {
            fb.className = 'challenge-feedback feedback-correct';
            fb.innerHTML = '✅ ¡Correcto! ' + Challenges.formatExplanation(ch, result.expected);
        } else {
            fb.className = 'challenge-feedback feedback-incorrect';
            fb.innerHTML = '❌ Incorrecto. Valor esperado: <strong>' + result.expected.toFixed(2) + ' ' + (ch.unit || '') + '</strong> (diferencia: ' + result.diff.toFixed(2) + ')';
        }
        // Update progress
        var solved = Challenges.getSolvedCount();
        var total = Challenges.getCount();
        document.getElementById('ch-progress-fill').style.width = ((solved / total) * 100) + '%';
        document.getElementById('ch-solved-count').textContent = solved + ' / ' + total + ' resueltos';
        if (Challenges.isSolved(ch.id)) {
            document.getElementById('ch-input').style.borderColor = '#10b981';
        }
    }

    function showHint() {
        var ch = Challenges.getCurrent();
        var hint = Challenges.getHint(ch);
        if (!hint) return;
        var area = document.getElementById('ch-hints-area');
        var div = document.createElement('div');
        div.className = 'challenge-hint visible';
        div.textContent = '💡 ' + hint;
        area.appendChild(div);
    }

    function navChallenge(dir) {
        Challenges.navigate(dir);
        renderChallenge();
    }

    /* ---------- Main Loop ---------- */
    function renderLoop() {
        runPhysicsStep();

        var timeStep = FRAME_DT * TIME_SCALE;
        state.time += timeStep;
        state.visualRotorAngle += state.mechSpeedRad * timeStep;
        frameCount++;

        var p = getParams();
        var w_syn = (4 * Math.PI * p.f) / p.p;
        var currentS = (w_syn - state.mechSpeedRad) / w_syn;

        updateUI(w_syn, currentS);

        if (state.view === 'scope') renderScope();

        if (frameCount % 5 === 0 && chartCurve) {
            var synRPM = (w_syn * 60) / (2 * Math.PI);
            var dataL = [];
            for (var rpm = 0; rpm <= synRPM * 1.05; rpm += 15) {
                var rad = (rpm * 2 * Math.PI) / 60;
                var ld = Physics.getLoadTorque(rad, w_syn, p.LoadBase, p.LoadType);
                dataL.push({ x: rpm, y: ld });
            }
            chartCurve.data.datasets[1].data = dataL;
            var currRPM = (state.mechSpeedRad * 60) / (2 * Math.PI);
            chartCurve.data.datasets[2].data = [{ x: currRPM, y: state.torqueM }];
            chartCurve.update('none');
        }

        requestAnimationFrame(renderLoop);
    }

    /* ---------- Event Binding ---------- */
    function bindEvents() {
        dom.load_slider.addEventListener('input', function (e) {
            document.getElementById('load_disp').innerText = e.target.value;
        });
        dom.slip_slider.addEventListener('input', function (e) {
            document.getElementById('slip_disp').innerText = e.target.value;
        });
        dom.rext_slider.addEventListener('input', function (e) {
            document.getElementById('rext_disp').innerText = parseFloat(e.target.value).toFixed(2);
            updateStaticChart();
        });

        document.querySelectorAll('.motor-input').forEach(function (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { applyMotorChanges(); e.target.blur(); }
            });
        });

        // Challenge events
        document.getElementById('ch-submit').addEventListener('click', submitChallenge);
        document.getElementById('ch-input').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submitChallenge();
        });
        document.getElementById('ch-hint-btn').addEventListener('click', showHint);
        document.getElementById('ch-prev').addEventListener('click', function () { navChallenge(-1); });
        document.getElementById('ch-next').addEventListener('click', function () { navChallenge(1); });
    }

    /* ---------- Init ---------- */
    function init() {
        cacheDom();
        Challenges.init();
        initChart();
        bindEvents();
        applyMotorChanges();
        renderChallenge();
        renderLoop();
    }

    // Export
    window.VEMLAB = window.VEMLAB || {};
    window.VEMLAB.App = {
        init: init,
        setMode: setMode,
        toggleView: toggleView,
        resetSimulation: resetSimulation,
        applyMotorChanges: applyMotorChanges,
        getStaticParams: getStaticParams
    };

    // Boot
    document.addEventListener('DOMContentLoaded', init);
})();
