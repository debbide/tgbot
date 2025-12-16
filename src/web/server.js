/**
 * Web 配置面板服务器
 */

const express = require('express');
const path = require('path');
const { getSettings, saveSettings, getSafeSettings } = require('../settings');
const { statsDb, chatHistoryDb } = require('../db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 简单的 session 存储
const sessions = new Map();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 分钟

// Bot 实例和状态
let botInstance = null;
let botStatus = { running: false, startTime: null };
let restartCallback = null;

/**
 * 生成随机 token
 */
function generateToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * 验证中间件
 */
function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');

    if (!token || !sessions.has(token)) {
        return res.status(401).json({ error: '未登录或会话已过期' });
    }

    const session = sessions.get(token);
    if (Date.now() > session.expires) {
        sessions.delete(token);
        return res.status(401).json({ error: '会话已过期，请重新登录' });
    }

    // 刷新会话
    session.expires = Date.now() + SESSION_TIMEOUT;
    next();
}

/**
 * 登录
 */
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const settings = getSettings();

    if (!settings.panelPassword) {
        return res.status(500).json({ error: '面板密码未配置，请设置 PANEL_PASSWORD 环境变量' });
    }

    if (password !== settings.panelPassword) {
        console.log('🔒 登录失败：密码错误');
        return res.status(401).json({ error: '密码错误' });
    }

    const token = generateToken();
    sessions.set(token, {
        expires: Date.now() + SESSION_TIMEOUT,
    });

    console.log('🔓 登录成功');
    res.json({ token });
});

/**
 * 登出
 */
app.post('/api/logout', (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
        sessions.delete(token);
    }
    res.json({ success: true });
});

/**
 * 获取配置（脱敏）
 */
app.get('/api/settings', authMiddleware, (req, res) => {
    res.json(getSafeSettings());
});

/**
 * 获取完整配置（用于编辑）
 */
app.get('/api/settings/full', authMiddleware, (req, res) => {
    res.json(getSettings());
});

/**
 * 保存配置
 */
app.post('/api/settings', authMiddleware, (req, res) => {
    try {
        const newSettings = req.body;
        saveSettings(newSettings);
        console.log('⚙️ 配置已更新');
        res.json({ success: true, settings: getSafeSettings() });
    } catch (err) {
        console.error('保存配置失败:', err.message);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Bot 状态
 */
app.get('/api/status', authMiddleware, (req, res) => {
    res.json({
        ...botStatus,
        uptime: botStatus.startTime ? Math.floor((Date.now() - botStatus.startTime) / 1000) : 0,
    });
});

/**
 * 使用统计
 */
app.get('/api/stats', authMiddleware, (req, res) => {
    try {
        const commandStats = statsDb.getCommandStats();
        const todayStats = statsDb.getTodayStats();
        const userCount = statsDb.getUserCount();
        const totalCount = statsDb.getTotalCount();

        res.json({
            total: totalCount,
            users: userCount,
            today: todayStats,
            commands: commandStats,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * 重启 Bot
 */
app.post('/api/restart', authMiddleware, async (req, res) => {
    if (!restartCallback) {
        return res.status(500).json({ error: '重启功能未配置' });
    }

    try {
        console.log('🔄 正在重启 Bot...');
        await restartCallback();
        res.json({ success: true, message: 'Bot 已重启' });
    } catch (err) {
        console.error('重启失败:', err.message);
        res.status(500).json({ error: err.message });
    }
});

function setBotStatus(running) {
    botStatus.running = running;
    if (running) {
        botStatus.startTime = Date.now();
    }
}

function setRestartCallback(callback) {
    restartCallback = callback;
}

/**
 * 启动 Web 服务器
 */
function startWebServer(port = 3000) {
    return new Promise((resolve) => {
        app.listen(port, () => {
            console.log(`🌐 配置面板已启动: http://localhost:${port}`);
            resolve();
        });
    });
}

module.exports = { startWebServer, setBotStatus, setRestartCallback };

