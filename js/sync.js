/**
 * OMNIBUS PROTOCOL PRO - SYNCHRONIZATION & SECURITY ENGINE (sync.js)
 * Features:
 * - Credentials & Sync Metadata Stored EXCLUSIVELY in IndexedDB (Profile Store)
 * - Authenticated QR Pairing Token Initiation (/api/pair/init) with Device HMAC
 * - Toast Feedback (Zero Native Alerts)
 */

const SyncEngine = {
    syncUrl: '',
    roomId: '',
    deviceId: '',
    deviceSecret: '',
    lastSyncTs: 0,
    isOnline: navigator.onLine,
    syncInProgress: false,
    inactivityTimer: null,
    INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000,

    init: async function() {
        let profile = await StorageEngine.get('Profile', 'main_profile');
        if (!profile) {
            profile = {
                id: 'main_profile',
                syncUrl: '',
                roomId: 'room_' + Array.from(window.crypto.getRandomValues(new Uint8Array(16)))
                    .map(b => b.toString(16).padStart(2, '0')).join(''),
                deviceId: 'dev_' + Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
                    .map(b => b.toString(16).padStart(2, '0')).join(''),
                deviceSecret: Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
                    .map(b => b.toString(16).padStart(2, '0')).join(''),
                lastSyncTs: 0,
                lastSyncTimeStr: '',
                createdAt: Date.now()
            };
            await StorageEngine.put('Profile', profile);
        }

        this.syncUrl = profile.syncUrl || '';
        this.roomId = profile.roomId;
        this.deviceId = profile.deviceId;
        this.deviceSecret = profile.deviceSecret;
        this.lastSyncTs = profile.lastSyncTs || 0;

        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateStatusBadge();
            this.processSyncQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateStatusBadge();
        });

        this.resetInactivityTimer();
        this.setupInactivityListeners();
        this.updateStatusBadge();
    },

    saveSyncConfig: async function(url, room, devId, devSecret) {
        let profile = await StorageEngine.get('Profile', 'main_profile') || { id: 'main_profile' };
        profile.syncUrl = url || this.syncUrl;
        profile.roomId = room || this.roomId;
        profile.deviceId = devId || this.deviceId;
        profile.deviceSecret = devSecret || this.deviceSecret;
        profile.updatedAt = Date.now();

        await StorageEngine.put('Profile', profile);
        this.syncUrl = profile.syncUrl;
        this.roomId = profile.roomId;
        this.deviceId = profile.deviceId;
        this.deviceSecret = profile.deviceSecret;
        this.updateStatusBadge();
    },

    /**
     * Primary Device: Generate Single-Use 10-Min QR Pairing Token with Device HMAC Signature
     */
    generateQRPairingToken: async function() {
        if (!this.syncUrl) throw new Error("Configura prima l'URL del Worker nelle Impostazioni.");
        
        const ts = Date.now().toString();
        const reqId = 'req_' + ts + '_' + Math.random().toString(36).substr(2, 4);
        const bodyObj = { roomId: this.roomId, deviceId: this.deviceId };
        const bodyStr = JSON.stringify(bodyObj);

        const signature = await CryptoEngine.generateDeviceHMAC(
            this.roomId + this.deviceId + ts + reqId + bodyStr,
            this.deviceSecret
        );

        const res = await fetch(this.syncUrl + '/api/pair/init', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Omnibus-Device-Id': this.deviceId,
                'X-Omnibus-Timestamp': ts,
                'X-Omnibus-Request-Id': reqId,
                'X-Omnibus-HMAC-Signature': signature
            },
            body: bodyStr
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Generazione token di pairing fallita.");
        }
        return await res.json();
    },

    redeemQRPairingToken: async function(workerUrl, pairingToken, deviceName) {
        const res = await fetch(workerUrl + '/api/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: pairingToken, deviceName: deviceName || 'Nuovo Dispositivo' })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "Pairing fallito.");
        }

        const credentials = await res.json();
        await this.saveSyncConfig(workerUrl, credentials.roomId, credentials.deviceId, credentials.deviceSecret);
        return credentials;
    },

    setupInactivityListeners: function() {
        const events = ['mousemove', 'keydown', 'touchstart', 'click'];
        events.forEach(evt => {
            window.addEventListener(evt, () => this.resetInactivityTimer(), { passive: true });
        });
    },

    resetInactivityTimer: function() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        this.inactivityTimer = setTimeout(() => {
            this.lockApp();
        }, this.INACTIVITY_TIMEOUT_MS);
    },

    lockApp: function() {
        CryptoEngine.clearPassphrase();
        const overlay = document.getElementById('app-lock-overlay');
        if (overlay) overlay.classList.add('show');
        this.updateStatusBadge();
        if (window.UIEngine) UIEngine.showToast("🔒 Omnibus Bloccato per inattività.");
    },

    unlockApp: function(passphrase) {
        if (!passphrase || passphrase.length < 6) {
            if (window.UIEngine) UIEngine.showToast("⚠️ Inserisci una passphrase di almeno 6 caratteri.");
            return false;
        }
        CryptoEngine.setPassphrase(passphrase);
        const overlay = document.getElementById('app-lock-overlay');
        if (overlay) overlay.classList.remove('show');
        this.updateStatusBadge();
        this.processSyncQueue();
        if (window.UIEngine) UIEngine.showToast("🔓 Omnibus Sbloccato.");
        return true;
    },

    updateStatusBadge: function() {
        const badge = document.getElementById('sync-status-badge');
        const sidebarBadge = document.getElementById('sidebar-sync-text');
        const topBadge = document.getElementById('top-sync-text');

        let text = '⚪ Sync Off (Locale)';
        let color = 'var(--text-sec)';
        let isConn = false;

        if (!this.isOnline) {
            text = '🔴 Offline';
        } else if (!this.syncUrl) {
            text = '⚪ Solo Locale';
        } else if (!CryptoEngine.hasPassphrase()) {
            text = '⚠️ Inserisci Passphrase';
            color = 'var(--accent-warn)';
        } else if (this.syncInProgress) {
            text = '🟡 Sincronizzazione...';
            color = 'var(--accent-warn)';
        } else {
            text = '🟢 Sync Attivo';
            color = 'var(--pillar-training)';
            isConn = true;
        }

        [badge, sidebarBadge, topBadge].forEach(el => {
            if (el) {
                el.innerText = text;
                el.style.color = color;
                if (el.classList.contains('sync-badge-pill')) {
                    if (isConn) el.classList.add('connected');
                    else el.classList.remove('connected');
                }
            }
        });
    },

    processSyncQueue: async function() {
        if (!this.isOnline || !this.syncUrl || this.syncInProgress || !CryptoEngine.hasPassphrase()) {
            this.updateStatusBadge();
            return;
        }

        this.syncInProgress = true;
        this.updateStatusBadge();

        try {
            const pending = await StorageEngine.getAll('SyncQueue');
            if (pending.length === 0) {
                this.syncInProgress = false;
                this.updateStatusBadge();
                return;
            }

            const encryptedPayload = await CryptoEngine.encrypt(pending);
            const ts = Date.now().toString();
            const reqId = 'req_' + ts + '_' + Math.random().toString(36).substr(2, 4);

            const bodyObj = { roomId: this.roomId, payload: encryptedPayload };
            const bodyStr = JSON.stringify(bodyObj);

            const signature = await CryptoEngine.generateDeviceHMAC(
                this.roomId + this.deviceId + ts + reqId + bodyStr,
                this.deviceSecret
            );

            const res = await fetch(this.syncUrl + '/api/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Omnibus-Device-Id': this.deviceId,
                    'X-Omnibus-Timestamp': ts,
                    'X-Omnibus-Request-Id': reqId,
                    'X-Omnibus-HMAC-Signature': signature
                },
                body: bodyStr
            });

            if (res.ok) {
                const db = await StorageEngine.init();
                const tx = db.transaction('SyncQueue', 'readwrite');
                const store = tx.objectStore('SyncQueue');
                pending.forEach(item => store.delete(item.id));

                let profile = await StorageEngine.get('Profile', 'main_profile');
                if (profile) {
                    profile.lastSyncTimeStr = new Date().toLocaleTimeString('it-IT');
                    await StorageEngine.put('Profile', profile);
                }
            } else {
                const errData = await res.json();
                console.error("Worker Sync Push Refused:", errData);
            }
        } catch(e) {
            console.error("Sync Queue Push Error:", e);
        } finally {
            this.syncInProgress = false;
            this.updateStatusBadge();
        }
    },

    pullUpdates: async function() {
        if (!this.isOnline || !this.syncUrl || !CryptoEngine.hasPassphrase()) return;
        
        let profile = await StorageEngine.get('Profile', 'main_profile');
        const lastSyncTs = profile ? (profile.lastSyncTs || 0) : 0;
        const ts = Date.now().toString();
        const reqId = 'req_' + ts + '_' + Math.random().toString(36).substr(2, 4);

        try {
            const signature = await CryptoEngine.generateDeviceHMAC(
                this.roomId + this.deviceId + ts + reqId + '',
                this.deviceSecret
            );

            const res = await fetch(`${this.syncUrl}/api/sync?roomId=${encodeURIComponent(this.roomId)}&since=${lastSyncTs}`, {
                headers: {
                    'X-Omnibus-Device-Id': this.deviceId,
                    'X-Omnibus-Timestamp': ts,
                    'X-Omnibus-Request-Id': reqId,
                    'X-Omnibus-HMAC-Signature': signature
                }
            });
            if (!res.ok) return;

            const data = await res.json();
            if (data && data.results && Array.isArray(data.results)) {
                for (const row of data.results) {
                    if (row.encrypted_payload) {
                        const decryptedItems = await CryptoEngine.decrypt(row.encrypted_payload);
                        if (Array.isArray(decryptedItems)) {
                            for (const item of decryptedItems) {
                                const existing = await StorageEngine.get(item.storeName, item.id);
                                if (!existing || (item.updatedAt > existing.updatedAt)) {
                                    await StorageEngine.put(item.storeName, item);
                                }
                            }
                        }
                    }
                }
                
                if (profile) {
                    profile.lastSyncTs = Date.now();
                    await StorageEngine.put('Profile', profile);
                }
                if (window.refreshAllUI) window.refreshAllUI();
            }
        } catch(e) {
            console.error("Pull Updates Error:", e);
        }
    }
};

window.SyncEngine = SyncEngine;
