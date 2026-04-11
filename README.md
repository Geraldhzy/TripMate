# 🌍 AI Travel Planner

> 对话式 AI 旅行规划助手 — 实时查询机票、天气、汇率，智能规划完整行程。

## 快速启动

```bash
./start.sh
```

运行后自动：
1. 安装依赖（`npm install`）
2. 启动服务（端口 3000）
3. 打开浏览器 `http://localhost:3000`

---

## 手动启动

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 访问
open http://localhost:3000
```

---

## 配置

首次打开页面时会自动弹出设置面板，填入你的 API Key 即可使用。

| 字段 | 说明 |
|------|------|
| AI 提供商 | 支持 OpenAI / Anthropic Claude / DeepSeek |
| 模型 | 推荐 GPT-4o 或 Claude Sonnet 4 |
| API Key | 填入对应提供商的 Key，**仅存本地，不上传服务器** |
| Base URL | 可选，使用代理或第三方兼容 API 时填写 |

---

## 功能

- **智能行程规划** — 渐进式规划，先确认目的地和时间，再逐步深入
- **实时机票查询** — 搜索具体航班、价格、经停信息
- **天气预报** — 查询目的地未来天气，辅助行程安排
- **汇率转换** — 实时汇率，自动换算价格为人民币
- **景点餐厅搜索** — 搜索并推荐当地 POI
- **签证信息** — 搜索中国护照签证政策
- **历史行程** — 自动保存规划记录，随时继续上次对话
- **目的地知识库** — 自动缓存目的地基础信息，避免重复查询

---

## 技术栈

- **后端** Node.js + Express，SSE 流式输出
- **前端** 原生 HTML / CSS / JS，无框架依赖
- **AI** 支持 OpenAI（GPT-4o）/ Anthropic（Claude）/ DeepSeek 三家

## 环境要求

- Node.js 18+
- npm 9+

---

*Key 仅存储在浏览器 localStorage，不会发送到任何第三方服务器。*
