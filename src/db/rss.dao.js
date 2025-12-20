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

/**
 * RSS Cookie 管理（用于绕过 Cloudflare）
 */
const rssCookieDb = {
    /**
     * 添加或更新域名 Cookie
     */
    set: (domain, cookieString, userAgent = '') => {
        // 先检查是否存在
        const existing = db.prepare('SELECT id FROM rss_cookies WHERE domain = ?').get(domain);
        if (existing) {
            return db.prepare(
                'UPDATE rss_cookies SET cookie_string = ?, user_agent = ?, updated_at = ? WHERE domain = ?'
            ).run(cookieString, userAgent, Date.now(), domain);
        }
        return db.prepare(
            'INSERT INTO rss_cookies (domain, cookie_string, user_agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(domain, cookieString, userAgent, Date.now(), Date.now());
    },

    /**
     * 获取域名 Cookie
     */
    get: (domain) => {
        return db.prepare('SELECT * FROM rss_cookies WHERE domain = ?').get(domain);
    },

    /**
     * 根据 URL 获取 Cookie（自动提取域名）
     */
    getByUrl: (url) => {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;

            // 先尝试精确匹配
            let cookie = db.prepare('SELECT * FROM rss_cookies WHERE domain = ?').get(domain);
            if (cookie) return cookie;

            // 尝试匹配主域名（去掉 www.）
            const mainDomain = domain.replace(/^www\./, '');
            cookie = db.prepare('SELECT * FROM rss_cookies WHERE domain = ?').get(mainDomain);
            if (cookie) return cookie;

            // 尝试模糊匹配（*.domain.com）
            const parts = mainDomain.split('.');
            if (parts.length >= 2) {
                const rootDomain = parts.slice(-2).join('.');
                cookie = db.prepare('SELECT * FROM rss_cookies WHERE domain LIKE ?').get(`%${rootDomain}`);
            }

            return cookie || null;
        } catch (e) {
            return null;
        }
    },

    /**
     * 获取所有 Cookie 配置
     */
    list: () => {
        return db.prepare('SELECT * FROM rss_cookies ORDER BY updated_at DESC').all();
    },

    /**
     * 删除域名 Cookie
     */
    delete: (domain) => {
        return db.prepare('DELETE FROM rss_cookies WHERE domain = ?').run(domain);
    },

    /**
     * 删除指定 ID 的 Cookie
     */
    deleteById: (id) => {
        return db.prepare('DELETE FROM rss_cookies WHERE id = ?').run(id);
    },
};

module.exports = { rssDb, keywordDb, rssCookieDb };
