/**
 * Resume Routes - Upload and Analysis
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { verifyToken } = require('./auth');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `resume_${req.user?.id || 'guest'}_${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.docx', '.doc', '.txt'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error('Only PDF, DOCX, DOC, TXT files are allowed'));
    }
});

// ─── Extract text from uploaded file ──────────────────────────────────────────
async function extractText(filePath, mimetype) {
    const ext = path.extname(filePath).toLowerCase();
    try {
        if (ext === '.pdf') {
            const pdfParse = require('pdf-parse');
            const buffer = fs.readFileSync(filePath);
            const data = await pdfParse(buffer);
            return data.text;
        } else if (ext === '.docx' || ext === '.doc') {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ path: filePath });
            return result.value;
        } else {
            return fs.readFileSync(filePath, 'utf-8');
        }
    } catch (err) {
        console.error('Text extraction error:', err.message);
        return '';
    }
}

// ─── Analyze with Gemini API ──────────────────────────────────────────────────
async function analyzeWithGemini(resumeText) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return getMockAnalysis();
    }
    const prompt = `You are an expert ATS resume analyzer and career coach. Analyze this resume and provide a detailed JSON response.

Resume Content:
${resumeText.substring(0, 8000)}

Respond ONLY with valid JSON in this exact format:
{
  "resumeScore": <number 0-100>,
  "atsScore": <number 0-100>,
  "skills": [<list of skills found>],
  "strengths": [<list of 4-6 strengths>],
  "weaknesses": [<list of 3-5 weaknesses>],
  "missingSkills": [<list of 4-6 important missing skills>],
  "improvements": [<list of 5-7 specific improvement suggestions>],
  "keywords": [<list of ATS keywords found>],
  "summary": "<brief 2-sentence professional summary>",
  "experienceLevel": "<Junior/Mid/Senior>",
  "topRoles": [<list of 3 best matching roles>]
}`;
    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
            { contents: [{ parts: [{ text: prompt }] }] },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );
        const text = response.data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return JSON.parse(jsonMatch[0]);
        return getMockAnalysis();
    } catch (err) {
        console.error('Gemini API error:', err.message);
        return getMockAnalysis();
    }
}

function getMockAnalysis() {
    return {
        resumeScore: 72,
        atsScore: 68,
        skills: ['JavaScript', 'HTML', 'CSS', 'React', 'Node.js', 'Git'],
        strengths: [
            'Clear project descriptions with measurable outcomes',
            'Relevant technical skill set for modern web development',
            'Good educational background',
            'Shows practical experience with real projects'
        ],
        weaknesses: [
            'Missing quantified achievements in work experience',
            'No mention of soft skills or leadership experience',
            'Summary section could be more impactful'
        ],
        missingSkills: ['TypeScript', 'Docker', 'Testing (Jest/Cypress)', 'Cloud (AWS/GCP)', 'System Design'],
        improvements: [
            'Add quantified achievements (e.g., "Improved page load time by 40%")',
            'Include a strong professional summary at the top',
            'Add TypeScript to your skill set — highly demanded',
            'Mention any cloud experience or certifications',
            'Add links to GitHub projects and portfolio',
            'Use consistent formatting and bullet points',
            'Include keywords from job descriptions you are targeting'
        ],
        keywords: ['JavaScript', 'React', 'REST API', 'Agile', 'Git'],
        summary: 'A motivated developer with practical experience in modern web technologies. Shows potential for growth in full-stack development roles.',
        experienceLevel: 'Junior',
        topRoles: ['Frontend Developer', 'Full Stack Developer', 'React Developer']
    };
}

// ─── POST /api/resume/upload ───────────────────────────────────────────────────
router.post('/upload', verifyToken, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const resumeText = await extractText(req.file.path, req.file.mimetype);
        if (!resumeText || resumeText.trim().length < 50) {
            return res.status(400).json({ success: false, message: 'Could not extract sufficient text from resume. Please try a different format.' });
        }
        const analysis = await analyzeWithGemini(resumeText);
        // Update user profile
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
        const index = users.findIndex(u => u.id === req.user.id);
        if (index !== -1) {
            users[index].resumeScore = analysis.resumeScore;
            users[index].atsScore = analysis.atsScore;
            users[index].skills = analysis.skills || [];
            users[index].resumeAnalysis = analysis;
            users[index].recommendedRoles = analysis.topRoles || [];
            users[index].resumeUploadedAt = new Date().toISOString();
            fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        }
        // Clean up uploaded file after analysis
        try { fs.unlinkSync(req.file.path); } catch { }
        res.json({ success: true, message: 'Resume analyzed successfully', analysis });
    } catch (err) {
        console.error('Resume upload error:', err);
        res.status(500).json({ success: false, message: 'Resume analysis failed. Please try again.' });
    }
});

// ─── GET /api/resume/analysis ──────────────────────────────────────────────────
router.get('/analysis', verifyToken, (req, res) => {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    const user = users.find(u => u.id === req.user.id);
    if (!user || !user.resumeAnalysis) {
        return res.status(404).json({ success: false, message: 'No resume analysis found. Please upload your resume first.' });
    }
    res.json({ success: true, analysis: user.resumeAnalysis });
});

module.exports = router;
