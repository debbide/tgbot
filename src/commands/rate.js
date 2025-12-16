// 使用免费汇率 API
async function getExchangeRate(from, to, amount) {
    try {
        const url = `https://api.exchangerate.host/convert?from=${from}&to=${to}&amount=${amount}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.success === false) {
            // 备用 API
            const backupUrl = `https://open.er-api.com/v6/latest/${from}`;
            const backupRes = await fetch(backupUrl);
            const backupData = await backupRes.json();

            if (backupData.rates && backupData.rates[to]) {
                const rate = backupData.rates[to];
                return {
                    success: true,
                    from,
                    to,
                    amount,
                    result: (amount * rate).toFixed(2),
                    rate: rate.toFixed(4),
                };
            }
            return { success: false, error: '不支持的货币' };
        }

        return {
            success: true,
            from,
            to,
            amount,
            result: data.result?.toFixed(2) || (amount * data.info?.rate).toFixed(2),
            rate: data.info?.rate?.toFixed(4) || 'N/A',
        };
    } catch (error) {
        console.error('汇率查询错误:', error.message);
        return { success: false, error: error.message };
    }
}

function setupRateCommand(bot) {
    bot.command('rate', async (ctx) => {
        const args = ctx.message.text.split(' ').slice(1);

        if (args.length < 2) {
            return ctx.reply(
                '❌ 用法: /rate <源货币> <目标货币> [金额]\n\n' +
                '例: /rate USD CNY 100\n' +
                '例: /rate EUR JPY\n\n' +
                '常用货币代码: USD, EUR, CNY, JPY, GBP, HKD'
            );
        }

        const from = args[0].toUpperCase();
        const to = args[1].toUpperCase();
        const amount = parseFloat(args[2]) || 1;

        const loading = await ctx.reply('🔄 正在查询汇率...');

        const result = await getExchangeRate(from, to, amount);

        if (result.success) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loading.message_id,
                null,
                `💰 *汇率换算*\n\n` +
                `📤 ${result.amount} ${result.from}\n` +
                `📥 ${result.result} ${result.to}\n\n` +
                `📊 汇率: 1 ${result.from} = ${result.rate} ${result.to}`,
                { parse_mode: 'Markdown' }
            );
        } else {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loading.message_id,
                null,
                `❌ 查询失败: ${result.error}`
            );
        }
    });
}

module.exports = { setupRateCommand, getExchangeRate };
