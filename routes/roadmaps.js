/**
 * Career Roadmaps Routes
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const ROADMAPS_FILE = path.join(__dirname, '..', 'data', 'roadmaps.json');
const ROLES_FILE = path.join(__dirname, '..', 'data', 'roles.json');

// ─── GET /api/roadmaps ────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const roadmaps = JSON.parse(fs.readFileSync(ROADMAPS_FILE, 'utf-8'));
        const roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf-8'));
        // Return list of available roadmaps with basic info
        const list = Object.keys(roadmaps).map(key => ({
            id: key,
            title: roadmaps[key].title,
            totalDuration: roadmaps[key].totalDuration,
            phases: roadmaps[key].phases.length,
            role: roles.find(r => r.id === key) || null
        }));
        res.json({ success: true, roadmaps: list });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load roadmaps' });
    }
});

// ─── GET /api/roadmaps/:id ────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    try {
        const roadmaps = JSON.parse(fs.readFileSync(ROADMAPS_FILE, 'utf-8'));
        const roles = JSON.parse(fs.readFileSync(ROLES_FILE, 'utf-8'));
        const roadmap = roadmaps[req.params.id];
        if (!roadmap) {
            // If no specific roadmap, return generic one based on roles
            const role = roles.find(r => r.id === req.params.id);
            if (!role) return res.status(404).json({ success: false, message: 'Roadmap not found' });
            // Generate a basic roadmap from role data
            return res.json({
                success: true,
                roadmap: {
                    title: `${role.title} Roadmap`,
                    totalDuration: '6-12 months',
                    phases: [
                        { phase: 1, title: 'Foundation Skills', duration: '4-6 weeks', skills: role.requiredSkills.slice(0, 4), resources: ['Official Documentation', 'YouTube tutorials', 'freeCodeCamp'], projects: ['Beginner project', 'Tutorial project'] },
                        { phase: 2, title: 'Core Skills', duration: '6-8 weeks', skills: role.requiredSkills.slice(4), resources: ['Online courses (Udemy, Coursera)', 'Books', 'Practice projects'], projects: ['Build a real-world project', 'Clone a popular app'] },
                        { phase: 3, title: 'Advanced Topics', duration: '4-6 weeks', skills: role.niceToHave?.slice(0, 4) || [], resources: ['Advanced courses', 'Open source contributions'], projects: ['Full-stack project', 'Portfolio project'] },
                        { phase: 4, title: 'Job Readiness', duration: '2-4 weeks', skills: ['Interview prep', 'System design', 'Portfolio polish', 'Networking'], resources: ['LeetCode', 'Interview handbook', 'LinkedIn'], projects: ['Final portfolio project'] }
                    ],
                    careerPath: role.careerPath || []
                }
            });
        }
        res.json({ success: true, roadmap });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load roadmap' });
    }
});

module.exports = router;
