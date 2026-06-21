/**
 * CareerForge AI — Aptitude Practice Module
 * Consumes:
 *   GET  /api/aptitude            (?category, ?count, ?shuffle=true) — answers stripped
 *   GET  /api/aptitude/categories — category names + counts
 *   POST /api/aptitude/submit     — { answers: { "id": "B) ..." } } → graded results
 *
 * NOTE: The API strips `answer` and `explanation` from GET responses.
 * Server-side grading on submit returns both fields.
 * Answer format must match full option string exactly: e.g. "B) Rs. 1000"
 */
'use strict';

// ─── Category config ───────────────────────────────────────────────────────────
const CAT_CONFIG = {
    'Quantitative Aptitude': { icon: '🔢', short: 'Quant', color: 'var(--primary)' },
    'Logical Reasoning': { icon: '🧩', short: 'Logical', color: 'var(--secondary-dark)' },
    'Verbal Ability': { icon: '📝', short: 'Verbal', color: '#7C3AED' }
};

// ─── State ─────────────────────────────────────────────────────────────────────
const State = {
    // Setup
    categories: [],       // [{ name, count }]
    selectedCat: '',       // '' = all categories
    selectedCount: 10,

    // Quiz runtime
    questions: [],       // stripped questions from GET /api/aptitude
    currentIndex: 0,
    userAnswers: {},       // { id: optionString }  — filled during quiz
    markedForReview: new Set(),// question ids marked
    quizActive: false,
    quizSubmitted: false,

    // Timer
    timerSeconds: 30 * 60,
    timerInterval: null,

    // Results
    results: null,     // full response from POST /api/aptitude/submit
    leaveTarget: null,     // href to navigate to after leave confirmation
};

// ─── DOM cache ─────────────────────────────────────────────────────────────────
const El = {};

// ─── XSS helper ───────────────────────────────────────────────────────────────
function esc(str) {
    if (typeof str !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ─── Screen switcher ──────────────────────────────────────────────────────────
function showScreen(name) {
    ['screenSetup', 'screenQuiz', 'screenResults'].forEach(id => {
        document.getElementById(id).style.display = (id === name) ? 'block' : 'none';
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETUP SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

async function loadCategories() {
    try {
        const res = await API.get('/aptitude/categories');
        if (!res || !res.success) { showCatError(); return; }
        State.categories = res.categories;
        renderCatGrid();
    } catch (e) {
        console.error('Failed to load categories', e);
        showCatError();
    }
}

function showCatError() {
    El.catSelectGrid.innerHTML = '<div style="color:var(--danger);font-size:0.88rem;grid-column:1/-1">⚠️ Could not load categories. Please refresh.</div>';
}

function renderCatGrid() {
    const allCount = State.categories.reduce((s, c) => s + c.count, 0);
    const allCats = [{ name: '', count: allCount }].concat(State.categories);

    El.catSelectGrid.innerHTML = allCats.map(cat => {
        const cfg = CAT_CONFIG[cat.name] || { icon: '📚', short: 'All', color: 'var(--primary)' };
        const label = cat.name || 'All Categories';
        const isSelected = cat.name === State.selectedCat;
        return `
      <button class="cat-select-btn${isSelected ? ' selected' : ''}" data-cat="${esc(cat.name)}">
        <div class="cat-icon">${cfg.icon}</div>
        <div class="cat-name">${esc(label)}</div>
        <div class="cat-count">${cat.count} questions</div>
      </button>`;
    }).join('');

    El.catSelectGrid.querySelectorAll('.cat-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            State.selectedCat = btn.dataset.cat;
            El.catSelectGrid.querySelectorAll('.cat-select-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            updateStartBtn();
        });
    });

    // Default: select "All Categories"
    El.catSelectGrid.querySelector('[data-cat=""]')?.classList.add('selected');
    updateStartBtn();
}

function updateStartBtn() {
    El.startQuizBtn.disabled = false;
}

function initCountButtons() {
    document.querySelectorAll('.count-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.selectedCount = btn.dataset.count === 'all' ? 999 : parseInt(btn.dataset.count);
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// START QUIZ
// ═══════════════════════════════════════════════════════════════════════════════

async function startQuiz() {
    UI.setLoading(El.startQuizBtn, true, 'Loading questions...');
    try {
        const count = Math.min(State.selectedCount, 100);
        let url = `/aptitude?shuffle=true&count=${count}`;
        if (State.selectedCat) url += `&category=${encodeURIComponent(State.selectedCat)}`;

        const res = await API.get(url);
        UI.setLoading(El.startQuizBtn, false);

        if (!res || !res.success || !res.questions.length) {
            Toast.error('Could not load questions. Please try again.');
            return;
        }

        // Initialise state
        State.questions = res.questions;
        State.currentIndex = 0;
        State.userAnswers = {};
        State.markedForReview = new Set();
        State.quizActive = true;
        State.quizSubmitted = false;
        State.timerSeconds = 30 * 60;

        showScreen('screenQuiz');
        buildPalette();
        showQuestion(0);
        startTimer();

    } catch (e) {
        UI.setLoading(El.startQuizBtn, false);
        console.error('Start quiz error', e);
        Toast.error('Failed to start quiz. Check your connection.');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIMER
// ═══════════════════════════════════════════════════════════════════════════════

function startTimer() {
    clearInterval(State.timerInterval);
    State.timerInterval = setInterval(() => {
        State.timerSeconds--;
        renderTimer();
        if (State.timerSeconds <= 0) {
            clearInterval(State.timerInterval);
            Toast.warning('⏰ Time is up! Submitting automatically...');
            submitQuiz(true);
        }
    }, 1000);
}

function stopTimer() { clearInterval(State.timerInterval); }

function renderTimer() {
    const m = Math.floor(State.timerSeconds / 60);
    const s = State.timerSeconds % 60;
    const str = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    El.timerDisplay.textContent = str;
    El.timerDisplay.className = 'timer-display';
    if (State.timerSeconds <= 60) El.timerDisplay.classList.add('danger');
    else if (State.timerSeconds <= 300) El.timerDisplay.classList.add('warning');
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTION DISPLAY
// ═══════════════════════════════════════════════════════════════════════════════

function showQuestion(index) {
    const q = State.questions[index];
    if (!q) return;
    State.currentIndex = index;

    El.quizSkeleton.style.display = 'none';
    El.quizContent.style.display = 'block';

    const total = State.questions.length;
    const answered = Object.keys(State.userAnswers).length;
    const skipped = State.markedForReview.size;
    const pct = Math.round((answered / total) * 100);
    const isMarked = State.markedForReview.has(q.id);
    const savedAns = State.userAnswers[q.id] || null;

    // Header
    El.qNum.textContent = `Q${index + 1}`;
    El.qCat.textContent = q.category || '';
    El.qText.textContent = q.question;
    El.qStatus.textContent = isMarked ? '🔖 Marked for Review' : '';
    El.qStatus.style.color = isMarked ? 'var(--warning)' : '';

    // Progress bar
    El.progressLabel.textContent = `Question ${index + 1} of ${total}`;
    El.progressPct.textContent = pct + '%';
    El.quizProgressBar.style.width = pct + '%';
    El.chipAnswered.textContent = `✅ ${answered} Answered`;
    El.chipSkipped.textContent = `⏭️ ${skipped} Skipped`;

    // Nav state
    El.qPrevBtn.disabled = (index === 0);
    El.qNextBtn.disabled = (index === total - 1);

    // Clear btn
    El.clearBtn.style.display = savedAns ? 'inline-flex' : 'none';

    // Mark for review btn
    El.markReviewBtn.textContent = isMarked ? '🔖 Unmark' : '🔖 Mark for Review';

    // Render options
    renderOptions(q, savedAns);

    // Explanation: only shown if already answered in this session
    El.explanationBox.style.display = 'none';

    // Palette highlight
    El.paletteGrid.querySelectorAll('.pal-btn').forEach((btn, i) => {
        btn.classList.toggle('current', i === index);
    });

    updatePaletteBtn(index);
}

function renderOptions(q, savedAns) {
    El.optionsList.innerHTML = q.options.map(opt => {
        const letter = opt[0]; // 'A', 'B', 'C', 'D'
        const isSelected = savedAns === opt;
        return `
      <button class="mcq-option${isSelected ? ' selected' : ''}"
              data-option="${esc(opt)}"
              aria-label="Option ${esc(opt)}">
        <span class="opt-letter">${esc(letter)}</span>
        <span>${esc(opt.slice(3))}</span>
      </button>`;
    }).join('');

    El.optionsList.querySelectorAll('.mcq-option').forEach(btn => {
        btn.addEventListener('click', () => selectOption(q.id, btn.dataset.option));
    });
}

function selectOption(qId, optionStr) {
    if (State.quizSubmitted) return;

    // Toggle: clicking same option deselects
    if (State.userAnswers[qId] === optionStr) {
        delete State.userAnswers[qId];
    } else {
        State.userAnswers[qId] = optionStr;
    }

    // Re-render options
    const q = State.questions[State.currentIndex];
    renderOptions(q, State.userAnswers[q.id] || null);

    // Show/hide clear button
    El.clearBtn.style.display = State.userAnswers[qId] ? 'inline-flex' : 'none';

    // Update palette
    updatePaletteBtn(State.currentIndex);

    // Update chips
    const answered = Object.keys(State.userAnswers).length;
    El.chipAnswered.textContent = `✅ ${answered} Answered`;
    const pct = Math.round((answered / State.questions.length) * 100);
    El.quizProgressBar.style.width = pct + '%';
    El.progressPct.textContent = pct + '%';
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTION PALETTE
// ═══════════════════════════════════════════════════════════════════════════════

function buildPalette() {
    El.paletteGrid.innerHTML = State.questions.map((q, i) => `
    <button class="pal-btn" data-index="${i}" title="Question ${i + 1}">${i + 1}</button>
  `).join('');

    El.paletteGrid.querySelectorAll('.pal-btn').forEach(btn => {
        btn.addEventListener('click', () => showQuestion(parseInt(btn.dataset.index)));
    });
}

function updatePaletteBtn(index) {
    const q = State.questions[index];
    const btn = El.paletteGrid.querySelector(`[data-index="${index}"]`);
    if (!btn) return;
    btn.classList.remove('answered', 'skipped', 'current');
    if (index === State.currentIndex) btn.classList.add('current');
    if (State.userAnswers[q.id]) btn.classList.add('answered');
    else if (State.markedForReview.has(q.id)) btn.classList.add('skipped');
}

function refreshAllPalette() {
    State.questions.forEach((_, i) => updatePaletteBtn(i));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMIT
// ═══════════════════════════════════════════════════════════════════════════════

function openSubmitModal() {
    const total = State.questions.length;
    const answered = Object.keys(State.userAnswers).length;
    const unanswered = total - answered;
    El.submitModalBody.innerHTML = unanswered > 0
        ? `You have <strong style="color:var(--danger)">${unanswered} unanswered</strong> question${unanswered !== 1 ? 's' : ''} out of ${total}. Unanswered questions will be marked as skipped. Submit anyway?`
        : `You have answered all ${total} questions. Ready to submit?`;
    openModal('submitModal');
}

async function submitQuiz(auto = false) {
    closeModal('submitModal');
    stopTimer();
    State.quizActive = false;
    State.quizSubmitted = true;

    // Build answers payload — keys must be strings (JSON), values full option strings
    const answers = {};
    State.questions.forEach(q => {
        if (State.userAnswers[q.id]) {
            answers[String(q.id)] = State.userAnswers[q.id];
        }
    });

    UI.setLoading(El.submitQuizBtn, true, 'Submitting...');

    try {
        const res = await API.post('/aptitude/submit', { answers });
        UI.setLoading(El.submitQuizBtn, false);

        if (!res || !res.success) {
            Toast.error(res?.message || 'Submission failed. Please try again.');
            State.quizActive = true;
            State.quizSubmitted = false;
            startTimer();
            return;
        }

        State.results = res;
        showResultsScreen(res);

    } catch (e) {
        UI.setLoading(El.submitQuizBtn, false);
        console.error('Submit error', e);
        Toast.error('Could not submit quiz. Please check your connection.');
        State.quizActive = true;
        State.quizSubmitted = false;
        if (!auto) startTimer();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESULTS SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

function showResultsScreen(res) {
    showScreen('screenResults');

    const { score, correct, total, results } = res;
    const wrong = results.filter(r => !r.isCorrect && r.yourAnswer).length;
    const skipped = total - correct - wrong;
    const accuracy = correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;

    // Hero
    El.heroScore.textContent = score + '%';
    const label = score >= 80 ? '🌟 Excellent!' : score >= 60 ? '👍 Good work!' : score >= 40 ? '📈 Keep practising!' : '💪 More practice needed';
    El.heroLabel.textContent = label;
    El.scoreHero.style.background = score >= 80
        ? 'linear-gradient(135deg,#15803D,#16A34A)'
        : score >= 60 ? 'linear-gradient(135deg,var(--primary),var(--secondary))'
            : score >= 40 ? 'linear-gradient(135deg,#B45309,#D97706)'
                : 'linear-gradient(135deg,#B91C1C,#EF4444)';

    El.statCorrect.textContent = correct;
    El.statWrong.textContent = wrong;
    El.statSkippedR.textContent = skipped;
    El.statAccuracy.textContent = accuracy + '%';

    // Category breakdown
    const cats = {};
    results.forEach(r => {
        if (!cats[r.category]) cats[r.category] = { correct: 0, total: 0 };
        cats[r.category].total++;
        if (r.isCorrect) cats[r.category].correct++;
    });
    El.categoryBreakdown.innerHTML = Object.entries(cats).map(([cat, data]) => {
        const pct = Math.round((data.correct / data.total) * 100);
        const cfg = CAT_CONFIG[cat] || { icon: '📚', color: 'var(--primary)' };
        return `
      <div style="margin-bottom:14px">
        <div class="progress-label">
          <span style="font-size:0.85rem;font-weight:600">${cfg.icon} ${esc(cat)}</span>
          <span style="font-weight:700;color:${cfg.color}">${data.correct}/${data.total} (${pct}%)</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:0%;background:${cfg.color};transition:width 0.8s ease" data-target="${pct}"></div>
        </div>
      </div>`;
    }).join('');

    // Animate bars
    requestAnimationFrame(() => requestAnimationFrame(() => {
        El.categoryBreakdown.querySelectorAll('[data-target]').forEach(b => {
            b.style.width = b.dataset.target + '%';
        });
    }));

    // Render hidden review list
    renderReviewList(results, 'all');
    El.reviewCount.textContent = results.length;
    El.reviewSection.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVIEW
// ═══════════════════════════════════════════════════════════════════════════════

function renderReviewList(results, filter) {
    const filtered = filter === 'all' ? results
        : filter === 'correct' ? results.filter(r => r.isCorrect)
            : filter === 'wrong' ? results.filter(r => !r.isCorrect && r.yourAnswer)
                : results.filter(r => !r.yourAnswer);

    // Highlight active filter button
    ['filterAll', 'filterCorrect', 'filterWrong', 'filterSkipped'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.classList.toggle('btn-primary', btn.dataset.filter === filter);
        if (btn) btn.classList.toggle('btn-outline', btn.dataset.filter !== filter);
    });

    if (!filtered.length) {
        El.reviewList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎉</div><div class="empty-state-title">No questions in this filter</div></div>';
        return;
    }

    El.reviewList.innerHTML = filtered.map((r, idx) => {
        const cls = !r.yourAnswer ? 'skipped' : r.isCorrect ? 'correct' : 'wrong';
        const icon = !r.yourAnswer ? '⏭️' : r.isCorrect ? '✅' : '❌';
        const catCfg = CAT_CONFIG[r.category] || {};
        return `
      <div class="review-item ${cls}">
        <div class="review-cat-badge">${catCfg.icon || '📚'} ${esc(r.category)}</div>
        <div class="review-q">${icon} Q${idx + 1}: ${esc(r.question)}</div>
        <div class="review-answers">
          ${r.yourAnswer
                ? `<div class="review-answer-row"><span style="font-size:0.8rem;font-weight:700;color:var(--text-muted)">Your answer:</span> <span style="font-weight:600;color:${r.isCorrect ? 'var(--success)' : 'var(--danger)'}">${esc(r.yourAnswer)}</span></div>`
                : `<div class="review-answer-row"><span style="font-size:0.8rem;font-weight:700;color:var(--text-muted)">Not answered</span></div>`}
          ${!r.isCorrect
                ? `<div class="review-answer-row"><span style="font-size:0.8rem;font-weight:700;color:var(--text-muted)">Correct answer:</span> <span style="font-weight:600;color:var(--success)">${esc(r.correctAnswer)}</span></div>`
                : ''}
        </div>
        ${r.explanation ? `<div class="review-explanation">💡 ${esc(r.explanation)}</div>` : ''}
      </div>`;
    }).join('');
}

// Exposed globally so inline onclick= works (review filter buttons)
window.filterReview = function (filter) {
    if (!State.results) return;
    renderReviewList(State.results.results, filter);
};

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function openModal(id) {
    document.getElementById(id).classList.add('open');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE-PAGE PROTECTION
// ═══════════════════════════════════════════════════════════════════════════════

function initLeaveProtection() {
    // Intercept sidebar and navbar links during an active quiz
    document.querySelectorAll('.sidebar-link, .nav-logo').forEach(link => {
        link.addEventListener('click', e => {
            if (!State.quizActive) return;
            e.preventDefault();
            State.leaveTarget = link.getAttribute('href');
            openModal('leaveModal');
        });
    });

    // Browser back / refresh
    window.addEventListener('beforeunload', e => {
        if (!State.quizActive) return;
        e.preventDefault();
        e.returnValue = '';
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER UI (navbar + sidebar)
// ═══════════════════════════════════════════════════════════════════════════════

function initUserUI() {
    const user = Auth.getUser();
    if (!user) return;
    document.getElementById('navUserName').textContent = user.fullName?.split(' ')[0] || 'User';
    document.getElementById('sidebarName').textContent = user.fullName || 'User';
    document.getElementById('sidebarEmail').textContent = user.email || '';
    document.getElementById('sidebarAvatar').textContent = (user.fullName || 'U')[0].toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    Auth.requireAuth();
    ThemeManager.init();
    initUserUI();

    // ── Cache DOM references ─────────────────────────────────────────────────
    Object.assign(El, {
        // Setup
        catSelectGrid: document.getElementById('catSelectGrid'),
        startQuizBtn: document.getElementById('startQuizBtn'),
        // Quiz header
        timerDisplay: document.getElementById('timerDisplay'),
        progressLabel: document.getElementById('progressLabel'),
        progressPct: document.getElementById('progressPct'),
        quizProgressBar: document.getElementById('quizProgressBar'),
        chipAnswered: document.getElementById('chipAnswered'),
        chipSkipped: document.getElementById('chipSkipped'),
        submitQuizBtn: document.getElementById('submitQuizBtn'),
        // Question card
        quizSkeleton: document.getElementById('quizSkeleton'),
        quizContent: document.getElementById('quizContent'),
        qNum: document.getElementById('qNum'),
        qCat: document.getElementById('qCat'),
        qText: document.getElementById('qText'),
        qStatus: document.getElementById('qStatus'),
        optionsList: document.getElementById('optionsList'),
        explanationBox: document.getElementById('explanationBox'),
        explanationText: document.getElementById('explanationText'),
        // Navigation
        qPrevBtn: document.getElementById('qPrevBtn'),
        qNextBtn: document.getElementById('qNextBtn'),
        clearBtn: document.getElementById('clearBtn'),
        markReviewBtn: document.getElementById('markReviewBtn'),
        // Palette
        paletteGrid: document.getElementById('paletteGrid'),
        // Submit modal
        submitModalBody: document.getElementById('submitModalBody'),
        // Results
        scoreHero: document.getElementById('scoreHero'),
        heroScore: document.getElementById('heroScore'),
        heroLabel: document.getElementById('heroLabel'),
        statCorrect: document.getElementById('statCorrect'),
        statWrong: document.getElementById('statWrong'),
        statSkippedR: document.getElementById('statSkippedR'),
        statAccuracy: document.getElementById('statAccuracy'),
        categoryBreakdown: document.getElementById('categoryBreakdown'),
        reviewSection: document.getElementById('reviewSection'),
        reviewList: document.getElementById('reviewList'),
        reviewCount: document.getElementById('reviewCount'),
    });

    // ── Event listeners ─────────────────────────────────────────────────────

    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('mobile-open');
    });

    El.startQuizBtn.addEventListener('click', startQuiz);

    El.submitQuizBtn.addEventListener('click', openSubmitModal);

    El.qPrevBtn.addEventListener('click', () => {
        if (State.currentIndex > 0) showQuestion(State.currentIndex - 1);
    });

    El.qNextBtn.addEventListener('click', () => {
        if (State.currentIndex < State.questions.length - 1) showQuestion(State.currentIndex + 1);
    });

    El.clearBtn.addEventListener('click', () => {
        const q = State.questions[State.currentIndex];
        delete State.userAnswers[q.id];
        renderOptions(q, null);
        El.clearBtn.style.display = 'none';
        updatePaletteBtn(State.currentIndex);
        const answered = Object.keys(State.userAnswers).length;
        El.chipAnswered.textContent = `✅ ${answered} Answered`;
        const pct = Math.round((answered / State.questions.length) * 100);
        El.quizProgressBar.style.width = pct + '%';
        El.progressPct.textContent = pct + '%';
    });

    El.markReviewBtn.addEventListener('click', () => {
        const q = State.questions[State.currentIndex];
        if (State.markedForReview.has(q.id)) {
            State.markedForReview.delete(q.id);
            El.markReviewBtn.textContent = '🔖 Mark for Review';
            El.qStatus.textContent = '';
        } else {
            State.markedForReview.add(q.id);
            El.markReviewBtn.textContent = '🔖 Unmark';
            El.qStatus.textContent = '🔖 Marked for Review';
            El.qStatus.style.color = 'var(--warning)';
        }
        updatePaletteBtn(State.currentIndex);
        El.chipSkipped.textContent = `⏭️ ${State.markedForReview.size} Skipped`;
    });

    // Submit modal buttons
    document.getElementById('modalCancelBtn').addEventListener('click', () => closeModal('submitModal'));
    document.getElementById('modalConfirmBtn').addEventListener('click', () => submitQuiz(false));

    // Leave modal buttons
    document.getElementById('leaveStayBtn').addEventListener('click', () => closeModal('leaveModal'));
    document.getElementById('leaveConfirmBtn').addEventListener('click', () => {
        State.quizActive = false;
        stopTimer();
        closeModal('leaveModal');
        if (State.leaveTarget) window.location.href = State.leaveTarget;
    });

    // Close modals on overlay click
    ['submitModal', 'leaveModal'].forEach(id => {
        document.getElementById(id).addEventListener('click', e => {
            if (e.target === document.getElementById(id)) closeModal(id);
        });
    });

    // Results screen buttons
    document.getElementById('reviewBtn').addEventListener('click', () => {
        const section = El.reviewSection;
        section.style.display = section.style.display === 'none' ? 'block' : 'none';
        document.getElementById('reviewBtn').textContent =
            section.style.display === 'none' ? '📋 Review All Answers' : '🔼 Hide Review';
        if (section.style.display === 'block') {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    });

    document.getElementById('retakeBtn').addEventListener('click', () => {
        State.quizActive = false;
        showScreen('screenSetup');
    });

    // Keyboard: left/right arrows for navigation
    document.addEventListener('keydown', e => {
        if (!State.quizActive) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'ArrowLeft' && State.currentIndex > 0)
            showQuestion(State.currentIndex - 1);
        if (e.key === 'ArrowRight' && State.currentIndex < State.questions.length - 1)
            showQuestion(State.currentIndex + 1);
        // 1-4 keys for option selection
        const keyMap = { '1': 0, '2': 1, '3': 2, '4': 3 };
        if (keyMap[e.key] !== undefined) {
            const opts = El.optionsList.querySelectorAll('.mcq-option');
            if (opts[keyMap[e.key]]) opts[keyMap[e.key]].click();
        }
    });

    // ── Init ─────────────────────────────────────────────────────────────────
    initCountButtons();
    initLeaveProtection();
    loadCategories();
    showScreen('screenSetup');
});
