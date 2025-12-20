/**
 * 配置面板前端逻辑
 */

const API_BASE = '';
let token = localStorage.getItem('token');
let statsChart = null;

// DOM 元素
const loginPage = document.getElementById('login-page');
const registerPage = document.getElementById('register-page');
const mainPage = document.getElementById('main-page');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const registerForm = document.getElementById('register-form');
const registerError = document.getElementById('register-error');
const settingsForm = document.getElementById('settings-form');
const statusBadge = document.getElementById('status-badge');
const saveStatus = document.getElementById('save-status');
const restartBtn = document.getElementById('restart-btn');
const themeBtn = document.getElementById('theme-btn');
const statTotal = document.getElementById('stat-total');
const statUsers = document.getElementById('stat-users');
const statToday = document.getElementById('stat-today');
const logoutBtn = document.getElementById('logout-btn');
const logsBtn = document.getElementById('logs-btn');
const logsModal = document.getElementById('logs-modal');
const logsContainer = document.getElementById('logs-container');
const logsClear = document.getElementById('logs-clear');
const logsClose = document.getElementById('logs-close');
const resetPwdBtn = document.getElementById('reset-pwd-btn');
let logsEventSource = null;

/**
 * 主题切换
 */
function initTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    if (statsChart) updateChartTheme();
}

function updateThemeIcon(theme) {
    if (themeBtn) {
        themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
}

initTheme();

/**
 * API 请求封装
 */
async function api(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        logout();
        throw new Error('会话已过期');
    }

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || '请求失败');
    }

    return data;
}

/**
 * 登录
 */
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.textContent = '';

    const password = document.getElementById('password').value;

    try {
        const data = await api('/api/login', {
            method: 'POST',
            body: JSON.stringify({ password }),
        });

        token = data.token;
        localStorage.setItem('token', token);
        showMainPage();
    } catch (err) {
        loginError.textContent = err.message;
    }
});

/**
 * 注册
 */
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        registerError.textContent = '';

        const password = document.getElementById('reg-password').value;
        const confirm = document.getElementById('reg-password-confirm').value;

        if (password !== confirm) {
            registerError.textContent = '两次输入的密码不一致';
            return;
        }

        try {
            await api('/api/register', {
                method: 'POST',
                body: JSON.stringify({ password }),
            });

            alert('✅ 初始化成功，请登录');
            showLoginPage();
        } catch (err) {
            registerError.textContent = err.message;
        }
    });
}

/**
 * 登出
 */
if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}

function logout() {
    token = null;
    localStorage.removeItem('token');
    showLoginPage();
}

/**
 * 重启 Bot
 */
if (restartBtn) {
    restartBtn.addEventListener('click', async () => {
        if (!confirm('确定要重启 Bot 吗？')) {
            return;
        }

        restartBtn.disabled = true;
        restartBtn.textContent = '重启中...';
        statusBadge.textContent = '🔄 重启中...';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            try {
                await fetch(`${API_BASE}/api/restart`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
            } catch (e) {
                clearTimeout(timeoutId);
            }

            await sleep(2000);

            let success = false;
            for (let i = 0; i < 10; i++) {
                try {
                    const status = await api('/api/status');
                    if (status.running) {
                        success = true;
                        break;
                    }
                } catch (e) { }
                await sleep(1000);
            }

            if (success) {
                statusBadge.textContent = '✅ 已重启';
                statusBadge.classList.add('online');
                loadStatus();
                loadStats();
            } else {
                statusBadge.textContent = '⚠️ 状态未知';
            }
        } catch (err) {
            statusBadge.textContent = '❌ 重启失败';
        } finally {
            restartBtn.disabled = false;
            restartBtn.textContent = '🔄 重启';
        }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 页面切换
 */
function showLoginPage() {
    loginPage.classList.remove('hidden');
    if (registerPage) registerPage.classList.add('hidden');
    mainPage.classList.add('hidden');
}

function showRegisterPage() {
    loginPage.classList.add('hidden');
    if (registerPage) registerPage.classList.remove('hidden');
    mainPage.classList.add('hidden');
}

function showMainPage() {
    loginPage.classList.add('hidden');
    if (registerPage) registerPage.classList.add('hidden');
    mainPage.classList.remove('hidden');
    loadSettings();
    loadStatus();
    loadStats();
}

/**
 * 加载配置
 */
async function loadSettings() {
    try {
        const settings = await api('/api/settings/full');
        populateForm(settings);
    } catch (err) {
        console.error('加载配置失败:', err);
    }
}

/**
 * 填充表单
 */
function populateForm(settings, prefix = '') {
    for (const [key, value] of Object.entries(settings)) {
        const name = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            populateForm(value, name);
        } else {
            const input = settingsForm.querySelector(`[name="${name}"]`);
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = Boolean(value);
                } else if (Array.isArray(value)) {
                    input.value = value.join(', ');
                } else {
                    input.value = value || '';
                }
            }
        }
    }
}

/**
 * 收集表单数据
 */
function collectFormData() {
    const data = {};
    const formData = new FormData(settingsForm);

    settingsForm.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        setNestedValue(data, checkbox.name, checkbox.checked);
    });

    for (const [name, value] of formData.entries()) {
        const input = settingsForm.querySelector(`[name="${name}"]`);
        if (input.type === 'checkbox') continue;

        let finalValue = value;

        if (input.type === 'number') {
            finalValue = parseInt(value, 10) || 0;
        } else if (name.includes('keywords') || name.includes('exclude')) {
            finalValue = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
        }

        setNestedValue(data, name, finalValue);
    }

    return data;
}

function setNestedValue(obj, path, value) {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
            current[keys[i]] = {};
        }
        current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
}

/**
 * 保存配置
 */
if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveStatus.textContent = '保存中...';
        saveStatus.style.color = 'var(--text-muted)';

        try {
            const data = collectFormData();
            await api('/api/settings', {
                method: 'POST',
                body: JSON.stringify(data),
            });

            saveStatus.textContent = '✅ 已保存';
            saveStatus.style.color = 'var(--success)';

            setTimeout(() => {
                saveStatus.textContent = '';
            }, 3000);
        } catch (err) {
            saveStatus.textContent = '❌ ' + err.message;
            saveStatus.style.color = 'var(--error)';
        }
    });
}

/**
 * 加载状态
 */
async function loadStatus() {
    try {
        const status = await api('/api/status');
        if (status.running) {
            const uptime = formatUptime(status.uptime);
            statusBadge.textContent = `✅ 运行中 (${uptime})`;
            statusBadge.classList.add('online');
        } else {
            statusBadge.textContent = '⏸️ 未运行';
            statusBadge.classList.remove('online');
        }

        // 更新系统状态
        if (status.system) {
            const ramEl = document.getElementById('stat-ram');
            if (ramEl) {
                ramEl.textContent = `${status.system.memory.usage}%`;
                // 根据负载变色
                if (status.system.memory.usage > 80) {
                    ramEl.style.color = 'var(--error)';
                } else {
                    ramEl.style.color = '';
                }
            }
        }
    } catch (err) {
        statusBadge.textContent = '❓ 未知';
    }
}

/**
 * 加载统计
 */
async function loadStats() {
    try {
        const stats = await api('/api/stats');
        statTotal.textContent = stats.total;
        statUsers.textContent = stats.users;
        statToday.textContent = stats.today.reduce((acc, curr) => acc + curr.count, 0);

        // 渲染图表
        renderChart(stats.commands.slice(0, 8));
    } catch (err) {
        console.error('加载统计失败:', err);
    }
}

/**
 * 渲染统计图表
 */
function renderChart(commands) {
    const ctx = document.getElementById('stats-chart');
    if (!ctx) return;

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#888' : '#666';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

    if (statsChart) {
        statsChart.destroy();
    }

    statsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: commands.map(c => '/' + c.command),
            datasets: [{
                label: '调用次数',
                data: commands.map(c => c.count),
                backgroundColor: 'rgba(0, 136, 204, 0.6)',
                borderColor: 'rgba(0, 136, 204, 1)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: { color: textColor, font: { size: 10 } },
                    grid: { display: false }
                },
                y: {
                    ticks: { color: textColor, font: { size: 10 } },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

function updateChartTheme() {
    if (statsChart) {
        loadStats();
    }
}

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

/**
 * 密码显示切换
 */
document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
        const input = btn.previousElementSibling;
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
    });
});

/**
 * 初始化检查
 */
async function checkInit() {
    try {
        const res = await fetch(`${API_BASE}/api/check-init`);
        const data = await res.json();
        return data.initialized;
    } catch (err) {
        console.error('检查初始化状态失败:', err);
        return true;
    }
}

/**
 * 启动逻辑
 */
(async () => {
    if (token) {
        showMainPage();
    } else {
        const initialized = await checkInit();
        if (initialized) {
            showLoginPage();
        } else {
            showRegisterPage();
        }
    }

    setInterval(() => {
        if (!mainPage.classList.contains('hidden')) {
            loadStatus();
            loadStats();
        }
    }, 30000);
})();

/**
 * 日志查看器
 */
if (logsBtn) {
    logsBtn.addEventListener('click', openLogsModal);
}

if (logsClose) {
    logsClose.addEventListener('click', closeLogsModal);
}

if (logsClear) {
    logsClear.addEventListener('click', async () => {
        try {
            await api('/api/logs/clear', { method: 'POST' });
            logsContainer.innerHTML = '';
        } catch (e) {
            console.error('清空日志失败:', e);
        }
    });
}

async function openLogsModal() {
    logsModal.classList.remove('hidden');
    logsContainer.innerHTML = '<div class="log-entry"><span class="log-message">加载中...</span></div>';

    try {
        // 加载历史日志
        const logs = await api('/api/logs?limit=100');
        logsContainer.innerHTML = '';
        logs.forEach(log => appendLogEntry(log));
        logsContainer.scrollTop = logsContainer.scrollHeight;

        // 启动 SSE 实时流
        startLogStream();
    } catch (e) {
        logsContainer.innerHTML = '<div class="log-entry error"><span class="log-message">加载失败: ' + e.message + '</span></div>';
    }
}

function closeLogsModal() {
    logsModal.classList.add('hidden');
    if (logsEventSource) {
        logsEventSource.close();
        logsEventSource = null;
    }
}

function startLogStream() {
    if (logsEventSource) {
        logsEventSource.close();
    }

    logsEventSource = new EventSource(`${API_BASE}/api/logs/stream?token=${token}`);

    logsEventSource.onmessage = (event) => {
        const log = JSON.parse(event.data);
        appendLogEntry(log);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    };

    logsEventSource.onerror = () => {
        // 连接断开，不做处理
    };
}

function appendLogEntry(log) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${log.level}`;

    const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-message">${escapeHtml(log.message)}</span>`;

    logsContainer.appendChild(entry);

    // 保持最多 200 条
    while (logsContainer.children.length > 200) {
        logsContainer.removeChild(logsContainer.firstChild);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 点击弹窗外部关闭
if (logsModal) {
    logsModal.addEventListener('click', (e) => {
        if (e.target === logsModal) {
            closeLogsModal();
        }
    });
}

// 密码重置
if (resetPwdBtn) {
    resetPwdBtn.addEventListener('click', async () => {
        const newPassword = prompt('请输入新密码 (至少6位):');
        if (!newPassword) return;

        if (newPassword.length < 6) {
            alert('密码长度至少 6 位');
            return;
        }

        try {
            const result = await api('/api/reset-password', {
                method: 'POST',
                body: JSON.stringify({ newPassword })
            });
            alert('✅ 密码已重置，下次登录请使用新密码');
        } catch (err) {
            alert('❌ 重置失败: ' + err.message);
        }
    });
}

// ==================== RSS 管理 ====================

const rssBtn = document.getElementById('rss-btn');
const rssModal = document.getElementById('rss-modal');
const rssClose = document.getElementById('rss-close');
const rssUrlInput = document.getElementById('rss-url-input');
const rssAddBtn = document.getElementById('rss-add-btn');
const rssFeedsList = document.getElementById('rss-feeds-list');
const rssCount = document.getElementById('rss-count');

// 打开 RSS 弹窗
if (rssBtn) {
    rssBtn.addEventListener('click', openRssModal);
}

// 关闭 RSS 弹窗
if (rssClose) {
    rssClose.addEventListener('click', closeRssModal);
}

// 点击弹窗外部关闭
if (rssModal) {
    rssModal.addEventListener('click', (e) => {
        if (e.target === rssModal) {
            closeRssModal();
        }
    });
}

// 添加订阅按钮
if (rssAddBtn) {
    rssAddBtn.addEventListener('click', addRssFeed);
}

// 回车添加订阅
if (rssUrlInput) {
    rssUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addRssFeed();
        }
    });
}

// 关键词添加按钮
const kwIncludeAdd = document.getElementById('kw-include-add');
const kwExcludeAdd = document.getElementById('kw-exclude-add');
const kwIncludeInput = document.getElementById('kw-include-input');
const kwExcludeInput = document.getElementById('kw-exclude-input');

if (kwIncludeAdd) {
    kwIncludeAdd.addEventListener('click', () => addKeyword('include'));
}
if (kwExcludeAdd) {
    kwExcludeAdd.addEventListener('click', () => addKeyword('exclude'));
}

if (kwIncludeInput) {
    kwIncludeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addKeyword('include');
        }
    });
}
if (kwExcludeInput) {
    kwExcludeInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addKeyword('exclude');
        }
    });
}

function openRssModal() {
    rssModal.classList.remove('hidden');
    loadRssFeeds();
    loadKeywords();
}

function closeRssModal() {
    rssModal.classList.add('hidden');
}

async function loadRssFeeds() {
    try {
        const data = await api('/api/rss/feeds');
        const feeds = data.feeds || [];
        rssCount.textContent = feeds.length;

        if (feeds.length === 0) {
            rssFeedsList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9em;">暂无订阅</p>';
            return;
        }

        rssFeedsList.innerHTML = feeds.map(feed => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5em; margin-bottom: 0.3em; background: var(--bg-secondary); border-radius: 4px;">
                <div style="overflow: hidden;">
                    <div style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(feed.title || feed.url)}</div>
                    <div style="font-size: 0.8em; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(feed.url)}</div>
                </div>
                <button onclick="deleteRssFeed(${feed.id})" class="btn-icon" title="删除" style="color: var(--error); flex-shrink: 0;">🗑️</button>
            </div>
        `).join('');
    } catch (err) {
        rssFeedsList.innerHTML = `<p style="color: var(--error);">加载失败: ${err.message}</p>`;
    }
}

async function addRssFeed() {
    const url = rssUrlInput.value.trim();
    if (!url) {
        alert('请输入 RSS URL');
        return;
    }

    rssAddBtn.disabled = true;
    rssAddBtn.textContent = '添加中...';

    try {
        const result = await api('/api/rss/feeds', {
            method: 'POST',
            body: JSON.stringify({ url })
        });

        rssUrlInput.value = '';
        loadRssFeeds();
        alert('✅ ' + result.message);
    } catch (err) {
        alert('❌ 添加失败: ' + err.message);
    } finally {
        rssAddBtn.disabled = false;
        rssAddBtn.textContent = '添加';
    }
}

async function deleteRssFeed(id) {
    if (!confirm('确定要删除这个订阅吗？')) {
        return;
    }

    try {
        await api(`/api/rss/feeds/${id}`, { method: 'DELETE' });
        loadRssFeeds();
    } catch (err) {
        alert('❌ 删除失败: ' + err.message);
    }
}

async function loadKeywords() {
    try {
        const data = await api('/api/rss/keywords');

        const includesList = document.getElementById('kw-includes-list');
        const excludesList = document.getElementById('kw-excludes-list');

        includesList.innerHTML = (data.includes || []).map(kw =>
            `<span class="keyword-tag" style="background: rgba(0,200,100,0.2); color: var(--success); padding: 0.2em 0.5em; border-radius: 3px; font-size: 0.85em;">
                ${escapeHtml(kw)} 
                <span onclick="deleteKeyword('${escapeHtml(kw)}', 'include')" style="cursor: pointer; margin-left: 0.3em;">×</span>
            </span>`
        ).join('') || '<span style="color: var(--text-muted); font-size: 0.85em;">无</span>';

        excludesList.innerHTML = (data.excludes || []).map(kw =>
            `<span class="keyword-tag" style="background: rgba(200,50,50,0.2); color: var(--error); padding: 0.2em 0.5em; border-radius: 3px; font-size: 0.85em;">
                ${escapeHtml(kw)} 
                <span onclick="deleteKeyword('${escapeHtml(kw)}', 'exclude')" style="cursor: pointer; margin-left: 0.3em;">×</span>
            </span>`
        ).join('') || '<span style="color: var(--text-muted); font-size: 0.85em;">无</span>';
    } catch (err) {
        console.error('加载关键词失败:', err);
    }
}

async function addKeyword(type) {
    const input = type === 'include' ? kwIncludeInput : kwExcludeInput;
    const keyword = input.value.trim();

    if (!keyword) {
        return;
    }

    try {
        await api('/api/rss/keywords', {
            method: 'POST',
            body: JSON.stringify({ keyword, type })
        });

        input.value = '';
        loadKeywords();
    } catch (err) {
        alert('❌ 添加失败: ' + err.message);
    }
}

async function deleteKeyword(keyword, type) {
    try {
        await api('/api/rss/keywords', {
            method: 'DELETE',
            body: JSON.stringify({ keyword, type })
        });
        loadKeywords();
    } catch (err) {
        alert('❌ 删除失败: ' + err.message);
    }
}
