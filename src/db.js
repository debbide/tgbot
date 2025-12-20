const { db } = require('./db/connection');
const { reminderDb } = require('./db/reminder.dao');
const { noteDb } = require('./db/note.dao');
const { rssDb, keywordDb, rssCookieDb } = require('./db/rss.dao');
const { settingsDb } = require('./db/settings.dao');
const { groupDb } = require('./db/group.dao');
const { chatHistoryDb } = require('./db/chat.dao');
const { statsDb } = require('./db/stats.dao');

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
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_sent ON reminders(sent)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_stats_command ON usage_stats(command)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_usage_stats_created ON usage_stats(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_keywords_chat ON keywords(chat_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rss_feeds_user ON rss_feeds(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id)`);

  // RSS Cookie 表（用于绕过 Cloudflare）
  db.exec(`
    CREATE TABLE IF NOT EXISTS rss_cookies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL UNIQUE,
      cookie_string TEXT NOT NULL,
      user_agent TEXT DEFAULT '',
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rss_cookies_domain ON rss_cookies(domain)`);
}

module.exports = {
  db,
  initDatabase,
  reminderDb,
  noteDb,
  rssDb,
  rssCookieDb,
  settingsDb,
  groupDb,
  chatHistoryDb,
  statsDb,
  keywordDb,
};

