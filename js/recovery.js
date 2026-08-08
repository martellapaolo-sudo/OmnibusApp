/**
 * OMNIBUS PROTOCOL PRO - RECOVERY & WELLNESS PILLAR ENGINE (recovery.js)
 * Sleep Tracking, Perceived Energy, Stress, Soreness, & Non-Prescriptive Daily Contextual Prompts.
 * STRICT NEUTRALITY: Never diagnostic or clinical. Formulates "Valuta se adattare la sessione".
 */

const RecoveryEngine = {
    logRecovery: async function(data) {
        const recoveryLog = {
            id: 'recovery_' + (data.date || new Date().toISOString().split('T')[0]),
            date: data.date || new Date().toISOString().split('T')[0],
            sleepHours: parseFloat(data.sleepHours) || 7.5,
            sleepQuality: parseInt(data.sleepQuality) || 4,
            energyLevel: parseInt(data.energyLevel) || 4,
            stressLevel: parseInt(data.stressLevel) || 2,
            soreness: parseInt(data.soreness) || 1,
            notes: data.notes || '',
            createdAt: Date.now()
        };

        await StorageEngine.put('RecoveryLog', recoveryLog);
        return recoveryLog;
    },

    /**
     * Generate neutral, non-prescriptive daily contextual suggestions for DailyPlan
     */
    generateSuggestions: async function(dateStr) {
        const targetDate = dateStr || new Date().toISOString().split('T')[0];
        const log = await StorageEngine.get('RecoveryLog', 'recovery_' + targetDate);
        const suggestions = [];

        if (log) {
            if (log.sleepHours < 6) {
                suggestions.push("💡 Hai annotato meno di 6 ore di sonno: valuta se adattare il piano di studi ed iniziare dai ripassi più leggeri.");
            }
            if (log.energyLevel <= 2) {
                suggestions.push("🔋 Energia percepita bassa: valuta se strutturare lo studio in intervalli brevi ed inserire una pausa di mobilità.");
            }
            if (log.stressLevel >= 4) {
                suggestions.push("🧘‍♂️ Livello di stress annotato alto: valuta se inserire una camminata rigenerante durante la giornata.");
            }
        }
        return suggestions;
    }
};

window.RecoveryEngine = RecoveryEngine;
