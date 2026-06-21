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
        return res.json({ success: true, evaluation: getMockEvaluation(answer, questionType) });
    }

    // Build a type-aware prompt so Gemini gives domain-appropriate feedback
    const isTechnical = questionType === 'technical';
    const evaluationFocus = isTechnical
        ? `Focus your evaluation on:
- Technical accuracy and correctness
- Completeness (are all key aspects covered?)
- Depth of explanation (surface-level vs. expert understanding)
- Problem-solving approach and reasoning
- Missing concepts, edge cases, or caveats
- Best practices and real-world considerations
Do NOT use HR / behavioural framing. Do NOT mention the STAR method.`
        : `Focus your evaluation on:
- Communication clarity and structure
- Use of specific examples (STAR method: Situation, Task, Action, Result)
- Professionalism and confidence in tone
- Relevance to the question asked
- Missing context, quantified outcomes, or lessons learned`;

    const prompt = `You are an expert interview coach evaluating a candidate's ${isTechnical ? 'technical' : 'HR behavioural'} interview response.

Question: ${question}
Candidate's Answer: ${answer}

${evaluationFocus}

Respond ONLY with valid JSON in this exact format:
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
        res.json({ success: true, evaluation: getMockEvaluation(answer, questionType) });
    } catch (err) {
        console.error('Gemini evaluation error:', err.message);
        res.json({ success: true, evaluation: getMockEvaluation(answer, questionType) });
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

/**
 * Route mock evaluation to the correct type-specific function.
 * questionType: 'hr' (default) | 'technical'
 */
function getMockEvaluation(answer, questionType) {
    if (questionType === 'technical') {
        return getMockTechnicalEvaluation(answer);
    }
    return getMockHrEvaluation(answer);
}

/**
 * Mock evaluation for HR / behavioural questions.
 * Feedback focuses on communication, structure, and storytelling (STAR).
 * This function is unchanged from the original — HR interview behaviour preserved.
 */
function getMockHrEvaluation(answer) {
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

/**
 * Mock evaluation for technical interview questions.
 * Feedback focuses on technical accuracy, completeness, depth, and best practices.
 * No HR / STAR / behavioural language used here.
 */
function getMockTechnicalEvaluation(answer) {
    const len = answer.split(' ').length;
    const baseScore = Math.min(90, Math.max(40, 50 + len * 0.8));

    // Vary feedback slightly based on answer length so longer answers score higher
    const isDetailed = len >= 40;
    const isShort = len < 15;

    const strengths = isDetailed
        ? [
            'Covered the core concept accurately',
            'Provided a concrete example to support the explanation',
            'Demonstrated awareness of practical trade-offs'
        ]
        : [
            'Identified the key concept in the question',
            'Gave a direct answer without unnecessary filler'
        ];

    const improvements = isShort
        ? [
            'Expand the explanation — interviewers expect depth, not just a definition',
            'Include a concrete code example or real-world use case',
            'Mention edge cases or known limitations of the concept',
            'Discuss time/space complexity or performance implications where applicable'
        ]
        : [
            'Mention any relevant edge cases or failure scenarios',
            'Compare with alternative approaches and explain when each is preferred',
            'Reference best practices or common pitfalls developers encounter',
            'Discuss how this concept behaves in production at scale'
        ];

    const idealAnswer = isShort
        ? 'An ideal answer defines the concept precisely, demonstrates it with a working code snippet or concrete example, explains why it works that way, and notes any important edge cases or performance considerations.'
        : 'An ideal answer goes beyond the definition: it compares alternatives, discusses real-world trade-offs, mentions best practices, and addresses edge cases or complexity implications that a senior engineer would consider.';

    return {
        communicationScore: Math.round(baseScore + Math.random() * 10),
        confidenceScore: Math.round(baseScore - 5 + Math.random() * 15),
        clarityScore: Math.round(baseScore + Math.random() * 8),
        professionalismScore: Math.round(baseScore + 5 + Math.random() * 10),
        overallScore: Math.round(baseScore + Math.random() * 10),
        strengths,
        improvements,
        idealAnswer,
        rating: baseScore > 75 ? 'Good' : baseScore > 60 ? 'Average' : 'Needs Improvement',
        summary: isShort
            ? 'The answer touches on the concept but lacks the depth and examples expected at a technical interview. Expand with specifics.'
            : 'The answer demonstrates a solid understanding of the topic. Adding edge cases and trade-off comparisons would elevate it to an excellent response.'
    };
}

module.exports = router;
