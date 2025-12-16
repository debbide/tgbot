const { db } = require('./connection');

const reminderDb = {
    add: (userId, chatId, message, remindAt) => {
        const stmt = db.prepare(
            'INSERT INTO reminders (user_id, chat_id, message, remind_at) VALUES (?, ?, ?, ?)'
        );
        return stmt.run(userId, chatId, message, remindAt);
    },

    getPending: () => {
        const now = Math.floor(Date.now() / 1000);
        return db.prepare(
            'SELECT * FROM reminders WHERE remind_at <= ? AND sent = 0'
        ).all(now);
    },

    markSent: (id) => {
        return db.prepare('UPDATE reminders SET sent = 1 WHERE id = ?').run(id);
    },

    listByUser: (userId) => {
        return db.prepare(
            'SELECT * FROM reminders WHERE user_id = ? AND sent = 0 ORDER BY remind_at'
        ).all(userId);
    },

    delete: (id, userId) => {
        return db.prepare(
            'DELETE FROM reminders WHERE id = ? AND user_id = ?'
        ).run(id, userId);
    },
};

module.exports = { reminderDb };
