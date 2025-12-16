// 使用 wttr.in 免费天气 API (无需 Key)
async function getWeather(city) {
    try {
        const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=zh`;
        const response = await fetch(url);

        if (!response.ok) {
            return { success: false, error: '城市未找到' };
        }

        const data = await response.json();
        const current = data.current_condition[0];
        const location = data.nearest_area[0];

        return {
            success: true,
            city: location.areaName[0].value,
            country: location.country[0].value,
            temp: current.temp_C,
            feelsLike: current.FeelsLikeC,
            humidity: current.humidity,
            weather: current.lang_zh?.[0]?.value || current.weatherDesc[0].value,
            wind: current.windspeedKmph,
            windDir: current.winddir16Point,
        };
    } catch (error) {
        console.error('天气查询错误:', error.message);
        return { success: false, error: error.message };
    }
}

function setupWeatherCommand(bot) {
    bot.command('weather', async (ctx) => {
        const city = ctx.message.text.split(' ').slice(1).join(' ');

        if (!city) {
            return ctx.reply('❌ 用法: /weather <城市>\n例: /weather 北京\n例: /weather Tokyo');
        }

        const loading = await ctx.reply('🔄 正在查询天气...');

        const result = await getWeather(city);

        if (result.success) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                loading.message_id,
                null,
                `🌤️ *${result.city}, ${result.country}*\n\n` +
                `☁️ 天气: ${result.weather}\n` +
                `🌡️ 温度: ${result.temp}°C (体感 ${result.feelsLike}°C)\n` +
                `💧 湿度: ${result.humidity}%\n` +
                `💨 风速: ${result.wind} km/h ${result.windDir}`,
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

module.exports = { setupWeatherCommand, getWeather };
