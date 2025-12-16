const { db } = require('./connection');

const settingsDb = {
    get: (key, defaultValue = null) => {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        return row ? row.value : defaultValue;
    },

    set: (key, value) => {
        return db.prepare(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
        ).run(key, String(value));
    },
};

module.exports = { settingsDb };
