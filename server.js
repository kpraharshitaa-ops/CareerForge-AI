/**
 * CareerForge AI - Main Server
 * Express.js backend serving API routes and static files
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// Import route modules
const authRoutes = require('./routes/auth');
const resumeRoutes = require('./routes/resume');
const rolesRoutes = require('./routes/roles');
const roadmapsRoutes = require('./routes/roadmaps');
const jobsRoutes = require('./routes/jobs');
const interviewRoutes = require('./routes/interview');
const aptitudeRoutes = require('./routes/aptitude');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data directory and user data files exist
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]');

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/roles', rolesRoutes);
app.use('/api/roadmaps', roadmapsRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/interview', interviewRoutes);
app.use('/api/aptitude', aptitudeRoutes);
app.use('/api/ai', aiRoutes);

// ─── Page Routes ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'register.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'dashboard.html'));
});

app.get('/resume', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'resume.html'));
});

app.get('/careers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'careers.html'));
});

app.get('/roadmap', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'roadmap.html'));
});

app.get('/jobs', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'jobs.html'));
});

app.get('/hr-interview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'hr-interview.html'));
});

app.get('/technical-interview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'technical-interview.html'));
});

app.get('/aptitude', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'aptitude.html'));
});

app.get('/voice-interview', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'voice-interview.html'));
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', 'pages', '404.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 CareerForge AI is running on http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Press Ctrl+C to stop\n`);
});

module.exports = app;
