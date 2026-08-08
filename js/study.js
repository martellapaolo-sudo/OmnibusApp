/**
 * OMNIBUS PROTOCOL PRO - STUDY & EXAMS PILLAR ENGINE (study.js)
 * Hierarchical Architecture: Exam -> Module -> Topic -> StudySessions & Spaced Repetition Reviews.
 * Features: Configurable Backlog Throttling Badge, Initial Reading ("non_valutato"), Postpone 1-day.
 */

const StudyEngine = {
    postponeReviewByOneDay: async function(topicId) {
        const topic = await StorageEngine.get('Topic', topicId);
        if (!topic) return;

        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + 1);
        topic.nextReviewDate = nextDate.toISOString().split('T')[0];
        topic.updatedAt = Date.now();

        await StorageEngine.put('Topic', topic);
        return topic;
    },

    calcNextReview: function(currentInterval, outcome) {
        if (outcome === 'non_valutato') {
            const nextDate = new Date();
            nextDate.setDate(nextDate.getDate() + 1);
            return { nextDate: nextDate.toISOString().split('T')[0], intervalDays: 1 };
        }

        let nextDays = 1;
        if (outcome === 'weak') {
            nextDays = 1;
        } else if (outcome === 'medium') {
            nextDays = Math.max(3, Math.round((currentInterval || 1) * 1.8));
        } else if (outcome === 'solid') {
            nextDays = Math.max(7, Math.round((currentInterval || 1) * 2.5));
        }
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + nextDays);
        return {
            nextDate: nextDate.toISOString().split('T')[0],
            intervalDays: nextDays
        };
    },

    /**
     * Backlog Throttling with Metrics: Limit to max 5 overdue reviews per day,
     * smooth-scheduling remaining overdue topics across future days.
     */
    throttleBacklogReviews: async function() {
        const todayStr = new Date().toISOString().split('T')[0];
        const allTopics = await StorageEngine.getAll('Topic');
        
        const overdueTopics = allTopics.filter(t => t.nextReviewDate && t.nextReviewDate < todayStr).sort((a,b) => (a.mastery || 1) - (b.mastery || 1));
        const totalOverdueCount = overdueTopics.length;

        if (totalOverdueCount <= 5) {
            return { todayReviewsCount: totalOverdueCount, rescheduledCount: 0 };
        }

        let rescheduledCount = 0;
        for (let i = 5; i < overdueTopics.length; i++) {
            const extraDays = Math.floor(i / 5);
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + extraDays);
            
            const topic = overdueTopics[i];
            topic.nextReviewDate = targetDate.toISOString().split('T')[0];
            topic.updatedAt = Date.now();
            await StorageEngine.put('Topic', topic);
            rescheduledCount++;
        }

        return { todayReviewsCount: 5, rescheduledCount: rescheduledCount };
    },

    getExamDashboardMetrics: async function(examId) {
        const exam = await StorageEngine.get('Exam', examId);
        if (!exam) return null;

        const modules = (await StorageEngine.getAll('StudyModule')).filter(m => m.examId === examId);
        const moduleIds = modules.map(m => m.id);
        const allTopics = (await StorageEngine.getAll('Topic')).filter(t => moduleIds.includes(t.moduleId));

        const totalTopics = allTopics.length;
        const masteredTopics = allTopics.filter(t => (t.mastery || 1) >= 4);
        const fragileTopics = allTopics.filter(t => (t.mastery || 1) <= 2);
        
        const todayStr = new Date().toISOString().split('T')[0];
        const urgentReviews = allTopics.filter(t => t.nextReviewDate && t.nextReviewDate <= todayStr);

        const coveragePercent = totalTopics === 0 ? 0 : Math.round((masteredTopics.length / totalTopics) * 100);
        const estRemainingHours = allTopics.filter(t => (t.mastery || 1) < 4).reduce((acc, t) => acc + (t.estimatedHours || 2), 0);
        const daysRemaining = exam.date ? Math.ceil((new Date(exam.date) - new Date()) / (1000 * 60 * 60 * 24)) : null;

        return {
            examName: exam.name,
            examDate: exam.date,
            daysRemaining,
            totalTopics,
            coveragePercent,
            fragileCount: fragileTopics.length,
            urgentReviewCount: urgentReviews.length,
            estRemainingHours,
            fragileTopics,
            urgentReviews
        };
    },

    recordSession: async function(sessionData) {
        const session = {
            id: 'session_' + Date.now(),
            topicId: sessionData.topicId,
            plannedDuration: sessionData.plannedDuration || 25,
            actualDuration: sessionData.actualDuration || 25,
            method: sessionData.method || 'lettura',
            focusScore: sessionData.focusScore || 4,
            outcome: sessionData.outcome || 'solid',
            notes: sessionData.notes || '',
            createdAt: Date.now()
        };

        await StorageEngine.put('StudySession', session);

        if (sessionData.topicId) {
            const topic = await StorageEngine.get('Topic', sessionData.topicId);
            if (topic) {
                const reviewCalc = this.calcNextReview(topic.lastInterval || 1, sessionData.outcome);
                topic.lastReviewDate = new Date().toISOString().split('T')[0];
                topic.nextReviewDate = reviewCalc.nextDate;
                topic.lastInterval = reviewCalc.intervalDays;
                topic.reviewCount = (topic.reviewCount || 0) + 1;
                
                if (sessionData.outcome === 'solid') topic.mastery = Math.min(5, (topic.mastery || 1) + 1);
                else if (sessionData.outcome === 'weak') topic.mastery = Math.max(1, (topic.mastery || 1) - 1);

                await StorageEngine.put('Topic', topic);
            }
        }
        return session;
    }
};

window.StudyEngine = StudyEngine;
