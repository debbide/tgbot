const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const dbPath = path.join(__dirname, '../data/database.db');

const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

function initDatabase() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      message TEXT NOT NULL,
      remind_at INTEGER NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      sent INTEGER DEFAULT 0
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS rss_feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      chat_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      last_item_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS mail_config (
      user_id TEXT PRIMARY KEY,
      host TEXT NOT NULL,
      port INTEGER DEFAULT 993,
      email TEXT NOT NULL,
      password TEXT NOT NULL,
      digest_time TEXT DEFAULT '08:00',
      enabled INTEGER DEFAULT 1
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

    db.exec(`
    CREATE TABLE IF NOT EXISTS rss_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'include'
    )
  `);

    // 聊天历史表
    db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    // 使用统计表
    db.exec(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      command TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

    // 群组配置表
    db.exec(`
    CREATE TABLE IF NOT EXISTS group_config (
      chat_id TEXT PRIMARY KEY,
      welcome_message TEXT,
      enabled INTEGER DEFAULT 1
    )
  `);

    // 关键词回复表
    db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      reply TEXT NOT NULL,
      is_regex INTEGER DEFAULT 0
    )
  `);

    // 创建索引
    db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_stats_command ON usage_stats(command)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_keywords_chat ON keywords(chat_id)`);
}

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

module.exports = {
    db,
    initDatabase,
    reminderDb,
    noteDb,
    rssDb,
    settingsDb,
    groupDb,
    chatHistoryDb,
    statsDb,
    keywordDb,
};

