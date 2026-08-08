/**
 * OMNIBUS PROTOCOL PRO - TRAINING & MOVEMENT PILLAR ENGINE (training.js)
 * Progressive Workout Templates, Progressive Overload Rules, Explicit Status Tracking,
 * & Quick Active Recovery / Mobility Logs.
 */

const TrainingEngine = {
    /**
     * Create or update a Workout Template with Progressive Overload Rules
     */
    saveTemplate: async function(templateData) {
        const template = {
            id: templateData.id || 'template_' + Date.now(),
            name: templateData.name,
            type: templateData.type || 'forza', // forza, corsa, cardio, mobilita, recupero_attivo, custom
            targetReps: templateData.targetReps || 8,
            targetWeight: templateData.targetWeight || 50,
            incrementRuleKg: templateData.incrementRuleKg || 2.5, // e.g. +2.5kg when all sets hit target reps
            estimatedDurationMins: templateData.estimatedDurationMins || 45,
            notes: templateData.notes || '',
            createdAt: Date.now()
        };

        await StorageEngine.put('WorkoutTemplate', template);
        return template;
    },

    /**
     * Quick Log for Active Recovery, Walking, & Mobility (1-tap)
     */
    quickLogActiveRecovery: async function(type, durationMins, notes) {
        const workout = {
            id: 'recovery_wkt_' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            type: type || 'recupero_attivo', // mobilita, camminata, recupero_attivo
            plannedDuration: durationMins || 20,
            actualDuration: durationMins || 20,
            intensityRPE: 3,
            status: 'svolto',
            notes: notes || 'Sessione di recupero attivo registrata',
            createdAt: Date.now()
        };

        await StorageEngine.put('Workout', workout);
        return workout;
    },

    /**
     * Log or Update Workout with Explicit Status Tracking
     */
    logWorkout: async function(workoutData) {
        const workout = {
            id: workoutData.id || 'workout_' + Date.now(),
            templateId: workoutData.templateId || null,
            date: workoutData.date || new Date().toISOString().split('T')[0],
            type: workoutData.type || 'forza',
            plannedDuration: workoutData.plannedDuration || 60,
            actualDuration: workoutData.actualDuration || 60,
            intensityRPE: workoutData.intensityRPE || 7,
            status: workoutData.status || 'svolto', // pianificato, svolto, saltato, spostato
            notes: workoutData.notes || '',
            createdAt: Date.now()
        };

        await StorageEngine.put('Workout', workout);

        if (Array.isArray(workoutData.sets)) {
            for (const setItem of workoutData.sets) {
                const exerciseSet = {
                    id: 'set_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                    workoutId: workout.id,
                    exercise: setItem.exercise,
                    setNum: setItem.setNum || 1,
                    reps: setItem.reps || 0,
                    weight: setItem.weight || 0,
                    unit: setItem.unit || 'kg',
                    durationDistance: setItem.durationDistance || '',
                    rpe: setItem.rpe || 7,
                    notes: setItem.notes || ''
                };
                await StorageEngine.put('ExerciseSet', exerciseSet);
            }
        }
        return workout;
    },

    /**
     * Compute weekly training volume & session load
     */
    computeWeeklyStats: async function() {
        const now = new Date();
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)));
        startOfWeek.setHours(0, 0, 0, 0);

        const workouts = await StorageEngine.getAll('Workout');
        const weekWorkouts = workouts.filter(w => new Date(w.date) >= startOfWeek && w.status === 'svolto');

        let totalDuration = 0;
        let totalVolumeKg = 0;
        
        const sets = await StorageEngine.getAll('ExerciseSet');
        const weekWorkoutIds = weekWorkouts.map(w => w.id);
        const weekSets = sets.filter(s => weekWorkoutIds.includes(s.workoutId));

        weekWorkouts.forEach(w => { totalDuration += (w.actualDuration || 0); });
        weekSets.forEach(s => { totalVolumeKg += ((s.reps || 0) * (s.weight || 0)); });

        return {
            completedSessions: weekWorkouts.length,
            totalDurationMins: totalDuration,
            totalVolumeKg: totalVolumeKg,
            setsCount: weekSets.length
        };
    }
};

window.TrainingEngine = TrainingEngine;
