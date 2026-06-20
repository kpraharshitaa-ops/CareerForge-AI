/**
 * Aptitude Quiz Routes
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const APTITUDE_FILE = path.join(__dirname, '..', 'data', 'aptitudeQuestions.json');

// ─── GET /api/aptitude ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const questions = JSON.parse(fs.readFileSync(APTITUDE_FILE, 'utf-8'));
        const { category, count = 20, shuffle = 'true' } = req.query;
        let filtered = questions;
        if (category) {
            filtered = filtered.filter(q => q.category.toLowerCase().includes(category.toLowerCase()));
        }
        if (shuffle === 'true') filtered = filtered.sort(() => Math.random() - 0.5);
        const limited = filtered.slice(0, parseInt(count));
        // Remove answers from response for quiz mode
        const quizQuestions = limited.map(({ explanation, answer, ...q }) => q);
        res.json({ success: true, questions: quizQuestions, total: limited.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load aptitude questions' });
    }
});

// ─── GET /api/aptitude/categories ────────────────────────────────────────────
router.get('/categories', (req, res) => {
    const questions = JSON.parse(fs.readFileSync(APTITUDE_FILE, 'utf-8'));
    const categories = [...new Set(questions.map(q => q.category))];
    const stats = categories.map(cat => ({
        name: cat,
        count: questions.filter(q => q.category === cat).length
    }));
    res.json({ success: true, categories: stats });
});

// ─── POST /api/aptitude/submit ────────────────────────────────────────────────
router.post('/submit', (req, res) => {
    try {
        const { answers } = req.body; // { questionId: selectedAnswer, ... }
        if (!answers) return res.status(400).json({ success: false, message: 'Answers required' });
        const questions = JSON.parse(fs.readFileSync(APTITUDE_FILE, 'utf-8'));
        let correct = 0;
        const results = [];
        Object.entries(answers).forEach(([qId, userAnswer]) => {
            const question = questions.find(q => q.id == qId);
            if (question) {
                const isCorrect = question.answer === userAnswer;
                if (isCorrect) correct++;
                results.push({
                    id: question.id,
                    question: question.question,
                    yourAnswer: userAnswer,
                    correctAnswer: question.answer,
                    explanation: question.explanation,
                    isCorrect,
                    category: question.category
                });
            }
        });
        const total = results.length;
        const score = Math.round((correct / total) * 100);
        res.json({ success: true, score, correct, total, results });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Submission failed' });
    }
});

module.exports = router;
