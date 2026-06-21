const fs = require('fs');
const html = fs.readFileSync('./public/pages/voice-interview.html', 'utf-8');
const js = fs.readFileSync('./public/js/voice-interview.js', 'utf-8');
const srv = fs.readFileSync('./server.js', 'utf-8');

const checks = [
    // Files
    ['HTML file exists', fs.existsSync('./public/pages/voice-interview.html')],
    ['JS file exists', fs.existsSync('./public/js/voice-interview.js')],
    // HTML links
    ['Links main.css', html.includes('/css/main.css')],
    ['Links utils.js', html.includes('/js/utils.js')],
    ['Links voice-interview.js', html.includes('/js/voice-interview.js')],
    // Sidebar
    ['Sidebar active on Voice', html.includes('sidebar-link active') && html.includes('href="/voice-interview"')],
    // Screens / banners
    ['Has unsupportedBanner', html.includes('id="unsupportedBanner"')],
    ['Has permissionBanner', html.includes('id="permissionBanner"')],
    // Question card
    ['Has questionCard', html.includes('id="questionCard"')],
    ['Has questionSkeleton', html.includes('id="questionSkeleton"')],
    ['Has questionContent', html.includes('id="questionContent"')],
    ['Has qText', html.includes('id="qText"')],
    ['Has qCategory', html.includes('id="qCategory"')],
    ['Has qTip (coaching tip)', html.includes('id="qTip"')],
    ['Has company-tag', html.includes('id="qCompany"')],
    // Recording UI
    ['Has recDot', html.includes('id="recDot"')],
    ['Has recLabel', html.includes('id="recLabel"')],
    ['Has waveformWrap', html.includes('id="waveformWrap"')],
    ['Has wv-bar elements', (html.match(/class="wv-bar"/g) || []).length >= 7],
    ['Has recTimer', html.includes('id="recTimer"')],
    ['Has wordCount', html.includes('id="wordCount"')],
    ['Has charCount', html.includes('id="charCount"')],
    // Controls
    ['Has micBtn', html.includes('id="micBtn"')],
    ['Has pauseBtn', html.includes('id="pauseBtn"')],
    ['Has stopBtn (Stop & Evaluate)', html.includes('id="stopBtn"')],
    ['Has clearBtn', html.includes('id="clearBtn"')],
    // Transcript
    ['Has transcriptBody', html.includes('id="transcriptBody"')],
    ['Has transcript-final class', html.includes('transcript-final')],
    ['Has transcript-interim class', html.includes('transcript-interim')],
    // Navigation
    ['Has prevBtn', html.includes('id="prevBtn"')],
    ['Has nextBtn', html.includes('id="nextBtn"')],
    ['Has skipBtn', html.includes('id="skipBtn"')],
    // Evaluation panel
    ['Has evalSection', html.includes('id="evalSection"')],
    ['Has ratingPill', html.includes('id="ratingPill"')],
    ['Has evalSummary', html.includes('id="evalSummary"')],
    ['Has evalScoreCards', html.includes('id="evalScoreCards"')],
    ['Has overallProgressBar', html.includes('id="overallProgressBar"')],
    ['Has strengthsList', html.includes('id="strengthsList"')],
    ['Has improvementsList', html.includes('id="improvementsList"')],
    ['Has idealAnswer', html.includes('id="idealAnswer"')],
    ['Has evalNextBtn', html.includes('id="evalNextBtn"')],
    ['Has retryBtn', html.includes('id="retryBtn"')],
    // Session
    ['Has session stats bar', html.includes('session-bar')],
    ['Has historyList', html.includes('id="historyList"')],
    ['Has resetSessionBtn', html.includes('id="resetSessionBtn"')],
    // Tips sidebar
    ['Has 4 voice tips', (html.match(/class="tip-item"/g) || []).length >= 4],
    ['Has STAR tip', html.includes('STAR')],
    ['Has Pause tip', html.includes('Pause')],
    ['Has 60-120 sec tip', html.includes('60')],
    // JS: API calls
    ['GET /interview/hr in JS', js.includes('/interview/hr')],
    ['POST /ai/evaluate-answer in JS', js.includes('/ai/evaluate-answer')],
    ['questionType hr in JS', js.includes("questionType: 'hr'")],
    ['Uses API.get', js.includes('API.get')],
    ['Uses API.post', js.includes('API.post')],
    // JS: auth & theme
    ['Uses Auth.requireAuth', js.includes('Auth.requireAuth')],
    ['Uses ThemeManager.init', js.includes('ThemeManager.init')],
    ['Uses UI.setLoading', js.includes('UI.setLoading')],
    ['Uses Toast.warning', js.includes('Toast.warning')],
    ['Uses Toast.error', js.includes('Toast.error')],
    ['Uses Toast.info', js.includes('Toast.info')],
    // JS: speech engine
    ['Has SpeechRecognition init', js.includes('SpeechRecognition') && js.includes('webkitSpeechRecognition')],
    ['Has continuous:true', js.includes('continuous')],
    ['Has interimResults:true', js.includes('interimResults')],
    ['Has onresult handler', js.includes('rec.onresult')],
    ['Has onerror handler', js.includes('rec.onerror')],
    ['Has onend handler', js.includes('rec.onend')],
    ['Has startRecording', js.includes('function startRecording')],
    ['Has pauseRecording', js.includes('function pauseRecording')],
    ['Has resumeRecording', js.includes('function resumeRecording')],
    ['Has stopRecording', js.includes('async function stopRecording')],
    ['Has clearTranscript', js.includes('function clearTranscript')],
    ['Has setRecState', js.includes('function setRecState')],
    // JS: error handling
    ['Handles not-allowed', js.includes("'not-allowed'")],
    ['Handles no-speech', js.includes("'no-speech'")],
    ['Handles aborted', js.includes("'aborted'")],
    ['Handles audio-capture', js.includes("'audio-capture'")],
    ['Handles network error', js.includes("'network'")],
    ['Shows permission banner', js.includes('showPermissionError')],
    // JS: transcript
    ['Has renderTranscript', js.includes('function renderTranscript')],
    ['Has interim span', js.includes('transcript-interim')],
    ['Has final span', js.includes('transcript-final')],
    ['Has auto-scroll', js.includes('scrollTop = ')],
    ['Has updateTranscriptStats', js.includes('updateTranscriptStats')],
    ['Has speaking timer', js.includes('startSpeakingTimer')],
    // JS: evaluation (identical to HR)
    ['Has renderEvaluation', js.includes('function renderEvaluation')],
    ['Has updateSessionStats', js.includes('function updateSessionStats')],
    ['Has addToHistory', js.includes('function addToHistory')],
    ['Has escHtml XSS protection', js.includes('function escHtml')],
    ['Has double rAF animation', js.includes('requestAnimationFrame')],
    ['Has applyFeedbackGridLayout', js.includes('applyFeedbackGridLayout')],
    // JS: cleanliness
    ['No direct fetch()', !js.includes('fetch(')],
    ['No hardcoded localhost', !js.includes('localhost')],
    ['No duplicate const API', !js.includes('const API =')],
    ['No duplicate const Auth', !js.includes('const Auth =')],
    ['Does not modify routes', !js.includes('router.get') && !js.includes('router.post')],
    // Server route
    ['Server route /voice-interview', srv.includes("app.get('/voice-interview'")],
];

let pass = 0, fail = 0;
checks.forEach(([name, result]) => {
    console.log((result ? 'PASS' : 'FAIL') + '  ' + name);
    result ? pass++ : fail++;
});
console.log('\nResults: ' + pass + ' passed, ' + fail + ' failed out of ' + checks.length + ' checks');
process.exit(fail > 0 ? 1 : 0);
