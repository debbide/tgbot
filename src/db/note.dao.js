const { db } = require('./connection');

const noteDb = {
    add: (userId, content) => {
        const stmt = db.prepare(
            'INSERT INTO notes (user_id, content) VALUES (?, ?)'
        );
        return stmt.run(userId, content);
    },

    list: (userId, limit = 10) => {
        return db.prepare(
            'SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        ).all(userId, limit);
    },

    delete: (id, userId) => {
        return db.prepare(
            'DELETE FROM notes WHERE id = ? AND user_id = ?'
        ).run(id, userId);
    },

    clear: (userId) => {
        return db.prepare('DELETE FROM notes WHERE user_id = ?').run(userId);
    },
};

module.exports = { noteDb };
