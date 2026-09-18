/**
 * OMNIBUS PROTOCOL PRO - SEAMLESS SYNCHRONIZATION ENGINE (sync.js)
 * Modern 2026 Frictionless Cloud & Multi-Device Experience:
 * - 100% Offline-First by Default (Zero warnings or roadblocks if offline).
 * - Automatic background syncing when Cloudflare Worker URL is configured.
 * - Instant 1-Tap QR & Personal Code device pairing.
 * - No aggressive inactivity lockouts.
 */

const SyncEngine = {
    syncUrl: '',
    roomId: '',
    deviceId: '',
    deviceSecret: '',
    syncCode: '',
    lastSyncTs: 0,
    isOnline: navigator.onLine,
    syncInProgress: false,

    init: async function() {
        let profile = await StorageEngine.get('Profile', 'main_profile');
        if (!profile) {
            const randomCode = 'OMNI-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + Math.floor(1000 + Math.random() * 9000);
            profile = {
                id: 'main_profile',
                syncUrl: '',
                roomId: 'room_' + Array.from(window.crypto.getRandomValues(new Uint8Array(12)))
                    .map(b => b.toString(16).padStart(2, '0')).join(''),
                deviceId: 'dev_' + Array.from(window.crypto.getRandomValues(new Uint8Array(8)))
                    .map(b => b.toString(16).padStart(2, '0')).join(''),
                deviceSecret: Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
                    .map(b => b.toString(16).padStart(2, '0')).join(''),
                syncCode: randomCode,
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
        this.syncCode = profile.syncCode || 'OMNI-PERSONAL-2026';
        this.lastSyncTs = profile.lastSyncTs || 0;

        // Initialize CryptoEngine vault
        await CryptoEngine.init();

        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateStatusBadge();
            this.processSyncQueue();
            this.pullUpdates();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateStatusBadge();
        });

        this.updateStatusBadge();

        // If cloud sync configured, quietly pull updates on startup
        if (this.syncUrl && this.isOnline) {
            this.pullUpdates();
        }
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

        if (this.syncUrl) {
            this.processSyncQueue();
            this.pullUpdates();
        }
    },

    updateStatusBadge: function() {
        const sidebarBadge = document.getElementById('sidebar-sync-text');
        const topBadge = document.getElementById('top-sync-text');

        let text = '🟢 Protetto in Locale';
        let isConnected = true;

        if (!this.isOnline) {
            text = '⚪ Offline (Salvato in Locale)';
        } else if (this.syncInProgress) {
            text = '🔄 Sincronizzazione...';
        } else if (this.syncUrl) {
            text = '🟢 Sincronizzato con Cloudflare';
        } else {
            text = '🟢 Protetto in Locale (Offline-First)';
        }

        [sidebarBadge, topBadge].forEach(el => {
            if (el) {
                el.textContent = text;
                const parent = el.closest('.sync-badge-pill');
                if (parent) {
                    if (isConnected) parent.classList.add('connected');
                    else parent.classList.remove('connected');
                }
            }
        });
    },

    /**
     * Silent Background Sync Queue Processor
     */
    processSyncQueue: async function() {
        if (!this.isOnline || !this.syncUrl || this.syncInProgress) {
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
                    profile.lastSyncTs = Date.now();
                    await StorageEngine.put('Profile', profile);
                }
            }
        } catch(e) {
            console.warn("Background Sync Notice:", e.message);
        } finally {
            this.syncInProgress = false;
            this.updateStatusBadge();
        }
    },

    /**
     * Silent Background Update Puller
     */
    pullUpdates: async function() {
        if (!this.isOnline || !this.syncUrl) return;
        
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
                if (window.app && window.app.renderOggiScreen) {
                    window.app.renderOggiScreen();
                }
            }
        } catch(e) {
            console.warn("Pull updates notice:", e.message);
        }
    },

    /**
     * Generates a 1-Tap Quick Pairing Bundle (QR and String)
     */
    getPairingBundle: function() {
        return JSON.stringify({
            app: 'Omnibus',
            syncUrl: this.syncUrl,
            roomId: this.roomId,
            deviceSecret: this.deviceSecret,
            syncCode: this.syncCode,
            vaultKey: CryptoEngine.getPassphrase()
        });
    },

    /**
     * Applies a 1-Tap Quick Pairing Bundle on secondary device
     */
    applyPairingBundle: async function(bundleStr) {
        try {
            const bundle = JSON.parse(bundleStr);
            if (!bundle || bundle.app !== 'Omnibus') throw new Error("Codice non valido.");

            await this.saveSyncConfig(bundle.syncUrl, bundle.roomId, null, bundle.deviceSecret);
            if (bundle.vaultKey) {
                await CryptoEngine.setPassphrase(bundle.vaultKey);
            }
            return true;
        } catch(e) {
            throw new Error("Formato codice non valido.");
        }
    }
};

window.SyncEngine = SyncEngine;
