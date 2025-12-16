/**
 * 📝 智能摘要命令
 * 提取网页内容或长文本，使用 AI 生成摘要
 */

const { getSettings } = require('../settings');
const cheerio = require('cheerio');

// 系统提示词
const SYSTEM_PROMPT = `你是一个专业的阅读助手。请阅读用户提供的内容（文本或网页正文），并生成一份简明的摘要。

要求：
1. 提取核心观点和重要事实
2. 保持客观中立
3. 篇幅控制在 100-200 字之间
4. 使用列表或分段使结构清晰
5. 如果是新闻，请包含时间、地点、人物、事件
6. 如果是技术文章，请总结核心技术点和解决的问题`;

/**
 * 调用 OpenAI 生成摘要
 */
async function generateSummary(content, settings) {
    const { apiBase, apiKey, model } = settings.openai;

    if (!apiKey) {
        throw new Error('请先配置 OpenAI API Key');
    }

    const response = await fetch(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: `请总结以下内容：\n\n${content}` },
            ],
            temperature: 0.5,
            max_tokens: 500,
        }),
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '抱歉，无法生成摘要';
}

/**
 * 提取网页正文
 */
async function fetchUrlContent(url) {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
    });

    if (!response.ok) {
        throw new Error(`无法访问链接: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 移除干扰元素
    $('script, style, nav, footer, iframe, .ads, .comment, .sidebar').remove();

    // 尝试提取正文
    // 优先查找常见的文章容器
    const selectors = ['article', 'main', '.content', '.post-content', '#content', '.article-body'];
    let content = '';

    for (const selector of selectors) {
        const element = $(selector);
        if (element.length > 0) {
            content = element.text();
            break;
        }
    }

    // 如果没找到特定容器，就提取 body 文本
    if (!content) {
        content = $('body').text();
    }

    // 清理空白字符
    return content.replace(/\s+/g, ' ').trim().substring(0, 8000); // 限制长度避免 token 溢出
}

/**
 * 设置摘要命令
 */
function setupSummaryCommand(bot) {
    const settings = getSettings();

    // 检查功能是否启用
    if (settings.features?.SUMMARY === false) {
        return;
    }

    // /sum 命令
    bot.command('sum', async (ctx) => {
        const text = ctx.message.text;
        const match = text.match(/^\/sum(?:\s+(.+))?/s);

        // 获取目标内容：
        // 1. 命令后的参数
        // 2. 回复的消息内容
        let targetContent = match ? match[1] : null;

        if (!targetContent && ctx.message.reply_to_message) {
            const reply = ctx.message.reply_to_message;
            targetContent = reply.text || reply.caption;
        }

        if (!targetContent) {
            return ctx.reply(
                '📝 *智能摘要*\n\n' +
                '用法:\n' +
                '1. 发送 `/sum <链接>` 总结网页\n' +
                '2. 发送 `/sum <文本>` 总结长文\n' +
                '3. 回复一条消息并发送 `/sum`',
                { parse_mode: 'Markdown' }
            );
        }

        targetContent = targetContent.trim();

        try {
            await ctx.sendChatAction('typing');
            const currentSettings = getSettings();

            // 检查是否是 URL
            const urlMatch = targetContent.match(/https?:\/\/[^\s]+/);
            let contentToSummarize = targetContent;

            if (urlMatch) {
                await ctx.reply('🔍 正在抓取网页内容...', { reply_to_message_id: ctx.message.message_id });
                contentToSummarize = await fetchUrlContent(urlMatch[0]);
            }

            if (contentToSummarize.length < 50) {
                return ctx.reply('⚠️ 内容太短，无需摘要。');
            }

            await ctx.sendChatAction('typing');
            const summary = await generateSummary(contentToSummarize, currentSettings);

            await ctx.reply(`📝 *摘要生成*\n\n${summary}`, {
                parse_mode: 'Markdown',
                reply_to_message_id: ctx.message.message_id,
            });

        } catch (err) {
            console.error('Summary error:', err);
            await ctx.reply(`❌ 摘要失败: ${err.message}`);
        }
    });
}

module.exports = { setupSummaryCommand };
