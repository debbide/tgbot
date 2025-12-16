const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

async function generateQRCode(content) {
    const tempPath = path.join(__dirname, '../../data', `qr_${Date.now()}.png`);

    try {
        await QRCode.toFile(tempPath, content, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff',
            },
        });
        return { success: true, path: tempPath };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function setupQRCodeCommand(bot) {
    bot.command('qr', async (ctx) => {
        const content = ctx.message.text.split(' ').slice(1).join(' ');

        if (!content) {
            return ctx.reply('❌ 用法: /qr <内容>\n例: /qr https://example.com\n例: /qr 你好世界');
        }

        const loading = await ctx.reply('🔄 正在生成二维码...');

        const result = await generateQRCode(content);

        if (result.success) {
            await ctx.replyWithPhoto(
                { source: result.path },
                { caption: `📱 二维码内容:\n${content.substring(0, 100)}${content.length > 100 ? '...' : ''}` }
            );
            await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id);

            // 清理临时文件
            fs.unlink(result.path, () => { });
        } else {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loading.message_id,
                null,
                `❌ 生成失败: ${result.error}`
            );
        }
    });
}

module.exports = { setupQRCodeCommand, generateQRCode };
