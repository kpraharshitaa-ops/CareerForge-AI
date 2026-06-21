/**
 * CareerForge AI — HR Interview Prep
 * Consumes:
 *   GET  /api/interview/hr               (fetch questions, supports ?category, ?company, ?shuffle)
 *   GET  /api/interview/hr/categories    (populate category filter)
 *   POST /api/ai/evaluate-answer         (AI evaluation, requires JWT)
 */

'use strict';

// ─── State ─────────────────────────────────────────────────────────────────────
const State = {
    questions: [],   // current filtered question pool
    currentIndex: 0,    // index within questions[]
    currentQuestion: null, // the displayed question object
    session: {
        answered: 0,
        totalScore: 0,
        ratings: [],         // array of rating strings
        history: []          // { question, score, rating, category }
    }
};

// ─── DOM references (set once on DOMContentLoaded) ────────────────────────────
const El = {};

// ─── Rating helpers ────────────────────────────────────────────────────────────
const RATING_META = {
    'Excellent': { cls: 'excellent', icon: '🌟', scoreColor: 'var(--success)' },
    'Good': { cls: 'good', icon: '👍', scoreColor: 'var(--primary)' },
    'Average': { cls: 'average', icon: '📊', scoreColor: 'var(--warning)' },
    'Needs Improvement': { cls: 'needs', icon: '📈', scoreColor: 'var(--danger)' }
};

function getRatingMeta(rating) {
    return RATING_META[rating] || { cls: 'good', icon: '📊', scoreColor: 'var(--primary)' };
}

function scoreToColor(score) {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--primary)';
    if (score >= 40) return 'var(--warning)';
    return 'var(--danger)';
}

// ─── Show / hide skeleton vs content ─────────────────────────────────────────
function showQuestionSkeleton() {
    El.questionSkeleton.style.display = 'block';
    El.questionContent.style.display = 'none';
    El.evalSection.style.display = 'none';
}

function showQuestionContent() {
    El.questionSkeleton.style.display = 'none';
    El.questionContent.style.display = 'block';
}

// ─── Load categories into the filter dropdown ─────────────────────────────────
async function loadCategories() {
    try {
        const res = await API.get('/interview/hr/categories');
        if (!res || !res.success) return;
        const select = El.categoryFilter;
        // keep the "All Categories" option already in HTML
        res.categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            select.appendChild(opt);
        });
    } catch (err) {
        console.error('Failed to load HR categories:', err);
    }
}

// ─── Fetch questions from API ─────────────────────────────────────────────────
async function fetchQuestions({ category = '', company = '', shuffle = true } = {}) {
    showQuestionSkeleton();
    El.questionCounter.textContent = '';

    try {
        let qs = `/interview/hr?shuffle=${shuffle}`;
        if (category) qs += `&category=${encodeURIComponent(category)}`;
        if (company) qs += `&company=${encodeURIComponent(company)}`;

        const res = await API.get(qs);

        if (!res || !res.success || !res.questions.length) {
            showEmptyState('No questions found for this filter. Try a different category or company.');
            return;
        }

        State.questions = res.questions;
        State.currentIndex = 0;

        // Update total count in stats bar
        El.statTotal.textContent = res.total;

        // Update session mode label
        const modeLabel = [
            category || 'All Categories',
            company || ''
        ].filter(Boolean).join(' · ');
        El.sessionMode.textContent = modeLabel;

        displayQuestion(State.questions[0]);

    } catch (err) {
        console.error('Failed to fetch HR questions:', err);
        showEmptyState('Could not load questions. Please check your connection and try again.');
    }
}

// ─── Display a single question ────────────────────────────────────────────────
function displayQuestion(q) {
    if (!q) return;

    State.currentQuestion = q;

    // Update content
    El.qNumber.textContent = `Question ${State.currentIndex + 1} of ${State.questions.length}`;
    El.qText.textContent = q.question;
    El.qCategory.textContent = q.category || 'General';

    // Company tag
    if (q.company && q.company !== 'All') {
        El.qCompany.textContent = `🏢 ${q.company}`;
        El.qCompany.style.display = 'inline-flex';
    } else {
        El.qCompany.style.display = 'none';
    }

    // Coaching tip
    if (q.tip) {
        El.qTipText.textContent = q.tip;
        El.qTip.style.display = 'block';
    } else {
        El.qTip.style.display = 'none';
    }

    // Clear previous answer and evaluation
    El.answerInput.value = '';
    El.charCount.textContent = '0 / 2000 characters';
    El.charCount.className = 'char-count';
    El.evalSection.style.display = 'none';

    // Navigation button state
    El.prevBtn.disabled = (State.currentIndex === 0);
    El.nextBtn.disabled = (State.currentIndex >= State.questions.length - 1);

    // Re-enable submit button in case it was disabled
    El.submitBtn.disabled = false;
    if (El.submitBtn._originalText) {
        El.submitBtn.innerHTML = '🤖 Evaluate Answer';
    }

    showQuestionContent();

    // Scroll question card into view on mobile
    El.questionCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Navigate to index ────────────────────────────────────────────────────────
function goToIndex(index) {
    if (index < 0 || index >= State.questions.length) return;
    State.currentIndex = index;
    displayQuestion(State.questions[index]);
}

// ─── Show an empty / error state inside the question card ────────────────────
function showEmptyState(message) {
    El.questionSkeleton.style.display = 'none';
    El.questionContent.style.display = 'block';
    El.evalSection.style.display = 'none';

    El.qNumber.textContent = '';
    El.qText.textContent = message;
    El.qCategory.textContent = '';
    El.qCompany.style.display = 'none';
    El.qTip.style.display = 'none';
    El.answerInput.value = '';
    El.prevBtn.disabled = true;
    El.nextBtn.disabled = true;
    El.submitBtn.disabled = true;
    El.questionCounter.textContent = '';
}

// ─── Submit answer for AI evaluation ─────────────────────────────────────────
async function evaluateAnswer() {
    const answer = El.answerInput.value.trim();

    if (!answer || answer.length < 10) {
        Toast.warning('Please write at least a sentence before evaluating.');
        El.answerInput.focus();
        return;
    }

    if (!State.currentQuestion) return;

    UI.setLoading(El.submitBtn, true, 'Evaluating...');
    El.evalSection.style.display = 'none';

    try {
        const res = await API.post('/ai/evaluate-answer', {
            question: State.currentQuestion.question,
            answer: answer,
            questionType: 'hr'
        });

        UI.setLoading(El.submitBtn, false);

        if (!res || !res.success) {
            Toast.error(res?.message || 'Evaluation failed. Please try again.');
            return;
        }

        renderEvaluation(res.evaluation);
        updateSessionStats(res.evaluation);
        addToHistory(State.currentQuestion, res.evaluation);

    } catch (err) {
        UI.setLoading(El.submitBtn, false);
        console.error('Evaluate answer error:', err);
        Toast.error('Could not reach the evaluation service. Please try again.');
    }
}

// ─── Render evaluation panel ──────────────────────────────────────────────────
function renderEvaluation(ev) {
    const meta = getRatingMeta(ev.rating);

    // Rating pill
    El.ratingPill.textContent = `${meta.icon} ${ev.rating || 'Evaluated'}`;
    El.ratingPill.className = `rating-pill ${meta.cls}`;

    // Summary
    El.evalSummary.textContent = ev.summary || '';

    // Score cards
    const scores = [
        { label: 'Communication', value: ev.communicationScore || 0 },
        { label: 'Confidence', value: ev.confidenceScore || 0 },
        { label: 'Clarity', value: ev.clarityScore || 0 },
        { label: 'Professionalism', value: ev.professionalismScore || 0 }
    ];

    El.evalScoreCards.innerHTML = scores.map(s => `
    <div class="eval-score-card">
      <div class="eval-score-value" style="color:${scoreToColor(s.value)}">${s.value}</div>
      <div class="eval-score-label">${s.label}</div>
    </div>
  `).join('');

    // Overall score bar
    const overall = ev.overallScore || 0;
    El.overallScoreLabel.textContent = `${overall}%`;
    El.overallScoreLabel.style.color = scoreToColor(overall);

    // Animate the bar after DOM paint
    El.overallProgressBar.style.width = '0%';
    El.overallProgressBar.className = 'progress-fill';
    if (overall >= 80) El.overallProgressBar.classList.add('success');
    else if (overall < 40) El.overallProgressBar.classList.add('danger');
    else if (overall < 60) El.overallProgressBar.classList.add('warning');

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            El.overallProgressBar.style.width = `${overall}%`;
        });
    });

    // Strengths
    El.strengthsList.innerHTML = (ev.strengths || []).map(s => `
    <div class="feedback-item">
      <span class="fi-icon">✅</span>
      <span>${escHtml(s)}</span>
    </div>
  `).join('') || '<div class="feedback-item"><span class="fi-icon">ℹ️</span><span>No specific strengths noted.</span></div>';

    // Improvements
    El.improvementsList.innerHTML = (ev.improvements || []).map(s => `
    <div class="feedback-item">
      <span class="fi-icon">🔧</span>
      <span>${escHtml(s)}</span>
    </div>
  `).join('') || '<div class="feedback-item"><span class="fi-icon">ℹ️</span><span>Keep practicing!</span></div>';

    // Ideal answer
    El.idealAnswer.textContent = ev.idealAnswer || 'Not available.';

    // Responsive feedback grid
    applyFeedbackGridLayout();

    // Show evaluation section
    El.evalSection.style.display = 'block';
    El.evalSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Update session stats bar ─────────────────────────────────────────────────
function updateSessionStats(ev) {
    State.session.answered++;
    State.session.totalScore += (ev.overallScore || 0);
    State.session.ratings.push(ev.rating || '');

    El.statAnswered.textContent = State.session.answered;

    const avg = Math.round(State.session.totalScore / State.session.answered);
    El.statAvgScore.textContent = avg;
    El.statAvgScore.style.color = scoreToColor(avg);

    // Best rating = first in priority order
    const priority = ['Excellent', 'Good', 'Average', 'Needs Improvement'];
    for (const r of priority) {
        if (State.session.ratings.includes(r)) {
            const m = getRatingMeta(r);
            El.statBestRating.textContent = `${m.icon} ${r.split(' ')[0]}`;
            El.statBestRating.style.color = m.scoreColor;
            break;
        }
    }
}

// ─── Add entry to session history panel ───────────────────────────────────────
function addToHistory(q, ev) {
    const score = ev.overallScore || 0;
    const rating = ev.rating || '';
    const meta = getRatingMeta(rating);

    // Keep in-memory for potential future use
    State.session.history.unshift({ question: q, score, rating });

    // Build history item element
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
    <div class="history-item-q">${escHtml(q.question)}</div>
    <div class="history-item-meta">
      <div class="history-score-dot" style="background:${meta.scoreColor}"></div>
      <span style="font-size:0.75rem;font-weight:600;color:${meta.scoreColor}">${score}%</span>
      <span style="font-size:0.72rem;color:var(--text-muted)">·</span>
      <span style="font-size:0.75rem;color:var(--text-muted)">${escHtml(q.category || '')}</span>
    </div>
  `;

    // Click to jump back to this question
    item.addEventListener('click', () => {
        const idx = State.questions.findIndex(sq => sq.id === q.id);
        if (idx !== -1) {
            goToIndex(idx);
            El.evalSection.style.display = 'none';
        }
    });

    // Remove empty state placeholder if first entry
    const placeholder = El.historyList.querySelector('div[style*="text-align:center"]');
    if (placeholder) placeholder.remove();

    El.historyList.prepend(item);
    El.historyCount.textContent = `${State.session.history.length} answer${State.session.history.length !== 1 ? 's' : ''}`;
}

// ─── Reset the full session ───────────────────────────────────────────────────
function resetSession() {
    State.session = { answered: 0, totalScore: 0, ratings: [], history: [] };

    El.statAnswered.textContent = '0';
    El.statAvgScore.textContent = '—';
    El.statAvgScore.style.color = 'var(--text-muted)';
    El.statBestRating.textContent = '—';
    El.statBestRating.style.color = 'var(--text-muted)';
    El.historyCount.textContent = '0 answers';
    El.historyList.innerHTML = `
    <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.88rem">
      <div style="font-size:2rem;margin-bottom:8px">📝</div>
      Answer questions to build your history
    </div>`;

    // Re-fetch with current filters
    applyFilters();
}

// ─── Apply current filter dropdowns and re-fetch ──────────────────────────────
function applyFilters() {
    const category = El.categoryFilter.value;
    const company = El.companyFilter.value;
    fetchQuestions({ category, company, shuffle: true });
}

// ─── Responsive: stack feedback grid on narrow screens ───────────────────────
function applyFeedbackGridLayout() {
    if (!El.feedbackGrid) return;
    El.feedbackGrid.style.gridTemplateColumns = window.innerWidth < 600 ? '1fr' : '1fr 1fr';
}

// ─── Escape HTML helper (prevent XSS from API data) ──────────────────────────
function escHtml(str) {
    if (typeof str !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ─── Character count feedback on textarea ────────────────────────────────────
function updateCharCount() {
    const len = El.answerInput.value.length;
    El.charCount.textContent = `${len} / 2000 characters`;
    El.charCount.className = len >= 10 ? 'char-count ready' : len > 1900 ? 'char-count warn' : 'char-count';
}

// ─── Initialise user info in sidebar / navbar ─────────────────────────────────
function initUserUI() {
    const user = Auth.getUser();
    if (!user) return;
    document.getElementById('navUserName').textContent = user.fullName?.split(' ')[0] || 'User';
    document.getElementById('sidebarName').textContent = user.fullName || 'User';
    document.getElementById('sidebarEmail').textContent = user.email || '';
    document.getElementById('sidebarAvatar').textContent = (user.fullName || 'U')[0].toUpperCase();
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Auth guard — redirects to /login if not authenticated
    Auth.requireAuth();
    ThemeManager.init();
    initUserUI();

    // Cache DOM references
    Object.assign(El, {
        questionCard: document.getElementById('questionCard'),
        questionSkeleton: document.getElementById('questionSkeleton'),
        questionContent: document.getElementById('questionContent'),
        qNumber: document.getElementById('qNumber'),
        qText: document.getElementById('qText'),
        qCategory: document.getElementById('qCategory'),
        qCompany: document.getElementById('qCompany'),
        qTip: document.getElementById('qTip'),
        qTipText: document.getElementById('qTipText'),
        answerInput: document.getElementById('answerInput'),
        charCount: document.getElementById('charCount'),
        submitBtn: document.getElementById('submitBtn'),
        skipBtn: document.getElementById('skipBtn'),
        prevBtn: document.getElementById('prevBtn'),
        nextBtn: document.getElementById('nextBtn'),
        evalSection: document.getElementById('evalSection'),
        ratingPill: document.getElementById('ratingPill'),
        evalSummary: document.getElementById('evalSummary'),
        evalScoreCards: document.getElementById('evalScoreCards'),
        overallScoreLabel: document.getElementById('overallScoreLabel'),
        overallProgressBar: document.getElementById('overallProgressBar'),
        strengthsList: document.getElementById('strengthsList'),
        improvementsList: document.getElementById('improvementsList'),
        idealAnswer: document.getElementById('idealAnswer'),
        feedbackGrid: document.getElementById('feedbackGrid'),
        evalNextBtn: document.getElementById('evalNextBtn'),
        retryBtn: document.getElementById('retryBtn'),
        closeEvalBtn: document.getElementById('closeEvalBtn'),
        categoryFilter: document.getElementById('categoryFilter'),
        companyFilter: document.getElementById('companyFilter'),
        shuffleBtn: document.getElementById('shuffleBtn'),
        questionCounter: document.getElementById('questionCounter'),
        resetSessionBtn: document.getElementById('resetSessionBtn'),
        statAnswered: document.getElementById('statAnswered'),
        statAvgScore: document.getElementById('statAvgScore'),
        statBestRating: document.getElementById('statBestRating'),
        statTotal: document.getElementById('statTotal'),
        sessionMode: document.getElementById('sessionMode'),
        historyList: document.getElementById('historyList'),
        historyCount: document.getElementById('historyCount')
    });

    // ── Event listeners ──────────────────────────────────────────────────────

    // Mobile hamburger
    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('mobile-open');
    });

    // Textarea character counter
    El.answerInput.addEventListener('input', updateCharCount);

    // Keyboard shortcut: Ctrl+Enter to submit
    El.answerInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            evaluateAnswer();
        }
    });

    // Submit button
    El.submitBtn.addEventListener('click', evaluateAnswer);

    // Skip button — go to next without evaluating
    El.skipBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        if (State.currentIndex < State.questions.length - 1) {
            goToIndex(State.currentIndex + 1);
        } else {
            Toast.info('You\'ve reached the last question. Change filters or shuffle for more.');
        }
    });

    // Previous button
    El.prevBtn.addEventListener('click', () => {
        if (State.currentIndex > 0) goToIndex(State.currentIndex - 1);
    });

    // Next button
    El.nextBtn.addEventListener('click', () => {
        if (State.currentIndex < State.questions.length - 1) {
            goToIndex(State.currentIndex + 1);
        }
    });

    // Next from evaluation panel
    El.evalNextBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        if (State.currentIndex < State.questions.length - 1) {
            goToIndex(State.currentIndex + 1);
        } else {
            Toast.info('Great work! You\'ve completed all questions in this set.');
            goToIndex(0); // cycle back to start
        }
    });

    // Retry — keep the same question, clear evaluation and answer
    El.retryBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        El.answerInput.value = '';
        updateCharCount();
        El.answerInput.focus();
        El.answerInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Close evaluation panel without navigating
    El.closeEvalBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
    });

    // Category filter change
    El.categoryFilter.addEventListener('change', applyFilters);

    // Company filter change
    El.companyFilter.addEventListener('change', applyFilters);

    // Random shuffle button
    El.shuffleBtn.addEventListener('click', () => {
        const category = El.categoryFilter.value;
        const company = El.companyFilter.value;
        fetchQuestions({ category, company, shuffle: true });
    });

    // Reset session
    El.resetSessionBtn.addEventListener('click', () => {
        if (State.session.answered === 0 || confirm('Reset session and clear history?')) {
            resetSession();
        }
    });

    // Resize handler for responsive feedback grid
    window.addEventListener('resize', applyFeedbackGridLayout);

    // ── Initial data load ────────────────────────────────────────────────────
    loadCategories();
    fetchQuestions({ shuffle: true }); // load all questions, shuffled
});
