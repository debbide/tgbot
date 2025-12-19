/**
 * 💬 聊天辅助命令
 * 使用 OpenAI 兼容 API 生成回复建议
 * 支持多轮对话上下文
 */

const { getSettings } = require('../settings');
const { chatHistoryDb, statsDb } = require('../db');

// 系统提示词 - 轻松幽默风格
const SYSTEM_PROMPT = `你是一个聊天回复助手，帮助用户想出合适的回复。

要求：
1. 风格轻松幽默，不要太正式
2. 回复要自然，像朋友间的对话
3. 可以适当使用emoji增加趣味性
4. 给出2-3个不同的回复建议，用数字标注
5. 每个建议简洁有力，不要太长
6. 如果对方的话有歧义，可以给出不同理解下的回复
7. 如果用户继续追问，参考之前的对话上下文`;

/**
 * 调用 OpenAI 兼容 API（带超时和重试）
 */
async function callOpenAI(messages, settings, retries = 2) {
    const { apiBase, apiKey, model } = settings.openai;
    const TIMEOUT = 30000; // 30 秒超时

    if (!apiKey) {
        throw new Error('请先配置 OpenAI API Key');
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // 创建 AbortController 用于超时控制
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

            const response = await fetch(`${apiBase}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    temperature: 0.8,
                    max_tokens: 500,
                }),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API 请求失败: ${response.status} - ${errorText.slice(0, 100)}`);
            }

            const data = await response.json();
            return data.choices[0]?.message?.content || '抱歉，没有生成回复';
        } catch (error) {
            lastError = error;
            if (error.name === 'AbortError') {
                console.warn(`⏱️ OpenAI 请求超时 (尝试 ${attempt + 1}/${retries + 1})`);
            } else {
                console.warn(`❌ OpenAI 请求失败 (尝试 ${attempt + 1}/${retries + 1}):`, error.message);
            }

            // 如果还有重试机会，等待后重试
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            }
        }
    }

    throw lastError;
}

/**
 * 设置聊天命令
 */
function setupChatCommand(bot) {
    const settings = getSettings();

    // 检查功能是否启用
    if (settings.features?.CHAT === false) {
        return;
    }

    // /chat 或 /c 命令
    const handler = async (ctx) => {
        const userId = String(ctx.from.id);
        const text = ctx.message.text;
        const match = text.match(/^\/c(?:hat)?\s+(.+)/s);

        if (!match) {
            return ctx.reply(
                '💬 *聊天助手*\n\n' +
                '用法:\n' +
                '`/chat <对方说的话>` - 获取回复建议\n' +
                '`/chat clear` - 清除对话历史\n\n' +
                '支持多轮对话，我会记住上下文~',
                { parse_mode: 'Markdown' }
            );
        }

        const userInput = match[1].trim();

        // 清除历史命令
        if (userInput.toLowerCase() === 'clear') {
            chatHistoryDb.clear(userId);
            return ctx.reply('🗑️ 对话历史已清除');
        }

        try {
            await ctx.sendChatAction('typing');

            // 记录使用统计
            statsDb.record(userId, 'chat');

            // 获取历史对话
            const history = chatHistoryDb.getRecent(userId, 6);

            // 构建消息列表
            const messages = [
                { role: 'system', content: SYSTEM_PROMPT },
                ...history,
                { role: 'user', content: `对方说：「${userInput}」\n\n请给我一些回复建议：` },
            ];

            // 调用 API
            const currentSettings = getSettings();
            const reply = await callOpenAI(messages, currentSettings);

            // 保存对话历史
            chatHistoryDb.add(userId, 'user', `对方说：「${userInput}」`);
            chatHistoryDb.add(userId, 'assistant', reply);

            await ctx.reply(`💬 *回复建议*\n\n${reply}`, {
                parse_mode: 'Markdown',
            });
        } catch (err) {
            console.error('Chat API error:', err.message);
            await ctx.reply(`❌ 生成失败: ${err.message}`);
        }
    };

    bot.command('chat', handler);
    bot.command('c', handler);
}

module.exports = { setupChatCommand };
