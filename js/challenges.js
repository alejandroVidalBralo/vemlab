/* ============================================
   VEMLAB Challenge Engine
   Asynchronous motor challenges for students
   ============================================ */
(function () {
    'use strict';

    var Physics = null; // resolved at init

    var challenges = [
        {
            id: 1,
            title: 'Velocidad de Sincronismo',
            difficulty: 1,
            description: 'Un motor asíncrono trifásico tiene <strong>{poles} polos</strong> y se alimenta a <strong>{freq} Hz</strong>. Calcula la velocidad de sincronismo.',
            computeAnswer: function (p) { return (120 * p.f) / p.p; },
            unit: 'RPM',
            tolerance: 1,
            hints: [
                'La velocidad de sincronismo depende de la frecuencia y del número de polos.',
                'n_s = 120 · f / p'
            ],
            explanation: 'n_s = 120 · {freq} / {poles} = {answer} RPM'
        },
        {
            id: 2,
            title: 'Corriente de Arranque',
            difficulty: 2,
            description: 'Con los parámetros actuales del motor (<strong>sin resistencia externa</strong>), calcula la corriente de línea en el arranque (s = 1).',
            computeAnswer: function (p) {
                var result = Physics.solveAsyncCircuit(1.0, Object.assign({}, p, { Rext: 0 }));
                return result.I1;
            },
            unit: 'A',
            tolerance: 0.5,
            hints: [
                'En el arranque, el deslizamiento s = 1.',
                'Con s = 1, R2\'/s = R2\'.',
                'Resuelve el circuito equivalente completo.'
            ],
            explanation: 'Con s = 1 la impedancia del rotor es mínima → corriente máxima = {answer} A.'
        },
        {
            id: 3,
            title: 'Par de Arranque',
            difficulty: 2,
            description: 'Calcula el par electromagnético en el instante de arranque (s = 1), <strong>sin resistencia externa</strong>.',
            computeAnswer: function (p) {
                var result = Physics.solveAsyncCircuit(1.0, Object.assign({}, p, { Rext: 0 }));
                return result.Torque;
            },
            unit: 'Nm',
            tolerance: 1,
            hints: [
                'Usa el circuito equivalente con s = 1.',
                'T = P_gap / ω_s'
            ],
            explanation: 'Par de arranque = {answer} Nm.'
        },
        {
            id: 4,
            title: 'Deslizamiento de Par Máximo',
            difficulty: 2,
            description: 'Calcula el deslizamiento al que se produce el <strong>par máximo</strong> (s_max). Sin R externa.',
            computeAnswer: function (p) {
                return p.R2 / Math.sqrt(p.R1 * p.R1 + (p.X1 + p.X2) * (p.X1 + p.X2));
            },
            unit: '',
            tolerance: 0.005,
            hints: [
                'El par máximo ocurre cuando la potencia transferida al rotor es máxima.',
                's_max = R2\' / √(R1² + (X1 + X2\')²)'
            ],
            explanation: 's_max = {answer}'
        },
        {
            id: 5,
            title: 'Par Máximo',
            difficulty: 3,
            description: 'Calcula el <strong>par máximo</strong> que puede desarrollar el motor (sin R externa). Usa el simulador si lo necesitas.',
            computeAnswer: function (p) {
                var s_max = p.R2 / Math.sqrt(p.R1 * p.R1 + (p.X1 + p.X2) * (p.X1 + p.X2));
                var result = Physics.solveAsyncCircuit(s_max, Object.assign({}, p, { Rext: 0 }));
                return result.Torque;
            },
            unit: 'Nm',
            tolerance: 2,
            hints: [
                'Primero calcula s_max.',
                'Evalúa el circuito equivalente en s = s_max.',
                'T_max = 3·V²/(2·ω_s·(R1 + √(R1²+(X1+X2\')²)))'
            ],
            explanation: 'T_max = {answer} Nm'
        },
        {
            id: 6,
            title: 'Eficiencia en Carga Nominal',
            difficulty: 2,
            description: 'Si el motor opera con deslizamiento <strong>s = 0.03</strong>, ¿cuál es la eficiencia? Sin R externa.',
            computeAnswer: function (p) {
                var result = Physics.solveAsyncCircuit(0.03, Object.assign({}, p, { Rext: 0 }));
                return result.Eff;
            },
            unit: '%',
            tolerance: 0.5,
            hints: [
                'η = P_salida / P_entrada × 100',
                'P_salida = T · ω_mech, P_entrada = √3 · V_L · I_1 · cos(φ)'
            ],
            explanation: 'Eficiencia al 3% de deslizamiento = {answer}%.'
        },
        {
            id: 7,
            title: 'Efecto del Reóstato',
            difficulty: 3,
            description: 'Si añades <strong>3 Ω de resistencia externa</strong> al rotor, ¿cuál es el nuevo par de arranque? Compara con el desafío 3.',
            computeAnswer: function (p) {
                var result = Physics.solveAsyncCircuit(1.0, Object.assign({}, p, { Rext: 3 }));
                return result.Torque;
            },
            unit: 'Nm',
            tolerance: 1,
            hints: [
                'La resistencia externa se suma a R2\'.',
                'Evalúa el circuito con R2_total = R2\' + R_ext y s = 1.',
                'Compara: ¿el par de arranque aumentó o disminuyó?'
            ],
            explanation: 'Con R_ext = 3 Ω, el par de arranque cambia a {answer} Nm.'
        }
    ];

    /* ---------- Engine ---------- */
    var currentIndex = 0;
    var solved = {};      // id -> true
    var hintLevel = {};   // id -> number of hints shown

    function init() {
        Physics = window.VEMLAB.Physics;
        currentIndex = 0;
        solved = {};
        hintLevel = {};
    }

    function getCurrent() { return challenges[currentIndex]; }
    function getCount() { return challenges.length; }
    function getCurrentIndex() { return currentIndex; }
    function getSolvedCount() { return Object.keys(solved).length; }
    function isSolved(id) { return !!solved[id]; }

    function navigate(dir) {
        currentIndex += dir;
        if (currentIndex < 0) currentIndex = challenges.length - 1;
        if (currentIndex >= challenges.length) currentIndex = 0;
        return challenges[currentIndex];
    }

    function formatDescription(ch, params) {
        return ch.description
            .replace('{poles}', params.p)
            .replace('{freq}', params.f);
    }

    function formatExplanation(ch, answer) {
        var params = window.VEMLAB.App ? window.VEMLAB.App.getStaticParams() : {};
        return ch.explanation
            .replace('{answer}', answer.toFixed(2))
            .replace('{freq}', params.f || '')
            .replace('{poles}', params.p || '');
    }

    function checkAnswer(ch, userAnswer, params) {
        var correct = ch.computeAnswer(params);
        var diff = Math.abs(userAnswer - correct);
        var ok = diff <= ch.tolerance;
        if (ok) solved[ch.id] = true;
        return { correct: ok, expected: correct, diff: diff };
    }

    function getHint(ch) {
        var level = hintLevel[ch.id] || 0;
        if (level >= ch.hints.length) return null;
        hintLevel[ch.id] = level + 1;
        return ch.hints[level];
    }

    function getDifficultyLabel(d) {
        if (d === 1) return { text: 'Fácil', cls: 'badge-easy' };
        if (d === 2) return { text: 'Medio', cls: 'badge-medium' };
        return { text: 'Difícil', cls: 'badge-hard' };
    }

    window.VEMLAB = window.VEMLAB || {};
    window.VEMLAB.Challenges = {
        init: init,
        getCurrent: getCurrent,
        getCount: getCount,
        getCurrentIndex: getCurrentIndex,
        getSolvedCount: getSolvedCount,
        isSolved: isSolved,
        navigate: navigate,
        formatDescription: formatDescription,
        formatExplanation: formatExplanation,
        checkAnswer: checkAnswer,
        getHint: getHint,
        getDifficultyLabel: getDifficultyLabel
    };
})();
