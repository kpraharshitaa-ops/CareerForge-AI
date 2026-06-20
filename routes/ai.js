/**
 * AI Routes - Gemini API integration for interview evaluation
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');
const { verifyToken } = require('./auth');

// ─── POST /api/ai/evaluate-answer ─────────────────────────────────────────────
router.post('/evaluate-answer', verifyToken, async (req, res) => {
    const { question, answer, questionType = 'hr' } = req.body;
    if (!question || !answer) {
        return res.status(400).json({ success: false, message: 'Question and answer are required' });
    }
    if (answer.trim().length < 10) {
        return res.status(400).json({ success: false, message: 'Answer is too short for evaluation' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return res.json({ success: true, evaluation: getMockEvaluation(answer) });
    }

    const prompt = `You are an expert interview coach evaluating a candidate's interview response.

Question: ${question}
Candidate's Answer: ${answer}
Question Type: ${questionType}

Evaluate the answer and respond ONLY with valid JSON in this exact format:
{
  "communicationScore": <number 0-100>,
  "confidenceScore": <number 0-100>,
  "clarityScore": <number 0-100>,
  "professionalismScore": <number 0-100>,
  "overallScore": <number 0-100>,
  "strengths": [<2-3 specific strengths of the answer>],
  "improvements": [<2-4 specific improvement suggestions>],
  "idealAnswer": "<brief outline of what an ideal answer would include>",
  "rating": "<Excellent/Good/Average/Needs Improvement>",
  "summary": "<2-sentence evaluation summary>"
}`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 20000 }
        );
        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return res.json({ success: true, evaluation: JSON.parse(jsonMatch[0]) });
        }
        res.json({ success: true, evaluation: getMockEvaluation(answer) });
    } catch (err) {
        console.error('Gemini evaluation error:', err.message);
        res.json({ success: true, evaluation: getMockEvaluation(answer) });
    }
});

// ─── POST /api/ai/generate-question ───────────────────────────────────────────
router.post('/generate-question', verifyToken, async (req, res) => {
    const { role, difficulty = 'medium', type = 'technical' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return res.json({
            success: true,
            question: `Tell me about a challenging ${type} problem you solved recently as a ${role || 'developer'}.`
        });
    }

    const prompt = `Generate a single ${difficulty} difficulty ${type} interview question for a ${role || 'software developer'} role. Return ONLY the question text, nothing else.`;
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
        );
        const question = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'Tell me about yourself and your experience.';
        res.json({ success: true, question });
    } catch (err) {
        res.json({ success: true, question: 'Tell me about a recent project you worked on and the challenges you faced.' });
    }
});

function getMockEvaluation(answer) {
    const len = answer.split(' ').length;
    const baseScore = Math.min(90, Math.max(40, 50 + len * 0.8));
    return {
        communicationScore: Math.round(baseScore + Math.random() * 10),
        confidenceScore: Math.round(baseScore - 5 + Math.random() * 15),
        clarityScore: Math.round(baseScore + Math.random() * 8),
        professionalismScore: Math.round(baseScore + 5 + Math.random() * 10),
        overallScore: Math.round(baseScore + Math.random() * 10),
        strengths: [
            'Demonstrated understanding of the question',
            'Provided a structured response',
            'Showed relevant knowledge and experience'
        ],
        improvements: [
            'Use the STAR method (Situation, Task, Action, Result) for behavioral questions',
            'Add specific metrics or numbers to make your answer more compelling',
            'Conclude with what you learned or how it benefited the team'
        ],
        idealAnswer: 'An ideal answer would use the STAR method with specific examples, measurable outcomes, and a clear connection to the skills required for the role.',
        rating: baseScore > 75 ? 'Good' : baseScore > 60 ? 'Average' : 'Needs Improvement',
        summary: 'The response shows basic understanding but could be strengthened with more specific examples and quantified results.'
    };
}

module.exports = router;
