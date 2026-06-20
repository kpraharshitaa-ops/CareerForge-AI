/**
 * Career Roles Routes - Role matching and recommendations
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('./auth');

const ROLES_FILE = path.join(__dirname, '..', 'data', 'roles.json');
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// Load roles
const getRoles = () => JSON.parse(fs.readFileSync(ROLES_FILE, 'utf-8'));

// ─── Match user skills against roles ──────────────────────────────────────────
function calculateMatch(userSkills, roleSkills) {
    if (!userSkills || userSkills.length === 0) return 0;
    const normalizedUser = userSkills.map(s => s.toLowerCase().trim());
    const normalizedRole = roleSkills.map(s => s.toLowerCase().trim());
    let matches = 0;
    normalizedRole.forEach(skill => {
        if (normalizedUser.some(us => us.includes(skill) || skill.includes(us))) {
            matches++;
        }
    });
    return Math.round((matches / normalizedRole.length) * 100);
}

// ─── GET /api/roles ───────────────────────────────────────────────────────────
router.get('/', (req, res) => {
    try {
        const roles = getRoles();
        res.json({ success: true, roles });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to load roles' });
    }
});

// ─── GET /api/roles/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
    const roles = getRoles();
    const role = roles.find(r => r.id === req.params.id);
    if (!role) return res.status(404).json({ success: false, message: 'Role not found' });
    res.json({ success: true, role });
});

// ─── POST /api/roles/match ────────────────────────────────────────────────────
router.post('/match', (req, res) => {
    try {
        const { skills } = req.body;
        if (!skills || !Array.isArray(skills)) {
            return res.status(400).json({ success: false, message: 'Skills array required' });
        }
        const roles = getRoles();
        const matches = roles.map(role => {
            const matchPercent = calculateMatch(skills, role.requiredSkills);
            const missingSkills = role.requiredSkills.filter(rs =>
                !skills.some(us => us.toLowerCase().includes(rs.toLowerCase()) || rs.toLowerCase().includes(us.toLowerCase()))
            );
            return { ...role, matchPercent, missingSkills };
        });
        matches.sort((a, b) => b.matchPercent - a.matchPercent);
        res.json({ success: true, matches, topRoles: matches.slice(0, 5) });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Matching failed' });
    }
});

// ─── GET /api/roles/recommendations/:userId ───────────────────────────────────
router.get('/recommendations/me', verifyToken, (req, res) => {
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        const user = users.find(u => u.id === req.user.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        if (!user.skills || user.skills.length === 0) {
            return res.json({ success: true, message: 'Upload resume to get personalized recommendations', matches: [] });
        }
        const roles = getRoles();
        const matches = roles.map(role => {
            const matchPercent = calculateMatch(user.skills, role.requiredSkills);
            const missingSkills = role.requiredSkills.filter(rs =>
                !user.skills.some(us => us.toLowerCase().includes(rs.toLowerCase()) || rs.toLowerCase().includes(us.toLowerCase()))
            );
            return { ...role, matchPercent, missingSkills };
        });
        matches.sort((a, b) => b.matchPercent - a.matchPercent);
        res.json({ success: true, matches, topRoles: matches.slice(0, 5), userSkills: user.skills });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Failed to get recommendations' });
    }
});

module.exports = router;
