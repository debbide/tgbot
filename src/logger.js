/**
 * 日志管理器
 * 拦截 console 输出并保存到内存缓冲区
 */

const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const MAX_LOGS = 200;
const logs = [];
const listeners = new Set();

// 初始化 Winston
const transport = new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, '../logs/application-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
});

const fileLogger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        transport
    ]
});

// 日志级别
const LEVELS = {
    log: 'info',
    info: 'info',
    warn: 'warn',
    error: 'error',
    debug: 'debug'
};

// 保存原始 console 方法
const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console)
};

/**
 * 添加日志条目
 */
function addLog(level, args) {
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    const entry = {
        id: Date.now() + Math.random().toString(36).slice(2, 8),
        timestamp: new Date().toISOString(),
        level,
        message
    };

    logs.push(entry);

    // 保持最大条数
    while (logs.length > MAX_LOGS) {
        logs.shift();
    }

    // 写入文件日志
    try {
        fileLogger.log({
            level: level === 'log' ? 'info' : level,
            message: message
        });
    } catch (e) {
        originalConsole.error('Winston logging failed:', e);
    }

    // 通知 SSE 监听器
    listeners.forEach(listener => {
        try {
            listener(entry);
        } catch (e) {
            // 忽略错误
        }
    });
}

/**
 * 重写 console 方法
 */
function setupLogger() {
    ['log', 'info', 'warn', 'error', 'debug'].forEach(method => {
        console[method] = (...args) => {
            // 调用原始方法
            originalConsole[method](...args);
            // 记录日志
            addLog(LEVELS[method], args);
        };
    });
}

/**
 * 获取所有日志
 */
function getLogs(limit = 100) {
    return logs.slice(-limit);
}

/**
 * 添加 SSE 监听器
 */
function addLogListener(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

/**
 * 清空日志
 */
function clearLogs() {
    logs.length = 0;
}

module.exports = {
    setupLogger,
    getLogs,
    addLogListener,
    clearLogs,
    originalConsole
};
