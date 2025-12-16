const { db } = require('./connection');

// 群组配置数据库
const groupDb = {
    getConfig: (chatId) => {
        return db.prepare('SELECT * FROM group_config WHERE chat_id = ?').get(String(chatId));
    },

    setWelcome: (chatId, message) => {
        return db.prepare(`
            INSERT INTO group_config (chat_id, welcome_message) VALUES (?, ?)
            ON CONFLICT(chat_id) DO UPDATE SET welcome_message = ?
        `).run(String(chatId), message, message);
    },

    deleteWelcome: (chatId) => {
        return db.prepare('UPDATE group_config SET welcome_message = NULL WHERE chat_id = ?').run(String(chatId));
    },

    addKeyword: (chatId, keyword, reply, isRegex = false) => {
        return db.prepare(
            'INSERT INTO keywords (chat_id, keyword, reply, is_regex) VALUES (?, ?, ?, ?)'
        ).run(String(chatId), keyword, reply, isRegex ? 1 : 0);
    },

    getKeywords: (chatId) => {
        return db.prepare('SELECT * FROM keywords WHERE chat_id = ?').all(String(chatId));
    },

    deleteKeyword: (chatId, id) => {
        return db.prepare('DELETE FROM keywords WHERE chat_id = ? AND id = ?').run(String(chatId), id);
    },

    getAllKeywords: () => {
        return db.prepare('SELECT * FROM keywords').all();
    }
};

module.exports = { groupDb };
