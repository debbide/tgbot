const { db } = require('./connection');

// 聊天历史数据库
const chatHistoryDb = {
    add: (userId, role, content) => {
        return db.prepare(
            'INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)'
        ).run(userId, role, content);
    },

    getRecent: (userId, limit = 10) => {
        return db.prepare(
            'SELECT role, content FROM chat_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        ).all(userId, limit).reverse();
    },

    clear: (userId) => {
        return db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(userId);
    },

    // 清理超过1小时的历史
    cleanup: () => {
        const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
        return db.prepare('DELETE FROM chat_history WHERE created_at < ?').run(oneHourAgo);
    },
};

module.exports = { chatHistoryDb };
