async function shortenUrl(url) {
    try {
        // 使用 CleanURI 免费短链服务
        const response = await fetch('https://cleanuri.com/api/v1/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `url=${encodeURIComponent(url)}`,
        });

        const data = await response.json();

        if (data.result_url) {
            return { success: true, shortUrl: data.result_url };
        } else {
            return { success: false, error: data.error || '未知错误' };
        }
    } catch (error) {
        console.error('短链生成错误:', error.message);
        return { success: false, error: error.message };
    }
}

function setupShortenCommand(bot) {
    bot.command('short', async (ctx) => {
        const url = ctx.message.text.split(' ')[1];

        if (!url) {
            return ctx.reply('❌ 用法: /short <URL>\n例: /short https://example.com/very/long/url');
        }

        // 简单 URL 验证
        if (!url.match(/^https?:\/\/.+/)) {
            return ctx.reply('❌ 请输入有效的 URL (以 http:// 或 https:// 开头)');
        }

        const loading = await ctx.reply('🔄 正在生成短链...');

        const result = await shortenUrl(url);

        if (result.success) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loading.message_id,
                null,
                `🔗 *短链接生成成功*\n\n` +
                `📎 原链接:\n${url}\n\n` +
                `✅ 短链接:\n${result.shortUrl}`,
                { parse_mode: 'Markdown', disable_web_page_preview: true }
            );
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

module.exports = { setupShortenCommand, shortenUrl };
