/**
 * CareerForge AI - Shared Utilities
 * Auth, API helpers, Toast notifications, UI utils
 */

// ─── API Configuration ─────────────────────────────────────────────────────────
const API_BASE = '/api';

// ─── Auth Utilities ────────────────────────────────────────────────────────────
const Auth = {
    getToken: () => localStorage.getItem('cf_token'),
    getUser: () => { try { return JSON.parse(localStorage.getItem('cf_user')); } catch { return null; } },
    setSession: (token, user) => { localStorage.setItem('cf_token', token); localStorage.setItem('cf_user', JSON.stringify(user)); },
    clearSession: () => { localStorage.removeItem('cf_token'); localStorage.removeItem('cf_user'); },
    isLoggedIn: () => !!localStorage.getItem('cf_token'),
    requireAuth: () => {
        if (!Auth.isLoggedIn()) {
            window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
            return false;
        }
        return true;
    },
    logout: () => { Auth.clearSession(); window.location.href = '/'; }
};

// ─── API Helper ───────────────────────────────────────────────────────────────
const API = {
    request: async (endpoint, options = {}) => {
        const token = Auth.getToken();
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        if (options.body instanceof FormData) delete headers['Content-Type'];
        try {
            const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
            const data = await res.json();
            if (res.status === 401 || res.status === 403) {
                Auth.clearSession();
                window.location.href = '/login';
                return;
            }
            return data;
        } catch (err) {
            console.error('API error:', err);
            throw err;
        }
    },
    get: (endpoint) => API.request(endpoint, { method: 'GET' }),
    post: (endpoint, body) => API.request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
    put: (endpoint, body) => API.request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
    upload: (endpoint, formData) => API.request(endpoint, { method: 'POST', body: formData })
};

// ─── Toast Notifications ───────────────────────────────────────────────────────
const Toast = {
    container: null,
    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },
    show(message, type = 'info', duration = 4000) {
        this.init();
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span><button class="toast-close" onclick="this.parentElement.remove()">×</button>`;
        this.container.appendChild(toast);
        if (duration > 0) setTimeout(() => { toast.style.animation = 'slideInRight 0.3s ease reverse'; setTimeout(() => toast.remove(), 300); }, duration);
        return toast;
    },
    success: (msg, d) => Toast.show(msg, 'success', d),
    error: (msg, d) => Toast.show(msg, 'error', d),
    warning: (msg, d) => Toast.show(msg, 'warning', d),
    info: (msg, d) => Toast.show(msg, 'info', d)
};

// ─── Dark Mode ─────────────────────────────────────────────────────────────────
const ThemeManager = {
    init() {
        const saved = localStorage.getItem('cf_theme');
        if (saved === 'dark') document.body.classList.add('dark-mode');
        document.querySelectorAll('.theme-toggle, #themeToggle').forEach(btn => {
            btn.addEventListener('click', () => this.toggle());
        });
    },
    toggle() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('cf_theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    }
};

// ─── UI Utilities ──────────────────────────────────────────────────────────────
const UI = {
    // Set button loading state
    setLoading(btn, loading, text = '') {
        if (loading) {
            btn._originalText = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner spinner-sm"></span>${text || 'Loading...'}`;
        } else {
            btn.disabled = false;
            btn.innerHTML = btn._originalText || text;
        }
    },
    // Animate progress bar
    animateProgress(element, value, delay = 100) {
        setTimeout(() => { if (element) element.style.width = `${Math.min(100, value)}%`; }, delay);
    },
    // Score color helper
    scoreColor(score) {
        if (score >= 80) return 'success';
        if (score >= 60) return 'primary';
        if (score >= 40) return 'warning';
        return 'danger';
    },
    // Format salary
    formatSalary(min, max, currency = '$') {
        if (!min && !max) return 'Not disclosed';
        const fmt = (n) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : n;
        if (min && max) return `${currency}${fmt(min)} - ${currency}${fmt(max)}`;
        return `${currency}${fmt(min || max)}`;
    },
    // Relative time
    timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const days = Math.floor(diff / 86400000);
        if (days === 0) return 'Today';
        if (days === 1) return 'Yesterday';
        if (days < 7) return `${days} days ago`;
        if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
        return `${Math.floor(days / 30)} months ago`;
    },
    // Update user display across navbar/dashboard
    updateUserDisplay(user) {
        document.querySelectorAll('.user-name').forEach(el => el.textContent = user.fullName || 'User');
        document.querySelectorAll('.user-email').forEach(el => el.textContent = user.email || '');
        document.querySelectorAll('.user-avatar').forEach(el => el.textContent = (user.fullName || 'U')[0].toUpperCase());
    },
    // Tabs
    initTabs(container) {
        const buttons = container.querySelectorAll('.tab-btn');
        const contents = container.querySelectorAll('.tab-content');
        buttons.forEach(btn => {
            btn.addEventListener('click', () => {
                buttons.forEach(b => b.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const target = container.querySelector(`#${btn.dataset.tab}`);
                if (target) target.classList.add('active');
            });
        });
        if (buttons[0]) buttons[0].click();
    }
};

// ─── Navbar Setup ──────────────────────────────────────────────────────────────
function initNavbar() {
    ThemeManager.init();
    const user = Auth.getUser();
    const navLoginBtn = document.getElementById('navLoginBtn');
    const navRegisterBtn = document.getElementById('navRegisterBtn');
    const navUserMenu = document.getElementById('navUserMenu');
    const navUserName = document.getElementById('navUserName');
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');

    if (user && Auth.isLoggedIn()) {
        if (navLoginBtn) navLoginBtn.style.display = 'none';
        if (navRegisterBtn) navRegisterBtn.style.display = 'none';
        if (navUserMenu) navUserMenu.style.display = 'flex';
        if (navUserName) navUserName.textContent = user.fullName?.split(' ')[0] || 'User';
    } else {
        if (navUserMenu) navUserMenu.style.display = 'none';
    }

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => navLinks.classList.toggle('mobile-open'));
    }

    // Mark active link
    const path = window.location.pathname;
    document.querySelectorAll('.nav-links a').forEach(a => {
        if (a.getAttribute('href') === path) a.classList.add('active');
    });

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        const navbar = document.querySelector('.navbar');
        if (navbar) navbar.style.boxShadow = window.scrollY > 20 ? 'var(--shadow-lg)' : '';
    });
}

// ─── Init on DOM Load ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', initNavbar);

// Make available globally
window.Auth = Auth;
window.API = API;
window.Toast = Toast;
window.UI = UI;
window.ThemeManager = ThemeManager;
