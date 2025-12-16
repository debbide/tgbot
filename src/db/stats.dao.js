const { db } = require('./connection');

// 使用统计数据库
const statsDb = {
    record: (userId, command) => {
        return db.prepare(
            'INSERT INTO usage_stats (user_id, command) VALUES (?, ?)'
        ).run(userId, command);
    },

    getCommandStats: () => {
        return db.prepare(`
            SELECT command, COUNT(*) as count 
            FROM usage_stats 
            GROUP BY command 
            ORDER BY count DESC
        `).all();
    },

    getTodayStats: () => {
        const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
        return db.prepare(`
            SELECT command, COUNT(*) as count 
            FROM usage_stats 
            WHERE created_at >= ?
            GROUP BY command 
            ORDER BY count DESC
        `).all(todayStart);
    },

    getUserCount: () => {
        return db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM usage_stats').get()?.count || 0;
    },

    getTotalCount: () => {
        return db.prepare('SELECT COUNT(*) as count FROM usage_stats').get()?.count || 0;
    },
};

module.exports = { statsDb };
