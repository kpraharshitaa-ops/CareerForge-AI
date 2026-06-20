/**
 * Job Discovery Routes - JSearch API Integration
 */
const express = require('express');
const router = express.Router();
const axios = require('axios');

// Mock jobs for fallback
const MOCK_JOBS = [
    { job_id: '1', job_title: 'Frontend Developer', employer_name: 'TechCorp Inc.', job_city: 'Bangalore', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 600000, job_max_salary: 1200000, job_description: 'Build amazing user interfaces with React and TypeScript. 2+ years experience required.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['React', 'TypeScript', 'CSS', 'JavaScript'] },
    { job_id: '2', job_title: 'Backend Engineer', employer_name: 'StartupXYZ', job_city: 'Mumbai', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 800000, job_max_salary: 1500000, job_description: 'Design and build scalable APIs with Node.js and PostgreSQL. Strong problem-solving skills needed.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['Node.js', 'PostgreSQL', 'Docker', 'REST APIs'] },
    { job_id: '3', job_title: 'Full Stack Developer', employer_name: 'Global Solutions Ltd.', job_city: 'Hyderabad', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 700000, job_max_salary: 1400000, job_description: 'Join our growing team to build end-to-end features. Must know React, Node.js and databases.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['React', 'Node.js', 'MongoDB', 'Git'] },
    { job_id: '4', job_title: 'Data Scientist', employer_name: 'Analytics Pro', job_city: 'Pune', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 1000000, job_max_salary: 2000000, job_description: 'Apply ML and statistical modeling to solve complex business problems.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['Python', 'Machine Learning', 'SQL', 'Statistics'] },
    { job_id: '5', job_title: 'DevOps Engineer', employer_name: 'CloudFirst Technologies', job_city: 'Chennai', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 900000, job_max_salary: 1800000, job_description: 'Manage CI/CD pipelines, Kubernetes clusters, and cloud infrastructure on AWS.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['Kubernetes', 'Docker', 'AWS', 'Terraform'] },
    { job_id: '6', job_title: 'UI/UX Designer', employer_name: 'Design Studio Co.', job_city: 'Delhi', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 500000, job_max_salary: 1000000, job_description: 'Create stunning designs and intuitive user experiences for mobile and web applications.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['Figma', 'UI Design', 'Prototyping', 'User Research'] },
    { job_id: '7', job_title: 'Machine Learning Engineer', employer_name: 'AI Ventures', job_city: 'Bangalore', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 1200000, job_max_salary: 2500000, job_description: 'Build and deploy production ML models. Experience with TensorFlow/PyTorch required.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['Python', 'TensorFlow', 'PyTorch', 'MLOps'] },
    { job_id: '8', job_title: 'React Native Developer', employer_name: 'MobileFirst Apps', job_city: 'Noida', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 600000, job_max_salary: 1200000, job_description: 'Build cross-platform mobile apps using React Native. iOS and Android experience preferred.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['React Native', 'JavaScript', 'iOS', 'Android'] },
    { job_id: '9', job_title: 'Java Developer', employer_name: 'Enterprise Systems Corp', job_city: 'Bangalore', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 700000, job_max_salary: 1400000, job_description: 'Build enterprise-grade Spring Boot microservices. Strong OOP fundamentals required.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['Java', 'Spring Boot', 'Microservices', 'SQL'] },
    { job_id: '10', job_title: 'Cybersecurity Analyst', employer_name: 'SecureNet Solutions', job_city: 'Mumbai', job_country: 'IN', job_employment_type: 'FULLTIME', job_min_salary: 800000, job_max_salary: 1600000, job_description: 'Monitor security events, perform threat analysis, and respond to incidents.', job_apply_link: '#', job_posted_at_datetime_utc: new Date().toISOString(), employer_logo: null, job_required_skills: ['SIEM', 'Network Security', 'Incident Response', 'Linux'] }
];

// ─── GET /api/jobs/search ─────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
    const { query = 'software developer', location = 'India', page = 1, num_pages = 1 } = req.query;
    const apiKey = process.env.JSEARCH_API_KEY;

    if (!apiKey || apiKey === 'your_jsearch_api_key_here') {
        // Return filtered mock data
        const filtered = MOCK_JOBS.filter(job =>
            job.job_title.toLowerCase().includes(query.toLowerCase()) ||
            (job.job_required_skills || []).some(s => s.toLowerCase().includes(query.toLowerCase()))
        );
        return res.json({
            success: true,
            data: filtered.length > 0 ? filtered : MOCK_JOBS,
            total: filtered.length,
            page: parseInt(page),
            isMock: true
        });
    }

    try {
        const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
            params: { query: `${query} in ${location}`, page, num_pages },
            headers: {
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            },
            timeout: 10000
        });
        res.json({ success: true, data: response.data.data || [], total: response.data.data?.length || 0, page: parseInt(page) });
    } catch (err) {
        console.error('JSearch API error:', err.message);
        res.json({ success: true, data: MOCK_JOBS, total: MOCK_JOBS.length, page: 1, isMock: true });
    }
});

// ─── GET /api/jobs/mock ───────────────────────────────────────────────────────
router.get('/mock', (req, res) => {
    res.json({ success: true, data: MOCK_JOBS, total: MOCK_JOBS.length });
});

module.exports = router;
