/**
 * OMNIBUS PROTOCOL PRO - INTEGRATED DAILY PLANNER ENGINE (planner.js)
 * Unified DailyPlan Engine Combining Study, Workouts, Meals, Hydration, Recovery, & Exam Countdowns.
 */

const PlannerEngine = {
    /**
     * Get or initialize today's DailyPlan
     */
    getDailyPlan: async function(dateStr) {
        const targetDate = dateStr || new Date().toISOString().split('T')[0];
        let plan = await StorageEngine.get('DailyPlan', 'plan_' + targetDate);

        if (!plan) {
            plan = {
                id: 'plan_' + targetDate,
                date: targetDate,
                items: [],
                notes: '',
                createdAt: Date.now()
            };
            await StorageEngine.put('DailyPlan', plan);
        }
        return plan;
    },

    /**
     * Add scheduled item to DailyPlan
     */
    addItem: async function(dateStr, itemData) {
        const plan = await this.getDailyPlan(dateStr);
        const newItem = {
            id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            title: itemData.title,
            pillar: itemData.pillar || 'study', // study, training, nutrition, recovery
            timeSlot: itemData.timeSlot || 'mattino', // mattino, pomeriggio, sera
            completed: false,
            refId: itemData.refId || null,
            createdAt: Date.now()
        };

        plan.items.push(newItem);
        await StorageEngine.put('DailyPlan', plan);
        return newItem;
    },

    /**
     * Toggle item completion
     */
    toggleItem: async function(dateStr, itemId) {
        const plan = await this.getDailyPlan(dateStr);
        const item = plan.items.find(i => i.id === itemId);
        if (item) {
            item.completed = !item.completed;
            await StorageEngine.put('DailyPlan', plan);
        }
        return plan;
    }
};

window.PlannerEngine = PlannerEngine;
