/**
 * OMNIBUS PROTOCOL PRO - UI ENGINE (ui.js)
 * Rendering, Tab Switching, Modals, Audio Synthesis, Toast Feedback, Accessibility, Canvas Animation & XSS Sanitization.
 */

const UIEngine = {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,

    init: function() {
        this.initParticleCanvas();
        this.runClock();
        setInterval(() => this.runClock(), 1000);
        
        // Listen for visibility changes to pause particle canvas when tab is hidden
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.pauseCanvas();
            else this.resumeCanvas();
        });
    },

    /**
     * XSS Prevention Utility: Escapes HTML special characters
     */
    escapeHTML: function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    canvasAnimId: null,

    initParticleCanvas: function() {
        if (this.reducedMotion) return; // Respect prefers-reduced-motion

        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let w = canvas.width = window.innerWidth;
        let h = canvas.height = window.innerHeight;
        
        window.addEventListener('resize', () => {
            w = canvas.width = window.innerWidth;
            h = canvas.height = window.innerHeight;
        });

        const particles = [];
        for (let i = 0; i < 25; i++) {
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                radius: Math.random() * 2 + 1
            });
        }

        const draw = () => {
            if (document.hidden || this.reducedMotion) return;
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';

            for (let i = 0; i < particles.length; i++) {
                let p = particles[i];
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
                if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();

                for (let j = i + 1; j < particles.length; j++) {
                    let p2 = particles[j];
                    let dist = Math.hypot(p.x - p2.x, p.y - p2.y);
                    if (dist < 120) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            }
            this.canvasAnimId = requestAnimationFrame(draw);
        };
        draw();
    },

    pauseCanvas: function() {
        if (this.canvasAnimId) {
            cancelAnimationFrame(this.canvasAnimId);
            this.canvasAnimId = null;
        }
    },

    resumeCanvas: function() {
        if (!this.canvasAnimId && !this.reducedMotion) {
            this.initParticleCanvas();
        }
    },

    runClock: function() {
        const now = new Date();
        const clockEl = document.getElementById('clock');
        const dateEl = document.getElementById('date-display');
        
        if (clockEl) clockEl.textContent = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
        if (dateEl) dateEl.textContent = now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    },

    switchTab: function(tabId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item, .sidebar-btn').forEach(el => el.classList.remove('active'));

        const targetTab = document.getElementById('tab-' + tabId);
        if (targetTab) targetTab.classList.add('active');

        document.querySelectorAll(`[data-tab="${tabId}"]`).forEach(el => el.classList.add('active'));
        window.scrollTo(0, 0);

        if (window.app && window.app.onTabSwitch) window.app.onTabSwitch(tabId);
    },

    showToast: function(msg) {
        const toast = document.getElementById('toast');
        const msgEl = document.getElementById('toast-msg');
        if (toast && msgEl) {
            msgEl.textContent = msg; // Safe textContent replacement
            toast.classList.add('show');
            setTimeout(() => toast.classList.remove('show'), 2200);
        }
    },

    playAudioFeedback: function(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            if (type === 'click') {
                osc.frequency.setValueAtTime(480, ctx.currentTime);
                gain.gain.setValueAtTime(0.04, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                osc.start(); osc.stop(ctx.currentTime + 0.08);
            } else if (type === 'success') {
                osc.frequency.setValueAtTime(523.25, ctx.currentTime);
                osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08);
                osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16);
                gain.gain.setValueAtTime(0.06, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
                osc.start(); osc.stop(ctx.currentTime + 0.28);
            }
        } catch(e) {}
    }
};

window.UIEngine = UIEngine;
