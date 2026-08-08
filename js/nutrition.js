/**
 * OMNIBUS PROTOCOL PRO - NUTRITION & HYDRATION PILLAR ENGINE (nutrition.js)
 * Features:
 * - Secure Meal AI Parser via Serverless Worker Proxy (/api/analyze-meal)
 * - NO GEMINI API KEY IN BROWSER / FRONTEND
 * - Frequent Meal Duplication & Data Quality Indicators
 */

const NutritionEngine = {
    targetProfiles: {
        workout: { name: "Giorno Allenamento (High Carb)", kcal: 2600, pro: 160, cho: 350, fat: 60, waterMl: 3000 },
        rest: { name: "Giorno Riposo (Mod Carb)", kcal: 2100, pro: 160, cho: 200, fat: 70, waterMl: 2500 },
        intense_study: { name: "Giorno Studio Intenso (Focus)", kcal: 2250, pro: 170, cho: 220, fat: 75, waterMl: 2800 }
    },

    duplicateYesterdayMeals: async function() {
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yestStr = yesterday.toISOString().split('T')[0];

        const allMeals = await StorageEngine.getAll('Meal');
        const yestMeals = allMeals.filter(m => m.date === yestStr);

        let copiedCount = 0;
        for (const m of yestMeals) {
            const newMeal = {
                ...m,
                id: 'meal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                date: todayStr,
                createdAt: Date.now(),
                dataQuality: m.dataQuality || 'manuale'
            };
            delete newMeal.updatedAt;
            await StorageEngine.put('Meal', newMeal);
            copiedCount++;
        }
        return copiedCount;
    },

    getDailyTotals: async function(dateStr) {
        const targetDate = dateStr || new Date().toISOString().split('T')[0];
        const meals = (await StorageEngine.getAll('Meal')).filter(m => {
            return m.date === targetDate || (m.createdAt && new Date(m.createdAt).toISOString().split('T')[0] === targetDate);
        });

        let totals = { kcal: 0, pro: 0, cho: 0, fat: 0, fiber: 0, waterMl: 0 };
        meals.forEach(m => {
            totals.kcal += (m.totalKcal || 0);
            totals.pro += (m.totalPro || 0);
            totals.cho += (m.totalCho || 0);
            totals.fat += (m.totalFat || 0);
            totals.fiber += (m.totalFiber || 0);
        });

        const hydrations = (await StorageEngine.getAll('HydrationLog')).filter(h => {
            return new Date(h.createdAt).toISOString().split('T')[0] === targetDate;
        });
        hydrations.forEach(h => { totals.waterMl += (h.amountMl || 0); });

        return { totals, meals, hydrations };
    },

    /**
     * Parse meal via Cloudflare Worker Proxy (/api/analyze-meal)
     * SECURE: NO API KEY EXPOSED TO FRONTEND/BROWSER.
     */
    analyzeMealWithAI: async function(mealDescription) {
        if (!SyncEngine.syncUrl) {
            throw new Error("Configura l'URL del Worker nelle Impostazioni per usare la funzionalità IA.");
        }

        const ts = Date.now().toString();
        const reqId = 'req_' + ts + '_' + Math.random().toString(36).substr(2, 4);
        const bodyStr = JSON.stringify({ mealDescription });

        const signature = await CryptoEngine.generateDeviceHMAC(
            SyncEngine.roomId + SyncEngine.deviceId + ts + reqId + bodyStr,
            SyncEngine.deviceSecret
        );

        const res = await fetch(SyncEngine.syncUrl + '/api/analyze-meal', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Omnibus-Device-Id': SyncEngine.deviceId,
                'X-Omnibus-Timestamp': ts,
                'X-Omnibus-Request-Id': reqId,
                'X-Omnibus-HMAC-Signature': signature
            },
            body: bodyStr
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || "Chiamata IA pasto fallita.");
        }

        const data = await res.json();
        data.dataQuality = 'stimato_gemini';
        return data; // Requires user confirmation/modification before saving!
    }
};

window.NutritionEngine = NutritionEngine;
