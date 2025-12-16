const fs = require('fs');
const path = require('path');

/**
 * 动态加载命令
 * @param {Object} bot Telegraf 实例
 * @param {Object} options 额外参数，如 isAdmin 检查函数
 */
function loadCommands(bot, options = {}) {
    const commandsDir = path.join(__dirname, '../commands');

    if (!fs.existsSync(commandsDir)) {
        console.warn('⚠️ Commands directory not found:', commandsDir);
        return;
    }

    const files = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
    const { isAdmin } = options;

    console.log(`📦 Loading ${files.length} command modules...`);

    for (const file of files) {
        try {
            const filePath = path.join(commandsDir, file);
            const module = require(filePath);

            // 遍历模块导出，寻找 setup 开头的函数
            for (const key in module) {
                if (key.startsWith('setup') && typeof module[key] === 'function') {
                    // 调用 setup 函数
                    // 统一传入 bot 和 isAdmin
                    // 大多数命令只接收 bot，多余参数会被忽略
                    // 需要 isAdmin 的命令 (panel, group, broadcast) 会接收到它
                    module[key](bot, isAdmin);
                    // console.log(`   - Loaded: ${key} from ${file}`);
                }
            }
        } catch (err) {
            console.error(`❌ Failed to load command ${file}:`, err.message);
        }
    }

    console.log('✅ All commands loaded');
}

module.exports = { loadCommands };
