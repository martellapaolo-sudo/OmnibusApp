/**
 * OMNIBUS PROTOCOL PRO - MAIN APPLICATION CONTROLLER (app.js)
 * Version: v8.5-secure
 * Features:
 * - Complete XSS Sanitization via UIEngine.escapeHTML() & DOM Node Building
 * - Strict PWA Tab Shortcut Routing (?tab=...)
 * - QR Canvas / Image DOM Node Building (No Unsafe innerHTML)
 * - Custom Toast Feedback & Custom Modals (No Native Alert Interruptions)
 */

window.app = {
    APP_VERSION: 'v8.5-secure',
    currentDate: new Date().toISOString().split('T')[0],

    init: async function() {
        console.log(`Omnibus Protocol Pro ${this.APP_VERSION} Initializing...`);
        
        await StorageEngine.init();
        CryptoEngine;
        await SyncEngine.init();
        UIEngine.init();

        this.setupEventListeners();
        
        // Handle URL query parameters for PWA shortcuts (?tab=...)
        const urlParams = new URLSearchParams(window.location.search);
        const targetTab = urlParams.get('tab') || 'oggi';
        UIEngine.switchTab(targetTab);

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js').catch(err => console.log("SW Reg Error:", err));
        }
    },

    setupEventListeners: function() {
        document.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;

            if (action === 'switch-tab') {
                UIEngine.switchTab(btn.dataset.tab);
                UIEngine.playAudioFeedback('click');
            } else if (action === 'unlock-app') {
                const passInput = document.getElementById('lock-passphrase-input');
                if (passInput && SyncEngine.unlockApp(passInput.value)) {
                    passInput.value = '';
                }
            } else if (action === 'lock-app-manual') {
                SyncEngine.lockApp();
        } else if (action === 'save-sync-worker-url') {
    const input = document.getElementById('sync-worker-url');
    const url = input ? input.value.trim().replace(/\/$/, '') : '';

    try {
        const parsed = new URL(url);

        if (parsed.protocol !== 'https:') {
            throw new Error('Usa un URL HTTPS valido.');
        }

        await SyncEngine.saveSyncConfig(url);
        UIEngine.showToast('URL Worker salvato.');
    } catch (err) {
        UIEngine.showToast(err.message || 'Inserisci un URL Worker valido.');
    }
} else if (action === 'generate-qr-pairing') {
    await this.showQRPairingModal();
}else if (action === 'add-quick-water') {
                this.addWater(250);
            } else if (action === 'duplicate-yesterday-meals') {
                const count = await NutritionEngine.duplicateYesterdayMeals();
                UIEngine.showToast(`Copiati ${count} pasti di ieri! 🥗`);
                await this.renderOggiScreen();
            } else if (action === 'quick-active-recovery') {
                await TrainingEngine.quickLogActiveRecovery('recupero_attivo', 20, 'Mobilità & Camminata');
                UIEngine.showToast("🧘‍♂️ Recupero attivo registrato!");
                await this.renderOggiScreen();
            } else if (action === 'postpone-topic') {
                await StudyEngine.postponeReviewByOneDay(btn.dataset.topicId);
                UIEngine.showToast("📅 Argomento rinviato di 1 giorno.");
                await this.renderStudioScreen();
            } else if (action === 'export-json') {
                this.exportBackup();
            } else if (action === 'import-json') {
                this.importBackup();
            } else if (action === 'close-modal') {
                const target = document.getElementById(btn.dataset.target);
                if (target) target.classList.remove('show');
            }
        });

        const passInput = document.getElementById('lock-passphrase-input');
        if (passInput) {
            passInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (SyncEngine.unlockApp(passInput.value)) {
                        passInput.value = '';
                    }
                }
            });
        }
    },

    /**
     * Show QR Code Pairing Modal using DOM Node Image Creation (No Unsafe innerHTML)
     */
    showQRPairingModal: async function() {
        try {
            const data = await SyncEngine.generateQRPairingToken();
            const qrContainer = document.getElementById('qr-code-display');
            const tokenText = document.getElementById('qr-token-text');
            
            if (qrContainer && window.qrcode) {
                // Clear existing QR container safely
                while (qrContainer.firstChild) qrContainer.removeChild(qrContainer.firstChild);

                const typeNumber = 0;
                const errorCorrectionLevel = 'L';
                const qr = window.qrcode(typeNumber, errorCorrectionLevel);
                
                const qrPayload = JSON.stringify({
                    w: SyncEngine.syncUrl,
                    r: data.roomId,
                    t: data.token,
                    e: data.expiresAt
                });
                
                qr.addData(qrPayload);
                qr.make();

                // Safely create HTMLImageElement node via DOM API
                const img = document.createElement('img');
                img.src = qr.createDataURL(5, 10);
                img.alt = "Codice QR Pairing";
                img.style.maxWidth = "220px";
                img.style.borderRadius = "12px";
                qrContainer.appendChild(img);
            }

            if (tokenText) {
                tokenText.textContent = `Token: ${data.token} (Scade tra 10 min)`;
            }

            const modal = document.getElementById('modal-qr-pair');
            if (modal) modal.classList.add('show');
        } catch(err) {
            UIEngine.showToast(`⚠️ ${err.message}`);
        }
    },

    onTabSwitch: async function(tabId) {
        if (tabId === 'oggi') await this.renderOggiScreen();
        else if (tabId === 'studio') await this.renderStudioScreen();
        else if (tabId === 'allenamento') await this.renderAllenamentoScreen();
        else if (tabId === 'alimentazione') await this.renderAlimentazioneScreen();
        else if (tabId === 'storico') await this.renderStoricoScreen();
    },

    /**
     * Render Today Screen with Sanitized Text Node Building (XSS Safe)
     */
    renderOggiScreen: async function() {
        const todayStr = this.currentDate;
        const dailyTotals = await NutritionEngine.getDailyTotals(todayStr);
        const recoverySuggestions = await RecoveryEngine.generateSuggestions(todayStr);
        const exams = await StorageEngine.getAll('Exam');

        const countdownZone = document.getElementById('oggi-exam-countdown');
        if (countdownZone) {
            while (countdownZone.firstChild) countdownZone.removeChild(countdownZone.firstChild);
            if (exams.length > 0) {
                const nearestExam = exams.filter(e => new Date(e.date) >= new Date()).sort((a,b) => new Date(a.date) - new Date(b.date))[0];
                if (nearestExam) {
                    const days = Math.ceil((new Date(nearestExam.date) - new Date()) / (1000 * 60 * 60 * 24));
                    
                    const card = document.createElement('div');
                    card.className = 'glass-card';
                    card.style.borderColor = 'var(--pillar-study)';
                    card.style.background = 'rgba(59, 130, 246, 0.08)';

                    const title = document.createElement('div');
                    title.className = 'glass-title';
                    title.style.color = 'var(--pillar-study)';
                    title.textContent = `📚 Esame Imminente: ${nearestExam.name}`;

                    const countText = document.createElement('div');
                    countText.style.fontFamily = "'JetBrains Mono', monospace";
                    countText.style.fontSize = "2.2rem";
                    countText.style.fontWeight = "800";
                    countText.style.color = "#fff";
                    countText.textContent = `-${days} GIORNI`;

                    card.appendChild(title);
                    card.appendChild(countText);
                    countdownZone.appendChild(card);
                }
            }
        }

        const sugZone = document.getElementById('oggi-suggestions-zone');
        if (sugZone) {
            while (sugZone.firstChild) sugZone.removeChild(sugZone.firstChild);
            recoverySuggestions.forEach(s => {
                const item = document.createElement('div');
                item.className = 'med-note';
                item.style.cssText = "background: rgba(255,255,255,0.03); border:1px solid var(--glass-border); padding:12px 16px; border-radius:14px; margin-bottom:12px; font-size:0.85rem;";
                item.textContent = s; // Safe textContent
                sugZone.appendChild(item);
            });
        }

        const macroZone = document.getElementById('oggi-macro-summary');
        if (macroZone) {
            while (macroZone.firstChild) macroZone.removeChild(macroZone.firstChild);
            const t = dailyTotals.totals;

            const div = document.createElement('div');
            div.style.cssText = "display:flex; justify-content:space-between; font-family:'JetBrains Mono'; font-size:0.9rem; flex-wrap:wrap; gap:8px;";
            div.textContent = `🔥 ${t.kcal} kcal | 🍗 P: ${t.pro}g | 🍚 C: ${t.cho}g | 🥑 F: ${t.fat}g | 💧 ${t.waterMl} ml`;
            macroZone.appendChild(div);
        }
    },

    renderStudioScreen: async function() {
        const throttlingStats = await StudyEngine.throttleBacklogReviews();
        
        const badgeZone = document.getElementById('studio-backlog-badge');
        if (badgeZone) {
            while (badgeZone.firstChild) badgeZone.removeChild(badgeZone.firstChild);
            const badge = document.createElement('div');
            badge.style.cssText = "background: rgba(59, 130, 246, 0.12); border: 1px solid var(--pillar-study); color: #fff; padding: 10px 16px; border-radius: 14px; font-size: 0.85rem; font-weight: 700;";
            badge.textContent = `📖 ${throttlingStats.todayReviewsCount} Ripassi Oggi | 🔄 ${throttlingStats.rescheduledCount} Arretrati Riprogrammati Automaticamente`;
            badgeZone.appendChild(badge);
        }

        const exams = await StorageEngine.getAll('Exam');
        const zone = document.getElementById('studio-exams-list');
        if (zone) {
            while (zone.firstChild) zone.removeChild(zone.firstChild);
            if (exams.length === 0) {
                const empty = document.createElement('p');
                empty.style.color = "var(--text-sec)";
                empty.textContent = "Nessun esame memorizzato in IndexedDB.";
                zone.appendChild(empty);
            } else {
                exams.forEach(e => {
                    const card = document.createElement('div');
                    card.className = 'glass-card';

                    const name = document.createElement('div');
                    name.className = 'task-name';
                    name.textContent = e.name; // XSS safe

                    const desc = document.createElement('div');
                    desc.className = 'task-desc';
                    desc.textContent = `Data Esame: ${e.date || 'Non definita'}`;

                    card.appendChild(name);
                    card.appendChild(desc);
                    zone.appendChild(card);
                });
            }
        }
    },

    renderAllenamentoScreen: async function() {
        const workouts = await StorageEngine.getAll('Workout');
        const zone = document.getElementById('allenamento-list');
        if (zone) {
            while (zone.firstChild) zone.removeChild(zone.firstChild);
            if (workouts.length === 0) {
                const empty = document.createElement('p');
                empty.style.color = "var(--text-sec)";
                empty.textContent = "Nessun allenamento registrato in IndexedDB.";
                zone.appendChild(empty);
            } else {
                workouts.forEach(w => {
                    const card = document.createElement('div');
                    card.className = 'glass-card';

                    const name = document.createElement('div');
                    name.className = 'task-name';
                    name.textContent = `${(w.type || '').toUpperCase()} - ${w.date || ''}`;

                    const desc = document.createElement('div');
                    desc.className = 'task-desc';
                    desc.textContent = `Stato: ${w.status || 'svolto'} | Durata: ${w.actualDuration || 0} min | RPE: ${w.intensityRPE || 7}`;

                    card.appendChild(name);
                    card.appendChild(desc);
                    zone.appendChild(card);
                });
            }
        }
    },

    renderAlimentazioneScreen: async function() {
        const totals = await NutritionEngine.getDailyTotals(this.currentDate);
        const zone = document.getElementById('nutrition-meals-list');
        if (zone) {
            while (zone.firstChild) zone.removeChild(zone.firstChild);
            if (totals.meals.length === 0) {
                const empty = document.createElement('p');
                empty.style.color = "var(--text-sec)";
                empty.textContent = "Nessun pasto registrato oggi in IndexedDB.";
                zone.appendChild(empty);
            } else {
                totals.meals.forEach(m => {
                    const entry = document.createElement('div');
                    entry.className = 'meal-entry';
                    entry.style.cssText = "padding:12px 0; border-bottom:1px solid rgba(255,255,255,0.05);";

                    const header = document.createElement('div');
                    header.className = 'meal-header';

                    const typeSpan = document.createElement('span');
                    typeSpan.style.fontWeight = "700";
                    typeSpan.textContent = (m.type || '').toUpperCase();

                    const qualSpan = document.createElement('span');
                    qualSpan.style.cssText = "font-size:0.7rem; opacity:0.6; margin-left:6px;";
                    qualSpan.textContent = `[${m.dataQuality || 'manuale'}]`;

                    header.appendChild(typeSpan);
                    header.appendChild(qualSpan);

                    const desc = document.createElement('div');
                    desc.className = 'meal-desc';
                    desc.style.cssText = "font-size:0.85rem; color:var(--text-sec);";
                    desc.textContent = m.notes || 'Pasto inserito'; // XSS Safe

                    const macros = document.createElement('div');
                    macros.className = 'meal-macros';
                    macros.style.cssText = "font-family:'JetBrains Mono'; font-size:0.8rem; margin-top:4px;";
                    macros.textContent = `${m.totalKcal || 0} kcal | P:${m.totalPro || 0}g C:${m.totalCho || 0}g F:${m.totalFat || 0}g`;

                    entry.appendChild(header);
                    entry.appendChild(desc);
                    entry.appendChild(macros);
                    zone.appendChild(entry);
                });
            }
        }
    },

    renderStoricoScreen: async function() {
        const trends = await AnalyticsEngine.get30DayTrends();
        const ctx = document.getElementById('analyticsChart');
        if (ctx && window.Chart) {
            if (window.analyticsChartInst) window.analyticsChartInst.destroy();
            window.analyticsChartInst = new Chart(ctx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: trends.map(t => t.date.substr(5)),
                    datasets: [
                        { label: 'Studio (min)', data: trends.map(t => t.studyMins), backgroundColor: 'rgba(59, 130, 246, 0.6)' },
                        { label: 'Allenamento (min)', data: trends.map(t => t.workoutMins), backgroundColor: 'rgba(0, 245, 155, 0.6)' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    },

    addWater: async function(ml) {
        await StorageEngine.put('HydrationLog', {
            id: 'water_' + Date.now(),
            amountMl: ml,
            createdAt: Date.now()
        });
        UIEngine.showToast(`+${ml} ml Acqua Registrati! 💧`);
        UIEngine.playAudioFeedback('success');
        await this.renderOggiScreen();
    },

    exportBackup: async function() {
        const data = await StorageEngine.exportJSON();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', `omnibus_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        UIEngine.showToast("Backup JSON scaricato!");
    },

    importBackup: function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    const count = await StorageEngine.importJSON(parsed);
                    UIEngine.showToast(`Importati ${count} elementi!`);
                    location.reload();
                } catch(err) {
                    UIEngine.showToast("⚠️ File di backup non valido o corrotto.");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
});
