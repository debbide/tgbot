# 🤖 TG 多功能机器人 (Docker 版)

功能强大的 Telegram 机器人，集成了 AI 聊天、实用工具、RSS 订阅等功能，支持 Docker 一键部署和 Web 面板管理。

## ✨ 功能特性

### 🤖 AI 智能助手
- **💬 智能对话**：基于 OpenAI，支持多轮对话上下文记忆
- **📝 智能摘要**：发送长文或链接，AI 自动生成精简摘要
- **🎭 角色扮演**：可定制 System Prompt (通过 Web 面板)

### 🛠️ 实用工具
- **🌐 翻译**：`/tr` 快速翻译文本
- **🔗 短链接**：`/short` 生成短链接
- **📱 二维码**：`/qr` 生成二维码
- **🌤️ 天气**：`/weather` 查询全球天气
- **💰 汇率**：`/rate` 实时汇率换算
- **🆔 ID 查询**：`/id` 获取用户/群组 ID
- **🌍 网络工具**：`/ip` 查询归属地，`/whois` 查询域名信息

### 📝 记录与提醒
- **⏰ 定时提醒**：支持特定时间或倒计时提醒
- **📝 备忘录**：随手记录，随时查看

### 📰 RSS 订阅增强
- **⏱️ 动态间隔**：可自定义检查频率
- **🔍 关键词过滤**：支持白名单和黑名单过滤
- **📊 集中管理**：通过菜单或命令轻松管理订阅

### ⚙️ 系统特性
- **🖥️ Web 配置面板**：可视化管理所有配置，无需修改文件
- **📊 使用统计**：面板展示调用量、用户数、内存使用率和热门命令图表
- **📋 实时日志**：面板内实时查看 Bot 运行日志
- **🔄 热重载**：修改配置后即时生效，支持一键重启
- **📝 日志轮转**：使用 Winston 自动管理日志，保留 14 天
- **🐳 Docker 部署**：开箱即用，数据持久化

## 🚀 快速部署

### 方式一：Docker Compose (推荐)

```bash
# 克隆仓库
git clone https://github.com/debbide/tgbot.git
cd tgbot

# 启动服务
docker-compose up -d
```

### 方式二：Docker 命令

```bash
docker run -d \
  --name tgbot \
  -p 3000:3000 \
  -v ./data:/app/data \
  ghcr.io/debbide/tgbot:latest
```

## ⚙️ 配置 Bot

1. 访问面板：`http://localhost:3000`
2. **首次访问需设置管理员密码**
3. 登录后在面板中填入：
   - **Bot Token**: 从 [@BotFather](https://t.me/BotFather) 获取
   - **管理员 ID**: 可选，用于接收 Bot 启动通知
   - **OpenAI Key**: 用于 AI 功能 (可选)
4. 点击 **💾 保存配置**，然后点击顶部 **🔄 重启** 按钮

## 📂 目录结构

```
.
├── data/                   # 数据持久化目录
│   ├── config.json         # 配置文件
│   ├── bot.db              # SQLite 数据库
│   └── logs/               # 日志文件
├── src/
│   ├── commands/           # 命令模块
│   ├── core/               # 核心功能 (命令加载器)
│   ├── db/                 # 数据库 DAO 模块
│   ├── services/           # 服务模块
│   └── web/                # Web 面板
├── docker-compose.yml
├── Dockerfile
└── index.js
```

## 📝 命令列表

发送 `/start` 或 `/help` 唤起交互式菜单，或使用以下命令：

| 命令 | 说明 | 示例 |
|------|------|------|
| `/chat` `/c` | AI 对话 | `/chat 写首诗` |
| `/sum` | 智能摘要 | `/sum https://...` |
| `/tr` | 翻译 | `/tr hello` |
| `/rss` | RSS 管理 | `/rss add URL` |
| `/remind` | 定时提醒 | `/remind 10m 喝水` |
| `/note` | 备忘录 | `/note add 待办事项` |
| `/weather` | 天气查询 | `/weather 北京` |
| `/rate` | 汇率换算 | `/rate 100 usd cny` |
| `/ip` | IP 查询 | `/ip 1.1.1.1` |
| `/whois` | 域名查询 | `/whois example.com` |
| `/qr` | 生成二维码 | `/qr https://...` |
| `/short` | 生成短链接 | `/short https://...` |
| `/id` | 获取 ID | `/id` |

## 🖥️ Web 面板功能

- **配置管理**：Bot Token、API 设置、功能开关
- **使用统计**：总调用次数、今日调用、用户数、内存使用率
- **命令趋势图**：可视化展示各命令使用频率
- **实时日志**：查看 Bot 运行日志，支持清空
- **一键操作**：重启 Bot、修改密码

## 🛠️ 本地开发

```bash
# 安装依赖
npm install

# 启动开发
npm start
```

## 📄 License

MIT
