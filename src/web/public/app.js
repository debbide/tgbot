/**
 * 配置面板前端逻辑
 */

const API_BASE = '';
let token = localStorage.getItem('token');

// DOM 元素
const loginPage = document.getElementById('login-page');
const mainPage = document.getElementById('main-page');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const settingsForm = document.getElementById('settings-form');
const statusBadge = document.getElementById('status-badge');
const saveStatus = document.getElementById('save-status');
const restartBtn = document.getElementById('restart-btn');
const statTotal = document.getElementById('stat-total');
const statUsers = document.getElementById('stat-users');
const statToday = document.getElementById('stat-today');
const statsCommands = document.getElementById('stats-commands');

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
 * 登出
 */
logoutBtn.addEventListener('click', logout);

function logout() {
    token = null;
    localStorage.removeItem('token');
    showLoginPage();
}

/**
 * 重启 Bot
 */
restartBtn.addEventListener('click', async () => {
    if (!confirm('确定要重启 Bot 吗？\n这会中断当前所有连接。')) {
        return;
    }

    restartBtn.disabled = true;
    restartBtn.textContent = '🔄 重启中...';

    try {
        await api('/api/restart', { method: 'POST' });
        alert('✅ Bot 已重启');
        loadStatus();
    } catch (err) {
        alert('❌ 重启失败: ' + err.message);
    } finally {
        restartBtn.disabled = false;
        restartBtn.textContent = '🔄 重启 Bot';
    }
});

/**
 * 页面切换
 */
function showLoginPage() {
    loginPage.classList.remove('hidden');
    mainPage.classList.add('hidden');
}

function showMainPage() {
    loginPage.classList.add('hidden');
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

    // 先处理复选框（未选中的不会出现在 FormData 中）
    settingsForm.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
        setNestedValue(data, checkbox.name, checkbox.checked);
    });

    // 处理其他输入
    for (const [name, value] of formData.entries()) {
        const input = settingsForm.querySelector(`[name="${name}"]`);
        if (input.type === 'checkbox') continue;

        let finalValue = value;

        // 数字类型
        if (input.type === 'number') {
            finalValue = parseInt(value, 10) || 0;
        }
        // 数组类型（逗号分隔）
        else if (name.includes('keywords') || name.includes('exclude')) {
            finalValue = value ? value.split(',').map((s) => s.trim()).filter(Boolean) : [];
        }

        setNestedValue(data, name, finalValue);
    }

    return data;
}

/**
 * 设置嵌套对象值
 */
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

        // 渲染命令列表
        statsCommands.innerHTML = stats.commands.slice(0, 5).map(cmd => `
            <div class="stat-row">
                <span>/${cmd.command}</span>
                <span>${cmd.count}</span>
            </div>
        `).join('');
    } catch (err) {
        console.error('加载统计失败:', err);
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
 * 初始化
 */
if (token) {
    showMainPage();
} else {
    showLoginPage();
}

// 定时刷新状态
setInterval(() => {
    loadStatus();
    loadStats();
}, 30000);
