/**
 * 告警通知服务
 * Bot 异常时自动通知管理员
 */

let botInstance = null;
let adminId = null;
let lastAlertTime = 0;
const ALERT_COOLDOWN = 5 * 60 * 1000; // 5 分钟冷却

/**
 * 初始化告警服务
 */
function initAlert(bot, admin) {
    botInstance = bot;
    adminId = admin;

    // 全局未捕获异常
    process.on('uncaughtException', (err) => {
        console.error('❌ 未捕获异常:', err.message);
        sendAlert(`❌ 未捕获异常\n\n${err.message}\n\n${err.stack?.slice(0, 500)}`);
    });

    // 未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        console.error('❌ 未处理的 Promise 拒绝:', message);
        sendAlert(`⚠️ 未处理的 Promise 拒绝\n\n${message}`);
    });

    console.log('🔔 告警服务已启动');
}

/**
 * 发送告警消息给管理员
 */
async function sendAlert(message) {
    if (!botInstance || !adminId) {
        return;
    }

    // 冷却检查
    const now = Date.now();
    if (now - lastAlertTime < ALERT_COOLDOWN) {
        console.log('⏳ 告警冷却中，跳过发送');
        return;
    }
    lastAlertTime = now;

    try {
        await botInstance.telegram.sendMessage(
            adminId,
            `🚨 *Bot 告警*\n\n${message}\n\n_${new Date().toLocaleString('zh-CN')}_`,
            { parse_mode: 'Markdown' }
        );
    } catch (err) {
        console.error('发送告警失败:', err.message);
    }
}

/**
 * 手动发送告警
 */
function alert(message) {
    sendAlert(message);
}

module.exports = { initAlert, alert };
