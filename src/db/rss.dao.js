const { db } = require('./connection');

const rssDb = {
    add: (userId, chatId, url, title) => {
        const stmt = db.prepare(
            'INSERT INTO rss_feeds (user_id, chat_id, url, title) VALUES (?, ?, ?, ?)'
        );
        return stmt.run(userId, chatId, url, title);
    },

    list: (userId) => {
        return db.prepare(
            'SELECT * FROM rss_feeds WHERE user_id = ?'
        ).all(userId);
    },

    getAll: () => {
        return db.prepare('SELECT * FROM rss_feeds').all();
    },

    updateLastItem: (id, lastItemId) => {
        return db.prepare(
            'UPDATE rss_feeds SET last_item_id = ? WHERE id = ?'
        ).run(lastItemId, id);
    },

    delete: (id, userId) => {
        return db.prepare(
            'DELETE FROM rss_feeds WHERE id = ? AND user_id = ?'
        ).run(id, userId);
    },
};

const keywordDb = {
    add: (keyword, type = 'include') => {
        const existing = db.prepare(
            'SELECT id FROM rss_keywords WHERE keyword = ? AND type = ?'
        ).get(keyword, type);
        if (existing) return { changes: 0 };
        return db.prepare(
            'INSERT INTO rss_keywords (keyword, type) VALUES (?, ?)'
        ).run(keyword, type);
    },

    list: (type) => {
        if (type) {
            return db.prepare('SELECT * FROM rss_keywords WHERE type = ?').all(type);
        }
        return db.prepare('SELECT * FROM rss_keywords').all();
    },

    delete: (keyword, type) => {
        return db.prepare(
            'DELETE FROM rss_keywords WHERE keyword = ? AND type = ?'
        ).run(keyword, type);
    },

    getKeywords: () => {
        return db.prepare("SELECT keyword FROM rss_keywords WHERE type = 'include'").all().map(r => r.keyword);
    },

    getExcludes: () => {
        return db.prepare("SELECT keyword FROM rss_keywords WHERE type = 'exclude'").all().map(r => r.keyword);
    },
};

module.exports = { rssDb, keywordDb };
