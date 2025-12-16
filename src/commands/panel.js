/**
 * 面板管理命令
 * 通过 Telegram 重置 Web 面板密码
 */

const crypto = require('crypto');
const { saveSettings, getSettings } = require('../settings');

function setupPanelCommand(bot, isAdmin) {
    // 重置面板密码
    bot.command('resetpanel', async (ctx) => {
        if (!isAdmin(ctx)) {
            return ctx.reply('⛔ 仅管理员可使用此命令');
        }

        const args = ctx.message.text.split(' ').slice(1);
        const newPassword = args.join(' ').trim();

        if (!newPassword || newPassword.length < 6) {
            return ctx.reply(
                '📋 *重置面板密码*\n\n' +
                '用法: `/resetpanel <新密码>`\n' +
                '密码长度至少 6 位',
                { parse_mode: 'Markdown' }
            );
        }

        try {
            // 生成密码哈希
            const hash = crypto.createHash('sha256').update(newPassword).digest('hex');

            const settings = getSettings();
            settings.panelPassword = hash;
            saveSettings(settings);

            await ctx.reply(
                '✅ *面板密码已重置*\n\n' +
                '新密码已生效，请使用新密码登录 Web 面板。',
                { parse_mode: 'Markdown' }
            );
        } catch (err) {
            console.error('重置密码失败:', err);
            await ctx.reply('❌ 重置失败: ' + err.message);
        }
    });
}

module.exports = { setupPanelCommand };
