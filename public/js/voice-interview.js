/**
 * CareerForge AI — Voice Mock Interview
 * Consumes:
 *   GET  /api/interview/hr          (load shuffled HR questions)
 *   POST /api/ai/evaluate-answer    (evaluate spoken transcript, questionType: "hr")
 *
 * Speech: SpeechRecognition / webkitSpeechRecognition (Web Speech API)
 * Transcript model:
 *   finalText    — committed text from all previous recognition cycles
 *   interimText  — what the engine is currently recognising (not yet committed)
 *   fullText()   — finalText + interimText  (what gets evaluated)
 */
'use strict';

// ─── Speech Recognition setup ────────────────────────────────────────────────
const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition || null;

// ─── State ────────────────────────────────────────────────────────────────────
const State = {
    // Question pool
    questions: [],
    currentIndex: 0,
    currentQuestion: null,

    // Recording
    recognition: null,
    recState: 'idle',   // 'idle' | 'recording' | 'paused' | 'stopped'
    finalText: '',       // committed transcript
    interimText: '',       // in-progress (interim) from recognition engine
    speakingSeconds: 0,
    speakingTimer: null,

    // Session stats
    session: {
        answered: 0,
        totalScore: 0,
        ratings: [],
        history: []
    }
};

// ─── DOM cache ────────────────────────────────────────────────────────────────
const El = {};

// ─── Helpers (identical pattern to hr-interview.js) ──────────────────────────
const RATING_META = {
    'Excellent': { cls: 'excellent', icon: '🌟', scoreColor: 'var(--success)' },
    'Good': { cls: 'good', icon: '👍', scoreColor: 'var(--primary)' },
    'Average': { cls: 'average', icon: '📊', scoreColor: 'var(--warning)' },
    'Needs Improvement': { cls: 'needs', icon: '📈', scoreColor: 'var(--danger)' }
};

function getRatingMeta(r) {
    return RATING_META[r] || { cls: 'good', icon: '📊', scoreColor: 'var(--primary)' };
}

function scoreToColor(s) {
    if (s >= 80) return 'var(--success)';
    if (s >= 60) return 'var(--primary)';
    if (s >= 40) return 'var(--warning)';
    return 'var(--danger)';
}

function escHtml(str) {
    if (typeof str !== 'string') return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

function applyFeedbackGridLayout() {
    if (!El.feedbackGrid) return;
    El.feedbackGrid.style.gridTemplateColumns = window.innerWidth < 600 ? '1fr' : '1fr 1fr';
}

// ─── User UI init ─────────────────────────────────────────────────────────────
function initUserUI() {
    const user = Auth.getUser();
    if (!user) return;
    document.getElementById('navUserName').textContent = user.fullName?.split(' ')[0] || 'User';
    document.getElementById('sidebarName').textContent = user.fullName || 'User';
    document.getElementById('sidebarEmail').textContent = user.email || '';
    document.getElementById('sidebarAvatar').textContent = (user.fullName || 'U')[0].toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPEECH RECOGNITION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function initSpeechEngine() {
    if (!SpeechAPI) {
        El.unsupportedBanner.style.display = 'flex';
        El.micBtn.disabled = true;
        El.stopBtn.disabled = true;
        return false;
    }

    const rec = new SpeechAPI();
    rec.continuous = true;   // keep listening until we stop
    rec.interimResults = true;   // fire events for in-progress words
    rec.lang = 'en-US';
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
        let interim = '';
        // Walk all new results from the last known index
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                State.finalText += transcript + ' ';
            } else {
                interim += transcript;
            }
        }
        State.interimText = interim;
        renderTranscript();
        updateTranscriptStats();
    };

    rec.onerror = (event) => {
        console.error('SpeechRecognition error:', event.error);
        switch (event.error) {
            case 'not-allowed':
            case 'permission-denied':
                showPermissionError('Microphone access was denied. Please enable it in browser settings and refresh.');
                stopRecording(false);   // don't evaluate, just stop
                break;
            case 'no-speech':
                // Restart automatically — this fires after a silence timeout
                if (State.recState === 'recording') {
                    try { State.recognition.start(); } catch { }
                }
                break;
            case 'aborted':
                // Triggered by our own .stop() call — ignore silently
                break;
            case 'audio-capture':
                showPermissionError('No microphone detected. Please connect a microphone and try again.');
                stopRecording(false);
                break;
            case 'network':
                Toast.warning('Network error with speech service. Transcript may be incomplete.');
                break;
            default:
                Toast.warning(`Speech recognition interrupted (${event.error}). Tap 🎤 to resume.`);
                setRecState('idle');
        }
    };

    rec.onend = () => {
        // onend fires after .stop() and after certain error types.
        // If we're still in 'recording' state it means the browser ended unexpectedly
        // (happens on some mobile Chrome versions after ~60s). Restart automatically.
        if (State.recState === 'recording') {
            try { State.recognition.start(); } catch { }
        }
    };

    State.recognition = rec;
    return true;
}

// ─── Start recording ──────────────────────────────────────────────────────────
function startRecording() {
    if (!SpeechAPI) return;
    if (!State.recognition) {
        if (!initSpeechEngine()) return;
    }

    // Request mic permission explicitly first — failure surfaces via onerror
    try {
        State.recognition.start();
    } catch (e) {
        // Already started (shouldn't happen but guard anyway)
        console.warn('SpeechRecognition.start() threw:', e.message);
        return;
    }

    State.interimText = '';
    setRecState('recording');
    startSpeakingTimer();
    Toast.info('🎤 Recording started. Speak your answer clearly.');
}

// ─── Pause recording ──────────────────────────────────────────────────────────
function pauseRecording() {
    if (State.recState !== 'recording') return;
    // SpeechRecognition has no native pause — stop the engine, keep accumulated text
    try { State.recognition.stop(); } catch { }
    State.interimText = '';
    renderTranscript();
    setRecState('paused');
    stopSpeakingTimer();
}

// ─── Resume recording ─────────────────────────────────────────────────────────
function resumeRecording() {
    if (State.recState !== 'paused') return;
    try { State.recognition.start(); } catch { }
    setRecState('recording');
    startSpeakingTimer();
}

// ─── Stop recording and trigger evaluation ────────────────────────────────────
async function stopRecording(evaluate = true) {
    if (State.recState === 'idle') return;
    try { State.recognition.stop(); } catch { }
    State.interimText = '';
    renderTranscript();
    stopSpeakingTimer();
    setRecState('stopped');

    if (!evaluate) return;

    const text = State.finalText.trim();
    if (!text || text.length < 10) {
        Toast.warning('Transcript is too short. Speak at least a complete sentence before evaluating.');
        setRecState('idle');
        return;
    }
    await evaluateTranscript(text);
}

// ─── Clear transcript ─────────────────────────────────────────────────────────
function clearTranscript() {
    if (State.recState === 'recording') {
        try { State.recognition.stop(); } catch { }
        stopSpeakingTimer();
    }
    State.finalText = '';
    State.interimText = '';
    State.speakingSeconds = 0;
    El.recTimer.textContent = '0:00';
    renderTranscript();
    updateTranscriptStats();
    setRecState('idle');
    El.evalSection.style.display = 'none';
}

// ─── setRecState — update all UI elements for the current recording state ─────
function setRecState(newState) {
    State.recState = newState;

    const dot = El.recDot;
    const label = El.recLabel;
    const wave = El.waveformWrap;

    // Remove all state classes
    dot.className = 'rec-dot';
    label.className = 'rec-label';
    wave.classList.remove('active');

    switch (newState) {
        case 'recording':
            dot.classList.add('recording');
            label.classList.add('recording');
            label.textContent = '● Recording…';
            wave.classList.add('active');
            El.micBtn.classList.add('recording');
            El.micBtn.classList.remove('paused');
            El.micBtn.title = 'Recording in progress';
            El.micBtn.disabled = true;   // can't start again while recording
            El.pauseBtn.disabled = false;
            El.pauseBtn.textContent = '⏸ Pause';
            El.stopBtn.disabled = false;
            El.clearBtn.disabled = false;
            break;

        case 'paused':
            dot.classList.add('paused');
            label.classList.add('paused');
            label.textContent = '⏸ Paused — click 🎤 to resume';
            El.micBtn.classList.remove('recording');
            El.micBtn.classList.add('paused');
            El.micBtn.title = 'Resume recording';
            El.micBtn.disabled = false;
            El.pauseBtn.disabled = true;
            El.stopBtn.disabled = false;
            El.clearBtn.disabled = false;
            break;

        case 'stopped':
            dot.classList.add('done');
            label.classList.add('done');
            label.textContent = '✓ Recording stopped';
            El.micBtn.classList.remove('recording', 'paused');
            El.micBtn.title = 'Start new recording';
            El.micBtn.disabled = false;
            El.pauseBtn.disabled = true;
            El.stopBtn.disabled = true;
            El.clearBtn.disabled = false;
            break;

        default: // 'idle'
            label.textContent = 'Ready to record';
            El.micBtn.classList.remove('recording', 'paused');
            El.micBtn.title = 'Start recording';
            El.micBtn.disabled = !SpeechAPI;
            El.pauseBtn.disabled = true;
            El.stopBtn.disabled = true;
            El.clearBtn.disabled = State.finalText.length === 0;
            break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSCRIPT RENDERING
// ═══════════════════════════════════════════════════════════════════════════════

function renderTranscript() {
    const body = El.transcriptBody;
    const final = State.finalText;
    const inter = State.interimText;

    if (!final && !inter) {
        body.innerHTML = '<span class="transcript-placeholder">Press 🎤 to start speaking. Your words will appear here in real time.</span>';
        return;
    }

    let html = '';
    if (final) html += `<span class="transcript-final">${escHtml(final)}</span>`;
    if (inter) html += `<span class="transcript-interim">${escHtml(inter)}</span>`;
    body.innerHTML = html;

    // Auto-scroll to bottom
    body.scrollTop = body.scrollHeight;
}

function updateTranscriptStats() {
    const full = (State.finalText + State.interimText).trim();
    const words = full ? full.split(/\s+/).filter(Boolean).length : 0;
    El.wordCount.textContent = words;
    El.charCount.textContent = full.length;
}

// ─── Speaking timer ───────────────────────────────────────────────────────────
function startSpeakingTimer() {
    stopSpeakingTimer();
    State.speakingTimer = setInterval(() => {
        State.speakingSeconds++;
        const m = Math.floor(State.speakingSeconds / 60);
        const s = State.speakingSeconds % 60;
        El.recTimer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }, 1000);
}

function stopSpeakingTimer() {
    clearInterval(State.speakingTimer);
    State.speakingTimer = null;
}

// ─── Permission error banner ──────────────────────────────────────────────────
function showPermissionError(msg) {
    El.permissionMsg.innerHTML = `<strong>Microphone error.</strong> ${escHtml(msg)}`;
    El.permissionBanner.style.display = 'flex';
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTION MANAGEMENT (same pattern as hr-interview.js)
// ═══════════════════════════════════════════════════════════════════════════════

function showQuestionSkeleton() {
    El.questionSkeleton.style.display = 'block';
    El.questionContent.style.display = 'none';
    El.evalSection.style.display = 'none';
}

function showQuestionContent() {
    El.questionSkeleton.style.display = 'none';
    El.questionContent.style.display = 'block';
}

async function fetchQuestions() {
    showQuestionSkeleton();
    try {
        const res = await API.get('/interview/hr?shuffle=true');
        if (!res || !res.success || !res.questions.length) {
            showEmptyState('Could not load questions. Please check your connection and try again.');
            return;
        }
        State.questions = res.questions;
        State.currentIndex = 0;
        El.statTotal.textContent = res.total;
        El.sessionMode.textContent = 'Shuffled';
        displayQuestion(State.questions[0]);
    } catch (err) {
        console.error('fetchQuestions error:', err);
        showEmptyState('Failed to load questions.');
    }
}

function displayQuestion(q) {
    if (!q) return;
    State.currentQuestion = q;

    El.qNumber.textContent = `Question ${State.currentIndex + 1} of ${State.questions.length}`;
    El.qText.textContent = q.question;
    El.qCategory.textContent = q.category || 'General';

    if (q.company && q.company !== 'All') {
        El.qCompany.textContent = `🏢 ${q.company}`;
        El.qCompany.style.display = 'inline-flex';
    } else {
        El.qCompany.style.display = 'none';
    }

    if (q.tip) {
        El.qTipText.textContent = q.tip;
        El.qTip.style.display = 'block';
    } else {
        El.qTip.style.display = 'none';
    }

    El.prevBtn.disabled = (State.currentIndex === 0);
    El.nextBtn.disabled = (State.currentIndex >= State.questions.length - 1);

    // Stop any in-progress recording when changing question
    if (State.recState === 'recording' || State.recState === 'paused') {
        try { State.recognition?.stop(); } catch { }
        stopSpeakingTimer();
    }

    // Reset recording state and transcript for the new question
    State.finalText = '';
    State.interimText = '';
    State.speakingSeconds = 0;
    El.recTimer.textContent = '0:00';
    renderTranscript();
    updateTranscriptStats();
    setRecState('idle');
    El.evalSection.style.display = 'none';

    showQuestionContent();
    El.questionCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function goToIndex(idx) {
    if (idx < 0 || idx >= State.questions.length) return;
    State.currentIndex = idx;
    displayQuestion(State.questions[idx]);
}

function showEmptyState(msg) {
    El.questionSkeleton.style.display = 'none';
    El.questionContent.style.display = 'block';
    El.evalSection.style.display = 'none';
    El.qNumber.textContent = '';
    El.qText.textContent = msg;
    El.qCategory.textContent = '';
    El.qCompany.style.display = 'none';
    El.qTip.style.display = 'none';
    El.prevBtn.disabled = El.nextBtn.disabled = true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI EVALUATION (identical to hr-interview.js)
// ═══════════════════════════════════════════════════════════════════════════════

async function evaluateTranscript(transcript) {
    if (!State.currentQuestion) return;

    UI.setLoading(El.stopBtn, true, 'Evaluating…');
    El.evalSection.style.display = 'none';

    try {
        const res = await API.post('/ai/evaluate-answer', {
            question: State.currentQuestion.question,
            answer: transcript,
            questionType: 'hr'
        });

        UI.setLoading(El.stopBtn, false);
        El.stopBtn.disabled = true;   // keep disabled — user must start new recording

        if (!res || !res.success) {
            Toast.error(res?.message || 'Evaluation failed. Please try again.');
            setRecState('idle');
            return;
        }

        renderEvaluation(res.evaluation);
        updateSessionStats(res.evaluation);
        addToHistory(State.currentQuestion, res.evaluation, transcript);

    } catch (err) {
        UI.setLoading(El.stopBtn, false);
        console.error('evaluateTranscript error:', err);
        Toast.error('Could not reach the evaluation service. Please try again.');
        setRecState('idle');
    }
}

// ─── Render evaluation panel (identical structure to hr-interview.js) ─────────
function renderEvaluation(ev) {
    const meta = getRatingMeta(ev.rating);
    const overall = ev.overallScore || 0;

    El.ratingPill.textContent = `${meta.icon} ${ev.rating || 'Evaluated'}`;
    El.ratingPill.className = `rating-pill ${meta.cls}`;
    El.evalSummary.textContent = ev.summary || '';

    El.evalScoreCards.innerHTML = [
        { label: 'Communication', value: ev.communicationScore || 0 },
        { label: 'Confidence', value: ev.confidenceScore || 0 },
        { label: 'Clarity', value: ev.clarityScore || 0 },
        { label: 'Professionalism', value: ev.professionalismScore || 0 }
    ].map(s => `
    <div class="eval-score-card">
      <div class="eval-score-value" style="color:${scoreToColor(s.value)}">${s.value}</div>
      <div class="eval-score-label">${s.label}</div>
    </div>`).join('');

    El.overallScoreLabel.textContent = `${overall}%`;
    El.overallScoreLabel.style.color = scoreToColor(overall);
    El.overallProgressBar.style.width = '0%';
    El.overallProgressBar.className = 'progress-fill';
    if (overall >= 80) El.overallProgressBar.classList.add('success');
    else if (overall < 40) El.overallProgressBar.classList.add('danger');
    else if (overall < 60) El.overallProgressBar.classList.add('warning');

    requestAnimationFrame(() => requestAnimationFrame(() => {
        El.overallProgressBar.style.width = `${overall}%`;
    }));

    El.strengthsList.innerHTML = (ev.strengths || []).map(s => `
    <div class="feedback-item"><span class="fi-icon">✅</span><span>${escHtml(s)}</span></div>
  `).join('') || '<div class="feedback-item"><span class="fi-icon">ℹ️</span><span>No specific strengths noted.</span></div>';

    El.improvementsList.innerHTML = (ev.improvements || []).map(s => `
    <div class="feedback-item"><span class="fi-icon">🔧</span><span>${escHtml(s)}</span></div>
  `).join('') || '<div class="feedback-item"><span class="fi-icon">ℹ️</span><span>Keep practising!</span></div>';

    El.idealAnswer.textContent = ev.idealAnswer || 'Not available.';

    applyFeedbackGridLayout();
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

// ─── Add to history panel ─────────────────────────────────────────────────────
function addToHistory(q, ev, transcript) {
    const score = ev.overallScore || 0;
    const meta = getRatingMeta(ev.rating || '');

    State.session.history.unshift({ question: q, score, rating: ev.rating, transcript });

    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
    <div class="history-item-q">${escHtml(q.question)}</div>
    <div class="history-item-meta">
      <div class="history-score-dot" style="background:${meta.scoreColor}"></div>
      <span style="font-size:0.75rem;font-weight:600;color:${meta.scoreColor}">${score}%</span>
      <span style="font-size:0.72rem;color:var(--text-muted)">·</span>
      <span style="font-size:0.75rem;color:var(--text-muted)">🎤 ${escHtml(q.category || '')}</span>
    </div>`;

    item.addEventListener('click', () => {
        const idx = State.questions.findIndex(sq => sq.id === q.id);
        if (idx !== -1) { goToIndex(idx); El.evalSection.style.display = 'none'; }
    });

    const placeholder = El.historyList.querySelector('div[style*="text-align:center"]');
    if (placeholder) placeholder.remove();

    El.historyList.prepend(item);
    const total = State.session.history.length;
    El.historyCount.textContent = `${total} answer${total !== 1 ? 's' : ''}`;
}

// ─── Reset session ────────────────────────────────────────────────────────────
function resetSession() {
    if (State.recState === 'recording' || State.recState === 'paused') {
        try { State.recognition?.stop(); } catch { }
        stopSpeakingTimer();
    }

    State.session = { answered: 0, totalScore: 0, ratings: [], history: [] };
    State.finalText = '';
    State.interimText = '';
    State.speakingSeconds = 0;

    El.statAnswered.textContent = '0';
    El.statAvgScore.textContent = '—';
    El.statAvgScore.style.color = 'var(--text-muted)';
    El.statBestRating.textContent = '—';
    El.statBestRating.style.color = 'var(--text-muted)';
    El.historyCount.textContent = '0 answers';
    El.historyList.innerHTML = `
    <div style="text-align:center;padding:24px;color:var(--text-muted);font-size:0.88rem">
      <div style="font-size:2rem;margin-bottom:8px">🎤</div>
      Answer questions to build your history
    </div>`;
    El.recTimer.textContent = '0:00';
    renderTranscript();
    updateTranscriptStats();
    setRecState('idle');
    El.evalSection.style.display = 'none';

    fetchQuestions();
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
        // Banners
        unsupportedBanner: document.getElementById('unsupportedBanner'),
        permissionBanner: document.getElementById('permissionBanner'),
        permissionMsg: document.getElementById('permissionMsg'),
        // Question card
        questionCard: document.getElementById('questionCard'),
        questionSkeleton: document.getElementById('questionSkeleton'),
        questionContent: document.getElementById('questionContent'),
        qNumber: document.getElementById('qNumber'),
        qText: document.getElementById('qText'),
        qCategory: document.getElementById('qCategory'),
        qCompany: document.getElementById('qCompany'),
        qTip: document.getElementById('qTip'),
        qTipText: document.getElementById('qTipText'),
        // Recording status
        recDot: document.getElementById('recDot'),
        recLabel: document.getElementById('recLabel'),
        waveformWrap: document.getElementById('waveformWrap'),
        recTimer: document.getElementById('recTimer'),
        wordCount: document.getElementById('wordCount'),
        charCount: document.getElementById('charCount'),
        // Controls
        micBtn: document.getElementById('micBtn'),
        pauseBtn: document.getElementById('pauseBtn'),
        stopBtn: document.getElementById('stopBtn'),
        clearBtn: document.getElementById('clearBtn'),
        // Transcript
        transcriptBody: document.getElementById('transcriptBody'),
        // Navigation
        prevBtn: document.getElementById('prevBtn'),
        nextBtn: document.getElementById('nextBtn'),
        skipBtn: document.getElementById('skipBtn'),
        // Evaluation
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
        // Session stats
        statAnswered: document.getElementById('statAnswered'),
        statAvgScore: document.getElementById('statAvgScore'),
        statBestRating: document.getElementById('statBestRating'),
        statTotal: document.getElementById('statTotal'),
        sessionMode: document.getElementById('sessionMode'),
        historyList: document.getElementById('historyList'),
        historyCount: document.getElementById('historyCount'),
        resetSessionBtn: document.getElementById('resetSessionBtn'),
    });

    // ── Event: hamburger ─────────────────────────────────────────────────────
    document.getElementById('hamburger').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('mobile-open');
    });

    // ── Event: mic button — behaviour depends on current state ────────────────
    El.micBtn.addEventListener('click', () => {
        switch (State.recState) {
            case 'idle': startRecording(); break;
            case 'paused': resumeRecording(); break;
            case 'stopped': clearTranscript(); startRecording(); break;
            default: break;
        }
    });

    // ── Event: pause ─────────────────────────────────────────────────────────
    El.pauseBtn.addEventListener('click', pauseRecording);

    // ── Event: stop & evaluate ───────────────────────────────────────────────
    El.stopBtn.addEventListener('click', () => stopRecording(true));

    // ── Event: clear transcript ───────────────────────────────────────────────
    El.clearBtn.addEventListener('click', () => {
        if (State.finalText || State.interimText) {
            if (confirm('Clear the current transcript?')) clearTranscript();
        }
    });

    // ── Event: navigation ────────────────────────────────────────────────────
    El.prevBtn.addEventListener('click', () => {
        if (State.currentIndex > 0) goToIndex(State.currentIndex - 1);
    });
    El.nextBtn.addEventListener('click', () => {
        if (State.currentIndex < State.questions.length - 1) goToIndex(State.currentIndex + 1);
    });
    El.skipBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        if (State.currentIndex < State.questions.length - 1) {
            goToIndex(State.currentIndex + 1);
        } else {
            Toast.info("You've reached the last question.");
        }
    });

    // ── Event: evaluation panel actions ──────────────────────────────────────
    El.evalNextBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
        if (State.currentIndex < State.questions.length - 1) {
            goToIndex(State.currentIndex + 1);
        } else {
            Toast.info('Great work! All questions done. Starting over.');
            goToIndex(0);
        }
    });

    El.retryBtn.addEventListener('click', () => {
        // Keep the same question, just reset transcript and recording
        clearTranscript();
        El.evalSection.style.display = 'none';
    });

    El.closeEvalBtn.addEventListener('click', () => {
        El.evalSection.style.display = 'none';
    });

    // ── Event: reset session ──────────────────────────────────────────────────
    El.resetSessionBtn.addEventListener('click', () => {
        if (State.session.answered === 0 || confirm('Reset session and clear history?')) {
            resetSession();
        }
    });

    // ── Event: responsive feedback grid ──────────────────────────────────────
    window.addEventListener('resize', applyFeedbackGridLayout);

    // ── Detect browser support immediately ───────────────────────────────────
    if (!SpeechAPI) {
        El.unsupportedBanner.style.display = 'flex';
        // Don't block question loading — users can still read questions
    }

    // ── Initial question load ─────────────────────────────────────────────────
    // Init speech engine early so any permission checks happen before first click
    if (SpeechAPI) initSpeechEngine();
    fetchQuestions();
});
