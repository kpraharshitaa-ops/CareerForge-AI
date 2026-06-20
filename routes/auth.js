/**
 * Authentication Routes - Register, Login, Profile
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'careerforge_secret';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const readUsers = () => {
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch { return []; }
};

const writeUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Access token required' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
};

// ─── POST /api/auth/register ──────────────────────────────────────────────────
router.post('/register', async (req, res) => {
    try {
        const { fullName, email, password } = req.body;
        if (!fullName || !email || !password) {
            return res.status(400).json({ success: false, message: 'All fields are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        const users = readUsers();
        if (users.find(u => u.email === email.toLowerCase())) {
            return res.status(409).json({ success: false, message: 'Email already registered' });
        }
        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = {
            id: uuidv4(),
            fullName: fullName.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            createdAt: new Date().toISOString(),
            resumeScore: 0,
            interviewReadiness: 0,
            skillMatchScore: 0,
            recommendedRoles: [],
            resumeAnalysis: null,
            skills: []
        };
        users.push(newUser);
        writeUsers(users);
        const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json({ success: true, message: 'Account created successfully', token, user: userWithoutPassword });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ success: false, message: 'Registration failed' });
    }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }
        const users = readUsers();
        const user = users.find(u => u.email === email.toLowerCase().trim());
        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
        const { password: _, ...userWithoutPassword } = user;
        res.json({ success: true, message: 'Login successful', token, user: userWithoutPassword });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// ─── GET /api/auth/profile ────────────────────────────────────────────────────
router.get('/profile', verifyToken, (req, res) => {
    const users = readUsers();
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const { password: _, ...userWithoutPassword } = user;
    res.json({ success: true, user: userWithoutPassword });
});

// ─── PUT /api/auth/profile ────────────────────────────────────────────────────
router.put('/profile', verifyToken, (req, res) => {
    try {
        const users = readUsers();
        const index = users.findIndex(u => u.id === req.user.id);
        if (index === -1) return res.status(404).json({ success: false, message: 'User not found' });
        const allowedUpdates = ['fullName', 'skills', 'resumeScore', 'interviewReadiness', 'skillMatchScore', 'recommendedRoles', 'resumeAnalysis'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) users[index][field] = req.body[field];
        });
        writeUsers(users);
        const { password: _, ...userWithoutPassword } = users[index];
        res.json({ success: true, user: userWithoutPassword });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Update failed' });
    }
});

module.exports = router;
module.exports.verifyToken = verifyToken;
