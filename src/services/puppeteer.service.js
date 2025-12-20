/**
 * Puppeteer 服务 - 用于处理被 Cloudflare 保护的页面
 */
const puppeteer = require('puppeteer-core');
const { rssCookieDb } = require('../db');

let browser = null;
const BROWSER_TIMEOUT = 30000; // 30秒超时
const PAGE_TIMEOUT = 30000;    // 页面加载超时

/**
 * 获取或创建浏览器实例
 */
async function getBrowser() {
    if (browser && browser.isConnected()) {
        return browser;
    }

    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    console.log(`🌐 启动 Puppeteer 浏览器 (${execPath})...`);

    try {
        browser = await puppeteer.launch({
            executablePath: execPath,
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-software-rasterizer',
                '--single-process',
                '--no-zygote',
                '--disable-extensions',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--metrics-recording-only',
                '--mute-audio',
                '--no-first-run',
            ],
            timeout: BROWSER_TIMEOUT,
        });

        console.log('✅ Puppeteer 浏览器启动成功');
        return browser;
    } catch (error) {
        console.error(`❌ Puppeteer 浏览器启动失败: ${error.message}`);
        browser = null;
        throw error;
    }
}

/**
 * 使用 Puppeteer 获取页面内容
 */
async function fetchWithPuppeteer(url) {
    let page = null;
    try {
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // 检查是否有保存的 Cookie
        const savedCookie = rssCookieDb.getByUrl(url);
        if (savedCookie) {
            console.log(`🍪 使用已保存的 Cookie: ${savedCookie.domain}`);

            // 解析并设置 Cookie
            const urlObj = new URL(url);
            const cookies = savedCookie.cookie_string.split(';').map(pair => {
                const [name, ...valueParts] = pair.trim().split('=');
                return {
                    name: name.trim(),
                    value: valueParts.join('=').trim(),
                    domain: urlObj.hostname,
                    path: '/',
                };
            }).filter(c => c.name && c.value);

            if (cookies.length > 0) {
                await page.setCookie(...cookies);
                console.log(`🍪 已设置 ${cookies.length} 个 Cookie`);
            }

            // 使用保存的 User-Agent
            if (savedCookie.user_agent) {
                await page.setUserAgent(savedCookie.user_agent);
            } else {
                await page.setUserAgent(
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                );
            }
        } else {
            // 设置默认用户代理
            await page.setUserAgent(
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
        }

        // 设置额外请求头
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
        });

        console.log(`🔄 Puppeteer 正在获取: ${url}`);

        // 导航到页面
        await page.goto(url, {
            waitUntil: 'networkidle0',
            timeout: PAGE_TIMEOUT,
        });

        // 等待 Cloudflare 挑战完成（最多等待 60 秒）
        let attempts = 0;
        const maxAttempts = 12;  // 12 次 x 5 秒 = 60 秒
        while (attempts < maxAttempts) {
            const content = await page.content();

            // 检查是否是 Cloudflare 挑战页面
            if (content.includes('Just a moment') ||
                content.includes('Checking your browser') ||
                content.includes('cf-browser-verification') ||
                content.includes('challenge-platform') ||
                content.includes('Verifying you are human')) {
                console.log(`⏳ 检测到 Cloudflare 挑战，等待中... (${attempts + 1}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                attempts++;
            } else {
                console.log('✅ Cloudflare 验证已完成');
                break;
            }
        }

        if (attempts >= maxAttempts) {
            console.log('⚠️ Cloudflare 验证超时，继续尝试解析内容');
        }

        // 额外等待确保页面加载完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 获取页面内容
        const content = await page.content();

        console.log(`✅ Puppeteer 成功获取页面内容 (${content.length} 字符)`);

        return { success: true, content };
    } catch (error) {
        console.error(`❌ Puppeteer 获取失败: ${error.message}`);
        return { success: false, error: error.message };
    } finally {
        if (page) {
            await page.close().catch(() => { });
        }
    }
}

/**
 * 关闭浏览器实例
 */
async function closeBrowser() {
    if (browser) {
        console.log('🌐 关闭 Puppeteer 浏览器...');
        await browser.close().catch(() => { });
        browser = null;
    }
}

// 进程退出时清理浏览器
process.on('SIGINT', closeBrowser);
process.on('SIGTERM', closeBrowser);

module.exports = {
    fetchWithPuppeteer,
    closeBrowser,
};
