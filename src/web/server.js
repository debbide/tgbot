/**
 * Web 配置面板服务器
 */

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getSettings, saveSettings, getSafeSettings } = require('../settings');
const { statsDb, chatHistoryDb, rssDb } = require('../db');
const { getLogs, addLogListener, clearLogs } = require('../logger');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 简单的 session 存储
const sessions = new Map();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 分钟

// 请求速率限制
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 分钟
const RATE_LIMIT_MAX = 30; // 每分钟最多 30 次请求

/**
 * 速率限制中间件
 */
function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }

    const record = rateLimitMap.get(ip);
    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + RATE_LIMIT_WINDOW;
        return next();
    }

    record.count++;
    if (record.count > RATE_LIMIT_MAX) {
        return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
    }
    next();
}

// 对登录相关接口启用速率限制
app.use('/api/login', rateLimitMiddleware);
app.use('/api/register', rateLimitMiddleware);

// Bot 实例和状态
let botInstance = null;
let botStatus = { running: false, startTime: null };
let restartCallback = null;
let getBotInstance = null; // 获取 Bot 实例的回调

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
    // 支持 Header 或 Query 参数传递 token (SSE 需要用 Query)
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;

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
 * 健康检查端点 (无需认证)
 */
app.get('/health', (req, res) => {
    const isRunning = getBotInstance ? !!getBotInstance() : false;

    // 尝试获取 RSS 订阅数量
    let rssCount = 0;
    try {
        const feeds = rssDb.getAll();
        rssCount = feeds ? feeds.length : 0;
    } catch (e) {
        // 数据库可能未初始化
    }

    res.json({
        status: 'ok',
        version: require('../../package.json').version || '1.0.0',
        botRunning: isRunning,
        uptime: process.uptime(),
        memory: {
            heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        rssFeeds: rssCount,
        timestamp: Date.now()
    });
});

/**
 * 检查初始化状态
 */
app.get('/api/check-init', (req, res) => {
    const settings = getSettings();
    res.json({ initialized: !!settings.panelPassword });
});

/**
 * 注册（首次设置密码）
 */
app.post('/api/register', (req, res) => {
    const { password } = req.body;
    const settings = getSettings();

    if (settings.panelPassword) {
        return res.status(403).json({ error: '系统已初始化，禁止重复注册' });
    }

    if (!password || password.length < 6) {
        return res.status(400).json({ error: '密码长度至少需 6 位' });
    }

    // 使用 bcrypt 哈希密码
    const hashedPassword = bcrypt.hashSync(password, 10);
    saveSettings({ panelPassword: hashedPassword });
    console.log('🔐 面板密码已设置 (bcrypt)');
    res.json({ success: true });
});

/**
 * 登录
 */
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    const settings = getSettings();

    if (!settings.panelPassword) {
        return res.status(400).json({ error: '系统未初始化，请先注册' });
    }

    // 支持 bcrypt 哈希和明文密码兼容 (迁移期)
    const isValid = settings.panelPassword.startsWith('$2')
        ? bcrypt.compareSync(password, settings.panelPassword)
        : password === settings.panelPassword;

    if (!isValid) {
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
 * 重置密码
 */
app.post('/api/reset-password', authMiddleware, (req, res) => {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: '密码长度至少 6 位' });
    }

    // 使用 bcrypt 哈希密码
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    saveSettings({ panelPassword: hashedPassword });

    res.json({ success: true, message: '密码已重置' });
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

const os = require('os');

/**
 * Bot 状态
 */
app.get('/api/status', authMiddleware, (req, res) => {
    // 如果有获取 Bot 实例的回调，使用它来检查真实状态
    const isRunning = getBotInstance ? !!getBotInstance() : botStatus.running;

    // 如果 Bot 运行但没有记录启动时间，现在记录
    if (isRunning && !botStatus.startTime) {
        botStatus.startTime = Date.now();
    }

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = Math.round((usedMem / totalMem) * 100);

    const cpus = os.cpus();
    // 简单的 CPU 负载估算 (基于 loadavg，Windows 上可能不准确，改用 cpus 计算)
    // 这里为了简单，只返回 loadavg (Linux/macOS) 或 0 (Windows)
    // 更准确的 CPU 使用率需要采样，这里暂用 loadavg[0]
    const load = os.loadavg();

    res.json({
        running: isRunning,
        startTime: isRunning ? botStatus.startTime : null,
        uptime: isRunning && botStatus.startTime ? Math.floor((Date.now() - botStatus.startTime) / 1000) : 0,
        system: {
            memory: {
                total: totalMem,
                used: usedMem,
                usage: memUsage
            },
            load: load,
            platform: os.platform()
        }
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

/**
 * 获取日志
 */
app.get('/api/logs', authMiddleware, (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    res.json(getLogs(limit));
});

/**
 * 日志实时推送 (SSE)
 */
app.get('/api/logs/stream', authMiddleware, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // 发送心跳
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);

    // 订阅新日志
    const unsubscribe = addLogListener((log) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    });

    // 客户端断开连接
    req.on('close', () => {
        clearInterval(heartbeat);
        unsubscribe();
    });
});

/**
 * 清空日志
 */
app.post('/api/logs/clear', authMiddleware, (req, res) => {
    clearLogs();
    res.json({ success: true });
});

function setBotStatus(running) {
    botStatus.running = running;
    if (running) {
        botStatus.startTime = Date.now();
    }
    console.log(`📊 Bot 状态更新: ${running ? '运行中' : '已停止'}`);
}

function setRestartCallback(callback) {
    restartCallback = callback;
}

function setGetBotInstance(getter) {
    getBotInstance = getter;
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

module.exports = { startWebServer, setBotStatus, setRestartCallback, setGetBotInstance };

