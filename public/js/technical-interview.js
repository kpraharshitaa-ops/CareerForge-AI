/**
 * CareerForge AI — Technical Interview Prep
 * Consumes:
 *   GET  /api/interview/technical             (list categories with counts)
 *   GET  /api/interview/technical/:category   (load questions for a category)
 *   POST /api/ai/evaluate-answer              (AI evaluation, requires JWT)
 *
 * Data structure of each technical question:
 *   { id, question, difficulty, answer }
 *   difficulty: "Medium" | "Advanced"
 *   answer: reference answer — included in API response, hidden from user by default
 *
 * NOTE: Unlike HR questions, technical questions have no `tip` or `company` field.
 * The `answer` field is a reference answer used for the toggle, not auto-revealed.
 */

'use strict';

// ─── Module state ──────────────────────────────────────────────────────────────
const State = {
    categories: [],   // [{ id, label, count }] — from GET /technical
    activeCategory: null, // currently selected category id string
    questions: [],   // current category's question array
    currentIndex: 0,
    currentQuestion: null,
    refAnswerVisible: false,
    session: {
        answered: 0,
        totalScore: 0,
        ratings: [],
        history: []         // [{ question, category, score, rating }]
    }
};

// ─── Cached DOM references ─────────────────────────────────────────────────────
const El = {};

// ─── Category display labels (map raw API id → human label) ──────────────────
// The route generates labels via: charAt(0).toUpperCase() + slice(1).replace(/([A-Z])/g, ' $1')
// That produces slightly wrong output for camelCase ('Data tructures').
// We supply clean overrides and fall back to the API label for anything not listed.
const CATEGORY_LABELS = {
    javascript: 'JavaScript',
    react: 'React',
    nodejs: 'Node.js',
    python: 'Python',
    java: 'Java',
    databases: 'Databases',
    dataStructures: 'Data Structures',
    systemDesign: 'System Design',
    networking: 'Networking',
    operatingSystems: 'Operating Systems'
};

// Icons for each category tab
const CATEGORY_ICONS = {
    javascript: '🟨',
    react: '⚛️',
    nodejs: '🟢',
    python: '🐍',
    java: '☕',
    databases: '🗄️',
    dataStructures: '🌲',
    systemDesign: '🏗️',
    networking: '🌐',
    operatingSystems: '⚙️'
};

// ─── Rating helpers (identical pattern to hr-interview.js) ────────────────────
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

// ─── XSS protection ───────────────────────────────────────────────────────────
function escHtml(str) {
    if (typeof str !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// ─── Skeleton helpers ──────────────────────────────────────────────────────────
function showQuestionSkeleton() {
    El.questionSkeleton.style.display = 'block';
    El.questionContent.style.display = 'none';
    El.evalSection.style.display = 'none';
}

function showQuestionContent() {
    El.questionSkeleton.style.display = 'none';
    El.questionContent.style.display = 'block';
}

// ─── Step 1: Load category list from GET /api/interview/technical ─────────────
async function loadCategories() {
    try {
        const res = await API.get('/interview/technical');
        if (!res || !res.success) {
            showCatStripError();
            return;
        }

        State.categories = (res.categories || []).map(cat => ({
            id: cat.id,
            label: CATEGORY_LABELS[cat.id] || cat.label,
            count: cat.count
        }));

        renderCategoryStrip();

        // Auto-select first category
        if (State.categories.length > 0) {
            selectCategory(State.categories[0].id);
        }

    } catch (err) {
        console.error('Failed to load technical categories:', err);
        showCatStripError();
    }
}

function showCatStripError() {
    El.catStrip.innerHTML = `
    <div style="font-size:0.85rem;color:var(--danger);padding:8px">
      ⚠️ Could not load categories. Please refresh the page.
    </div>`;
}

// ─── Render scrollable category tab strip ─────────────────────────────────────
function renderCategoryStrip() {
    El.catStrip.innerHTML = State.categories.map(cat => `
    <button
      class="cat-btn"
      data-id="${escHtml(cat.id)}"
      aria-label="Select ${escHtml(cat.label)} questions"
    >
      <span>${CATEGORY_ICONS[cat.id] || '📝'}</span>
      <span>${escHtml(cat.label)}</span>
      <span class="cat-count">${cat.count}</span>
    </button>
  `).join('');

    // Attach click handlers
    El.catStrip.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', () => selectCategory(btn.dataset.id));
    });
}

// ─── Step 2: Select a category → fetch questions ─────────────────────────────
async function selectCategory(categoryId) {
    if (!categoryId) return;

    // Update active tab styling
    El.catStrip.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.id === categoryId);
    });

    State.activeCategory = categoryId;
    showQuestionSkeleton();

    // Reset reference answer state
    hideRefAnswer();

    try {
        const res = await API.get(`/interview/technical/${categoryId}`);

        if (!res || !res.success || !res.questions || res.questions.length === 0) {
            showEmptyState('No questions found for this category.');
            return;
        }

        // Shuffle questions for variety
        State.questions = shuffleArray([...res.questions]);
        State.currentIndex = 0;

        // Update stat bar
        const cat = State.categories.find(c => c.id === categoryId);
        El.statTotal.textContent = res.total;
        El.statTotal.style.color = 'var(--primary)';
        El.sessionMode.textContent = cat ? cat.label : categoryId;

        displayQuestion(State.questions[0]);

    } catch (err) {
        console.error('Failed to load questions for category:', categoryId, err);
        showEmptyState('Could not load questions. Please check your connection and try again.');
    }
}

// ─── Fisher-Yates shuffle ─────────────────────────────────────────────────────
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ─── Display a single question ────────────────────────────────────────────────
function displayQuestion(q) {
    if (!q) return;

    State.currentQuestion = q;
    State.refAnswerVisible = false;

    // Number and category
    const catLabel = CATEGORY_LABELS[State.activeCategory] || State.activeCategory || '';
    El.qNumber.textContent = `Question ${State.currentIndex + 1} of ${State.questions.length}`;
    El.qCategory.textContent = catLabel;
    El.qText.textContent = q.question;

    // Difficulty badge
    const diff = (q.difficulty || 'Medium').toLowerCase();
    El.qDifficulty.textContent = q.difficulty || 'Medium';
    El.qDifficulty.className = `diff-badge ${diff === 'advanced' ? 'advanced' : 'medium'}`;

    // Reference answer — show the toggle button if answer field exists and is non-empty
    if (q.answer && q.answer.trim()) {
        El.refAnswerSection.style.display = 'block';
        El.refAnswerText.textContent = q.answer;
        hideRefAnswer();
    } else {
        El.refAnswerSection.style.display = 'none';
    }

    // Clear textarea and eval panel
    El.answerInput.value = '';
    El.charCount.textContent = '0 / 3000 characters';
    El.charCount.className = 'char-count';
    El.evalSection.style.display = 'none';

    // Reset submit button text in case it was loading
    if (El.submitBtn._originalText) {
        El.submitBtn.innerHTML = '🤖 Evaluate Answer';
    }
    El.submitBtn.disabled = false;

    // Navigation state
    El.prevBtn.disabled = (State.currentIndex === 0);
    El.nextBtn.disabled = (State.currentIndex >= State.questions.length - 1);

    showQuestionContent();
    El.questionCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ─── Navigate to a specific index ────────────────────────────────────────────
function goToIndex(index) {
    if (index < 0 || index >= State.questions.length) return;
    State.currentIndex = index;
    displayQuestion(State.questions[index]);
}

// ─── Reference answer toggle ──────────────────────────────────────────────────
function toggleRefAnswer() {
    State.refAnswerVisible = !State.refAnswerVisible;
    El.refAnswerBox.style.display = State.refAnswerVisible ? 'block' : 'none';
    El.refToggleIcon.textContent = State.refAnswerVisible ? '🙈' : '👁️';
    El.refAnswerToggle.childNodes[1].textContent = State.refAnswerVisible
        ? ' Hide Reference Answer'
        : ' Show Reference Answer';
}

function hideRefAnswer() {
    State.refAnswerVisible = false;
    El.refAnswerBox.style.display = 'none';
    El.refToggleIcon.textContent = '👁️';
    if (El.refAnswerToggle.childNodes[1]) {
        El.refAnswerToggle.childNodes[1].textContent = ' Show Reference Answer';
    }
}

// ─── Show empty / error state in the question card ───────────────────────────
function showEmptyState(message) {
    El.questionSkeleton.style.display = 'none';
    El.questionContent.style.display = 'block';
    El.evalSection.style.display = 'none';

    El.qNumber.textContent = '';
    El.qText.textContent = message;
    El.qCategory.textContent = '';
    El.qDifficulty.textContent = '';
    El.refAnswerSection.style.display = 'none';
    El.answerInput.value = '';
    El.prevBtn.disabled = true;
    El.nextBtn.disabled = true;
    El.submitBtn.disabled = true;
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
            questionType: 'technical'
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
    const overall = ev.overallScore || 0;

    // Rating pill
    El.ratingPill.textContent = `${meta.icon} ${ev.rating || 'Evaluated'}`;
    El.ratingPill.className = `rating-pill ${meta.cls}`;

    // Summary
    El.evalSummary.textContent = ev.summary || '';

    // Score cards — same four metrics as HR page
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

    // Overall progress bar
    El.overallScoreLabel.textContent = `${overall}%`;
    El.overallScoreLabel.style.color = scoreToColor(overall);
    El.overallProgressBar.style.width = '0%';
    El.overallProgressBar.className = 'progress-fill';
    if (overall >= 80) El.overallProgressBar.classList.add('success');
    else if (overall < 40) El.overallProgressBar.classList.add('danger');
    else if (overall < 60) El.overallProgressBar.classList.add('warning');

    // Double rAF to ensure CSS transition plays
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

    // Responsive grid
    applyFeedbackGridLayout();

    // Show and scroll to eval section
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

    // Best rating = highest in priority order
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
    const catLabel = CATEGORY_LABELS[State.activeCategory] || State.activeCategory || '';

    State.session.history.unshift({ question: q, category: catLabel, score, rating });

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
    <div class="history-item-q">${escHtml(q.question)}</div>
    <div class="history-item-meta">
      <div class="history-score-dot" style="background:${meta.scoreColor}"></div>
      <span style="font-size:0.75rem;font-weight:600;color:${meta.scoreColor}">${score}%</span>
      <span style="font-size:0.72rem;color:var(--text-muted)">·</span>
      <span class="diff-badge ${(q.difficulty || '').toLowerCase() === 'advanced' ? 'advanced' : 'medium'}"
        style="font-size:0.68rem;padding:1px 6px">${escHtml(q.difficulty || 'Medium')}</span>
      <span style="font-size:0.72rem;color:var(--text-muted)">·</span>
      <span style="font-size:0.75rem;color:var(--text-muted)">${escHtml(catLabel)}</span>
    </div>
  `;

    // Click to jump back to this question in the current pool
    item.addEventListener('click', () => {
        const idx = State.questions.findIndex(sq => sq.id === q.id);
        if (idx !== -1) {
            goToIndex(idx);
            El.evalSection.style.display = 'none';
        }
    });

    // Remove placeholder on first entry
    const placeholder = El.historyList.querySelector('div[style*="text-align:center"]');
    if (placeholder) placeholder.remove();

    El.historyList.prepend(item);
    const total = State.session.history.length;
    El.historyCount.textContent = `${total} answer${total !== 1 ? 's' : ''}`;
}

// ─── Reset session ────────────────────────────────────────────────────────────
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
      <div style="font-size:2rem;margin-bottom:8px">💡</div>
      Answer questions to track your progress
    </div>`;

    // Re-load current category
    if (State.activeCategory) selectCategory(State.activeCategory);
}

// ─── Responsive feedback grid ─────────────────────────────────────────────────
function applyFeedbackGridLayout() {
    if (!El.feedbackGrid) return;
    El.feedbackGrid.style.gridTemplateColumns = window.innerWidth < 600 ? '1fr' : '1fr 1fr';
}

// ─── Character counter ────────────────────────────────────────────────────────
function updateCharCount() {
    const len = El.answerInput.value.length;
    El.charCount.textContent = `${len} / 3000 characters`;
    El.charCount.className = len >= 10 ? 'char-count ready' : len > 2800 ? 'char-count warn' : 'char-count';
}

// ─── Initialise user display in navbar and sidebar ────────────────────────────
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
    Auth.requireAuth();
    ThemeManager.init();
    initUserUI();

    // Cache all DOM references once
    Object.assign(El, {
        catStrip: document.getElementById('catStrip'),
        questionCard: document.getElementById('questionCard'),
        questionSkeleton: document.getElementById('questionSkeleton'),
        questionContent: document.getElementById('questionContent'),
        qNumber: document.getElementById('qNumber'),
        qText: document.getElementById('qText'),
        qCategory: document.getElementById('qCategory'),
        qDifficulty: document.getElementById('qDifficulty'),
        refAnswerSection: document.getElementById('refAnswerSection'),
        refAnswerToggle: document.getElementById('refAnswerToggle'),
        refToggleIcon: document.getElementById('refToggleIcon'),
        refAnswerBox: document.getElementById('refAnswerBox'),
        refAnswerText: document.getElementById('refAnswerText'),
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
        resetSessionBtn: document.getElementById('resetSessionBtn'),
        statAnswered: document.getElementById('statAnswered'),
        statAvgScore: document.getElementById('statAvgScore'),
        statBestRating: document.getElementById('statBestRating'),
        statTotal: document.getElementById('statTotal'),
        sessionMode: document.getElementById('sessionMode'),
        historyList: document.getElementById('historyList'),
        historyCount: document.getElementById('historyCount')
    });

    // ── Event listeners ────────────────────────────────────────────────────────

    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('mobile-open');
    });

    El.answerInput.addEventListener('input', updateCharCount);

    // Ctrl+Enter to submit
    El.answerInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            evaluateAnswer();
        }
    });

    El.submitBtn.addEventListener('click', evaluateAnswer);

    El.skipBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        if (State.currentIndex < State.questions.length - 1) {
            goToIndex(State.currentIndex + 1);
        } else {
            Toast.info("You've reached the last question in this category.");
        }
    });

    El.prevBtn.addEventListener('click', () => {
        if (State.currentIndex > 0) goToIndex(State.currentIndex - 1);
    });

    El.nextBtn.addEventListener('click', () => {
        if (State.currentIndex < State.questions.length - 1) goToIndex(State.currentIndex + 1);
    });

    El.evalNextBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        if (State.currentIndex < State.questions.length - 1) {
            goToIndex(State.currentIndex + 1);
        } else {
            Toast.info("Great work! All questions in this category answered. Try another category.");
            goToIndex(0);
        }
    });

    El.retryBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        El.answerInput.value = '';
        updateCharCount();
        hideRefAnswer();
        El.answerInput.focus();
        El.answerInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    El.closeEvalBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
    });

    El.refAnswerToggle.addEventListener('click', toggleRefAnswer);

    El.resetSessionBtn.addEventListener('click', () => {
        if (State.session.answered === 0 || confirm('Reset session and clear history?')) {
            resetSession();
        }
    });

    window.addEventListener('resize', applyFeedbackGridLayout);

    // ── Initial load ──────────────────────────────────────────────────────────
    loadCategories();
});
