/**
 * OMNIBUS PROTOCOL PRO - HISTORICAL ANALYTICS ENGINE (analytics.js)
 * Practical Multi-Pillar Statistics, Correlations, & Trend Visualization.
 */

const AnalyticsEngine = {
    /**
     * Compute multi-pillar trend correlations for a 30-day window
     */
    get30DayTrends: async function() {
        const studySessions = await StorageEngine.getAll('StudySession');
        const workouts = await StorageEngine.getAll('Workout');
        const recoveryLogs = await StorageEngine.getAll('RecoveryLog');
        const meals = await StorageEngine.getAll('Meal');

        const dateMap = {};
        for (let i = 29; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            dateMap[dateStr] = { date: dateStr, studyMins: 0, workoutMins: 0, sleepHours: 0, kcal: 0, energy: 0 };
        }

        studySessions.forEach(s => {
            const dateStr = new Date(s.createdAt).toISOString().split('T')[0];
            if (dateMap[dateStr]) dateMap[dateStr].studyMins += (s.actualDuration || 0);
        });

        workouts.forEach(w => {
            if (w.status === 'svolto' && dateMap[w.date]) {
                dateMap[w.date].workoutMins += (w.actualDuration || 0);
            }
        });

        recoveryLogs.forEach(r => {
            if (dateMap[r.date]) {
                dateMap[r.date].sleepHours = r.sleepHours || 0;
                dateMap[r.date].energy = r.energyLevel || 0;
            }
        });

        meals.forEach(m => {
            const dateStr = m.date || new Date(m.createdAt).toISOString().split('T')[0];
            if (dateMap[dateStr]) {
                dateMap[dateStr].kcal += (m.totalKcal || 0);
            }
        });

        return Object.values(dateMap);
    }
};

window.AnalyticsEngine = AnalyticsEngine;
