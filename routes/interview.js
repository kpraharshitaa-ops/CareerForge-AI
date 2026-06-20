/**
 * Interview Preparation Routes - HR & Technical Questions
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const HR_FILE = path.join(__dirname, '..', 'data', 'hrQuestions.json');
const TECH_FILE = path.join(__dirname, '..', 'data', 'technicalQuestions.json');

// ─── GET /api/interview/hr ────────────────────────────────────────────────────
router.get('/hr', (req, res) => {
    try {
        const questions = JSON.parse(fs.readFileSync(HR_FILE, 'utf-8'));
        const { category, company, shuffle } = req.query;
        let filtered = questions;
        if (category) filtered = filtered.filter(q => q.category?.toLowerCase() === category.toLowerCase());
        if (company) filtered = filtered.filter(q => q.company === company || q.company === 'All');
        if (shuffle === 'true') filtered = filtered.sort(() => Math.random() - 0.5);
        res.json({ success: true, questions: filtered, total: filtered.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load HR questions' });
    }
});

// ─── GET /api/interview/hr/categories ─────────────────────────────────────────
router.get('/hr/categories', (req, res) => {
    const questions = JSON.parse(fs.readFileSync(HR_FILE, 'utf-8'));
    const categories = [...new Set(questions.map(q => q.category))];
    res.json({ success: true, categories });
});

// ─── GET /api/interview/technical ────────────────────────────────────────────
router.get('/technical', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(TECH_FILE, 'utf-8'));
        const { category } = req.query;
        if (category && data[category]) {
            return res.json({ success: true, questions: data[category], category, total: data[category].length });
        }
        // Return all categories
        const categories = Object.keys(data).map(key => ({
            id: key,
            label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
            count: data[key].length
        }));
        res.json({ success: true, categories, allQuestions: data });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load technical questions' });
    }
});

// ─── GET /api/interview/technical/:category ───────────────────────────────────
router.get('/technical/:category', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(TECH_FILE, 'utf-8'));
        const questions = data[req.params.category];
        if (!questions) return res.status(404).json({ success: false, message: 'Category not found' });
        res.json({ success: true, questions, category: req.params.category, total: questions.length });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load questions' });
    }
});

module.exports = router;
