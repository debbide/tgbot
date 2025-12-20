/**
 * Puppeteer 服务 - 用于处理被 Cloudflare 保护的页面
 */
const puppeteer = require('puppeteer-core');

let browser = null;
const BROWSER_TIMEOUT = 30000; // 30秒超时
const PAGE_TIMEOUT = 20000;    // 页面加载超时

/**
 * 获取或创建浏览器实例
 */
async function getBrowser() {
    if (browser && browser.isConnected()) {
        return browser;
    }

    console.log('🌐 启动 Puppeteer 浏览器...');
    browser = await puppeteer.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer',
            '--single-process',
            '--no-zygote',
        ],
        timeout: BROWSER_TIMEOUT,
    });

    return browser;
}

/**
 * 使用 Puppeteer 获取页面内容
 * @param {string} url - 要获取的 URL
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function fetchWithPuppeteer(url) {
    let page = null;
    try {
        const browserInstance = await getBrowser();
        page = await browserInstance.newPage();

        // 设置用户代理
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // 设置额外请求头
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        });

        console.log(`🔄 Puppeteer 正在获取: ${url}`);

        // 导航到页面
        await page.goto(url, {
            waitUntil: 'networkidle2',
            timeout: PAGE_TIMEOUT,
        });

        // 等待一小段时间确保 Cloudflare 验证完成
        await new Promise(resolve => setTimeout(resolve, 2000));

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
