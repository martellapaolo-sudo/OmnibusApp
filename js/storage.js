/**
 * OMNIBUS PROTOCOL PRO - INDEXEDDB STORAGE ENGINE (storage.js)
 * Local-First & Offline-First Data Store with Schema Versioning and Migration Support.
 * NO DEVICE ID STORAGE IN LOCALSTORAGE. STORED EXCLUSIVELY IN INDEXEDDB (Profile Store).
 */

const DB_NAME = 'OmnibusDB';
const DB_VERSION = 1;

let dbInstance = null;

const StorageEngine = {
    init: function() {
        return new Promise((resolve, reject) => {
            if (dbInstance) return resolve(dbInstance);

            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                const stores = [
                    'Profile', 'Exam', 'StudyModule', 'Topic', 'StudySession', 'Review',
                    'TrainingPlan', 'WorkoutTemplate', 'Workout', 'ExerciseSet', 'RecoveryLog',
                    'Food', 'Recipe', 'Meal', 'HydrationLog', 'NutritionGoal', 'DailyPlan',
                    'Device', 'SyncQueue', 'ChangeLog'
                ];

                stores.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        const store = db.createObjectStore(storeName, { keyPath: 'id' });
                        store.createIndex('updatedAt', 'updatedAt', { unique: false });
                        if (storeName === 'DailyPlan' || storeName === 'RecoveryLog' || storeName === 'Meal') {
                            store.createIndex('date', 'date', { unique: false });
                        }
                    }
                });
            };

            request.onsuccess = (event) => {
                dbInstance = event.target.result;
                resolve(dbInstance);
            };

            request.onerror = (event) => {
                console.error("IndexedDB Open Error:", event.target.error);
                reject(event.target.error);
            };
        });
    },

    put: async function(storeName, item) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            if (!item.id) item.id = storeName.toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            item.updatedAt = item.updatedAt || Date.now();
            item.createdAt = item.createdAt || Date.now();
            item.schemaVersion = item.schemaVersion || 1;

            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(item);

            req.onsuccess = () => {
                StorageEngine.queueSync(storeName, item.id, 'PUT', item);
                resolve(item);
            };
            req.onerror = () => reject(req.error);
        });
    },

    get: async function(storeName, id) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(id);

            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    getAll: async function(storeName) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();

            req.onsuccess = () => {
                const results = (req.result || []).filter(item => !item.deletedAt);
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        });
    },

    delete: async function(storeName, id) {
        const item = await this.get(storeName, id);
        if (!item) return;
        item.deletedAt = Date.now();
        item.updatedAt = Date.now();
        
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(item);

            req.onsuccess = () => {
                StorageEngine.queueSync(storeName, id, 'DELETE', item);
                resolve(id);
            };
            req.onerror = () => reject(req.error);
        });
    },

    queueSync: async function(storeName, entityId, action, payload) {
        if (storeName === 'SyncQueue' || storeName === 'ChangeLog') return;
        const syncItem = {
            id: 'sync_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            storeName: storeName,
            entityId: entityId,
            action: action,
            payload: payload,
            timestamp: Date.now()
        };
        const db = await this.init();
        const tx = db.transaction('SyncQueue', 'readwrite');
        tx.objectStore('SyncQueue').put(syncItem);
    },

    /**
     * Retrieve unique device identifier EXCLUSIVELY from IndexedDB Profile Store
     */
    getDeviceId: async function() {
        const profile = await this.get('Profile', 'main_profile');
        if (profile && profile.deviceId) return profile.deviceId;
        
        const newDevId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
        const newProfile = profile || { id: 'main_profile', createdAt: Date.now() };
        newProfile.deviceId = newDevId;
        await this.put('Profile', newProfile);
        return newDevId;
    },

    exportJSON: async function() {
        const stores = [
            'Profile', 'Exam', 'StudyModule', 'Topic', 'StudySession', 'Review',
            'TrainingPlan', 'WorkoutTemplate', 'Workout', 'ExerciseSet', 'RecoveryLog',
            'Food', 'Recipe', 'Meal', 'HydrationLog', 'NutritionGoal', 'DailyPlan'
        ];
        const exportData = {
            appName: 'Omnibus Protocol Pro',
            version: DB_VERSION,
            exportedAt: new Date().toISOString(),
            deviceId: await this.getDeviceId(),
            data: {}
        };

        for (const s of stores) {
            exportData.data[s] = await this.getAll(s);
        }
        return exportData;
    },

    exportCSV: async function(pillar) {
        let data = [];
        let filename = `omnibus_${pillar}_export_${new Date().toISOString().split('T')[0]}.csv`;
        let csvContent = "";

        if (pillar === 'study') {
            data = await this.getAll('StudySession');
            csvContent = "ID,Timestamp,ArgomentoID,DurataPrevista,DurataEffettiva,Metodo,Concentrazione,Esito\n" +
                data.map(d => `"${d.id}","${d.createdAt}","${d.topicId || ''}",${d.plannedDuration || 0},${d.actualDuration || 0},"${d.method || ''}",${d.focusScore || 0},"${d.outcome || ''}"`).join("\n");
        } else if (pillar === 'training') {
            data = await this.getAll('Workout');
            csvContent = "ID,Data,Tipo,Durata,RPE,Stato,Note\n" +
                data.map(d => `"${d.id}","${d.date || ''}","${d.type || ''}",${d.actualDuration || 0},${d.intensityRPE || 0},"${d.status || ''}","${(d.notes || '').replace(/"/g, '""')}"`).join("\n");
        } else if (pillar === 'nutrition') {
            data = await this.getAll('Meal');
            csvContent = "ID,DataOra,Tipo,Kcal,Proteine,Carbo,Grassi,Contesto\n" +
                data.map(d => `"${d.id}","${d.createdAt}","${d.type || ''}",${d.totalKcal || 0},${d.totalPro || 0},${d.totalCho || 0},${d.totalFat || 0},"${d.context || ''}"`).join("\n");
        } else if (pillar === 'recovery') {
            data = await this.getAll('RecoveryLog');
            csvContent = "ID,Data,OreSonno,Qualita,Energia,Stres,Indolenzimento\n" +
                data.map(d => `"${d.id}","${d.date}","${d.sleepHours || 0}",${d.sleepQuality || 0},${d.energyLevel || 0},${d.stressLevel || 0},${d.soreness || 0}`).join("\n");
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    importJSON: async function(jsonObj) {
        if (!jsonObj || !jsonObj.data) throw new Error("Formato backup non valido.");
        const db = await this.init();
        let importedCount = 0;

        for (const storeName in jsonObj.data) {
            if (db.objectStoreNames.contains(storeName)) {
                const items = jsonObj.data[storeName];
                if (Array.isArray(items)) {
                    for (const item of items) {
                        await this.put(storeName, item);
                        importedCount++;
                    }
                }
            }
        }
        return importedCount;
    }
};

window.StorageEngine = StorageEngine;
