# AI Travel Planner - 技术架构文档

> 版本: 2.0 | 最后更新: 2026-04-16

---

## 1. 架构总览

### 1.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端 | 原生 HTML/CSS/JS | 零框架依赖，轻量级 SPA |
| 后端 | Node.js + Express | SSE 流式通信，中间件安全体系 |
| AI 集成 | OpenAI SDK (统一接口) | 通过自定义 Base URL 支持多家 OpenAI 兼容提供商 |
| 子 Agent 系统 | 自研多 Agent 并行框架 | flight + research Agent 并行委派 |
| 安全 | Helmet + CORS + Joi + express-rate-limit | 多层安全防护 |
| 数据存储 | 浏览器 localStorage | 无数据库依赖，服务端完全无状态 |
| 测试 | Jest + Babel | 单元测试覆盖后端/前端/模型/工具 |

### 1.2 依赖项

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",   // Anthropic API 客户端（子 Agent 可用）
    "cors": "^2.8.6",                  // 跨域资源共享
    "express": "^4.21.0",              // HTTP 服务器
    "express-rate-limit": "^8.3.2",    // 请求速率限制
    "helmet": "^8.1.0",                // HTTP 安全头
    "joi": "^18.1.2",                  // 请求参数校验
    "openai": "^4.73.0",              // OpenAI/多提供商 API 客户端
    "uuid": "^11.0.0"                  // 会话 ID 生成
  },
  "devDependencies": {
    "@babel/preset-env": "^7.29.2",    // Jest ES Module 支持
    "babel-jest": "^30.3.0",           // Jest Babel 转换
    "jest": "^30.3.0"                  // 测试框架
  }
}
```

### 1.3 系统架构图

```
┌──────────────────────────────────────────────────────────────┐
│                      浏览器 (Browser)                         │
│                                                              │
│  ┌──────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │  Chat Panel   │  │ Itinerary Panel│  │ Settings Panel │   │
│  │  (chat.js)    │  │ (itinerary.js) │  │                │   │
│  │               │  │                │  │  - API Key     │   │
│  │  - 消息渲染    │  │ - TripBook     │  │  - 模型选择     │   │
│  │  - SSE 接收    │  │   面板渲染      │  │  - Base URL    │   │
│  │  - Quick Reply │  │ - 每日行程      │  │  - Brave Key   │   │
│  └──────┬────────┘  └──────┬─────────┘  └────────────────┘   │
│         └────────┬─────────┘                                  │
│                  │ SSE (Server-Sent Events)                    │
└──────────────────┼────────────────────────────────────────────┘
                   │
                   │ POST /api/chat
                   │ Headers: X-API-Key, X-Base-URL, X-Brave-Key
                   │ Body: { messages, provider, model, tripBookSnapshot }
                   ▼
┌──────────────────────────────────────────────────────────────┐
│                   Express Server (server.js)                  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              安全中间件层 (middleware/)                   │  │
│  │  Helmet → CORS → Rate Limit → Joi Validation           │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              POST /api/chat Handler                     │  │
│  │  1. TripBook 实例创建 + 从客户端快照恢复                    │  │
│  │  2. 动态构建 System Prompt                              │  │
│  │  3. 启动 Agent Loop → SSE 流式输出                      │  │
│  │  4. 后处理: Quick Replies + TripBook 补写               │  │
│  └────────────────────────┬───────────────────────────────┘  │
│                           ▼                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │         主 Agent Loop (最多 12 轮)                       │  │
│  │                                                        │  │
│  │   ┌───────────────────────────┐                        │  │
│  │   │   LLM API 调用（流式）      │                        │  │
│  │   │   OpenAI SDK (多提供商)    │                        │  │
│  │   └─────────────┬─────────────┘                        │  │
│  │                 │                                       │  │
│  │         有 tool_calls?                                   │  │
│  │          ╱         ╲                                     │  │
│  │        是            否                                   │  │
│  │        │              │                                  │  │
│  │   ┌────▼──────┐  ┌───▼──────────┐                      │  │
│  │   │ 并行执行    │  │ 后处理        │                      │  │
│  │   │ Promise.   │  │ + Quick Reply│                      │  │
│  │   │ allSettled │  │ + SSE done   │                      │  │
│  │   └────┬──────┘  └──────────────┘                      │  │
│  │        │                                                │  │
│  │   ┌────▼──────────────────────────────────────────┐    │  │
│  │   │  委派检查 (delegate_to_agents)                  │    │  │
│  │   │  → 并行启动子 Agent                             │    │  │
│  │   │  ┌─────────────┐  ┌──────────────────┐        │    │  │
│  │   │  │flight Agent  │  │ research Agent   │        │    │  │
│  │   │  │✈️ 机票搜索    │  │ 📋 目的地调研      │        │    │  │
│  │   │  │max 4 轮      │  │ max 2 轮          │        │    │  │
│  │   │  │search_flights│  │ web_search        │        │    │  │
│  │   │  │+ web_search  │  │ (签证/交通/天气等)  │        │    │  │
│  │   │  └──────────────┘  └──────────────────┘        │    │  │
│  │   │  → 返回结果 + coveredTopics                     │    │  │
│  │   └───────────────────────────────────────────────┘    │  │
│  │        │                                                │  │
│  │        │ 追加 tool_results → 继续循环                    │  │
│  │        └──────────→ 回到 LLM 调用                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                   工具层 (tools/)                        │  │
│  │                                                        │  │
│  │  web-search.js     poi-search.js    hotel-search.js    │  │
│  │  flight-search.js  update-trip-info.js                 │  │
│  │  scripts/  (Python: search_flights.py, search_hotels.py)│ │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 模型层 (models/)                         │  │
│  │  TripBook — 行程参考书 (3 层架构, Single Source of Truth) │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Prompt 层 (prompts/)                       │  │
│  │  system-prompt.js — 动态组装角色定义 + 状态机 + 工具策略   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Agent 层 (agents/)                         │  │
│  │  delegate.js         — delegate_to_agents 工具定义+执行  │  │
│  │  sub-agent-runner.js — 子 Agent 运行器 (多提供商适配)     │  │
│  │  config.js           — Agent 配置中心                    │  │
│  │  prompts/flight.js   — flight Agent system prompt       │  │
│  │  prompts/research.js — research Agent system prompt     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
ai-travel-planner/
├── server.js              # 主服务器入口 (~1000行)
├── package.json           # 项目配置 & 依赖
├── start.sh               # 启动脚本
├── jest.config.js         # Jest 测试配置
├── babel.config.js        # Babel 转换配置
│
├── docs/                  # 项目文档
│   ├── PRD.md             # 产品需求文档
│   └── ARCHITECTURE.md    # 技术架构文档 (本文件)
│
├── middleware/             # Express 中间件
│   ├── validation.js      # Joi 请求校验 + 输入清洗
│   └── security.js        # Helmet + CORS + 安全头 + 全局错误处理
│
├── models/                # 数据模型
│   └── trip-book.js       # TripBook 行程参考书 (3 层架构)
│
├── prompts/               # Prompt 管理
│   └── system-prompt.js   # System Prompt 动态组装器
│
├── agents/                # 子 Agent 系统
│   ├── delegate.js        # delegate_to_agents 工具定义 + 并行执行器
│   ├── sub-agent-runner.js# 子 Agent 运行器 (多提供商 LLM 适配)
│   ├── config.js          # Agent 配置中心 (工具/轮次/prompt)
│   └── prompts/           # 子 Agent System Prompt
│       ├── flight.js      # flight Agent prompt (航线调研+机票搜索)
│       └── research.js    # research Agent prompt (签证/交通/天气/美食)
│
├── tools/                 # 工具模块
│   ├── index.js           # 工具注册中心 & 统一执行器
│   ├── web-search.js      # Web 搜索 (Brave Search API)
│   ├── poi-search.js      # POI 地点搜索 (Google Maps)
│   ├── flight-search.js   # 机票搜索 (子 Agent 独占)
│   ├── hotel-search.js    # 酒店搜索
│   ├── update-trip-info.js# 行程信息更新
│   └── scripts/           # Python 辅助脚本
│       ├── search_flights.py  # 航班搜索实现
│       └── search_hotels.py   # 酒店搜索实现
│
├── utils/                 # 工具模块
│   ├── logger.js          # 结构化日志 (child logger, timer, 请求追踪)
│   └── constants.js       # 共享常量 (DEFAULT_MODELS 等)
│
├── __tests__/             # Jest 测试套件
│   ├── backend/           # 后端测试
│   ├── frontend/          # 前端测试
│   ├── models/            # 模型测试
│   └── tools/             # 工具测试
│
├── logs/                  # 日志输出目录
│
└── public/                # 前端静态文件
    ├── index.html         # 主页面
    ├── css/
    │   └── style.css      # 样式
    └── js/
        ├── chat.js        # 聊天核心逻辑
        └── itinerary.js   # 行程面板逻辑
```

---

## 3. 核心模块设计

### 3.1 Server 主路由 (`server.js`)

#### 请求处理流程

```
POST /api/chat
  │
  ├─ 1. 安全中间件
  │     ├─ Helmet (HTTP 安全头)
  │     ├─ CORS (跨域控制)
  │     ├─ Rate Limit (通用 100/h, 聊天 20/h, 工具 50/h)
  │     ├─ Joi Schema 校验 (chatRequestSchema)
  │     └─ 输入清洗 (sanitizeBody)
  │
  ├─ 2. TripBook 初始化
  │     ├─ 创建新实例
  │     └─ 从 tripBookSnapshot 恢复状态 (constraints + itinerary)
  │
  ├─ 3. 构建 System Prompt
  │     └─ buildSystemPrompt(conversationText, tripBook)
  │         ├─ 当前时间 + 日期规则
  │         ├─ 角色定义 + 行为准则
  │         ├─ 4 阶段规划状态机
  │         ├─ 工具使用策略 + 职责边界
  │         └─ TripBook 行程参考书注入
  │
  ├─ 4. Agent Loop (handleChat)
  │     └─ OpenAI 兼容接口统一处理所有提供商
  │
  ├─ 5. 后处理
  │     ├─ extractQuickReplies() — 从编号列表生成快捷回复
  │     └─ tryExtractTripInfo() — LLM 未调工具时自动补写 TripBook
  │
  └─ 6. SSE 事件序列结束: done
```

#### SSE 事件类型

| 事件名 | 数据结构 | 触发时机 |
|--------|---------|---------|
| `thinking` | `{}` | LLM 开始思考 |
| `thinking_done` | `{}` | LLM 思考结束 |
| `token` | `{ text }` | AI 输出每个 token |
| `fold_text` | `{}` | 折叠工具调用轮次的中间文本 |
| `replace_text` | `{ text }` | 替换已推送文本（清除 DSML/think 标签） |
| `round_start` | `{ round }` | 新一轮工具调用开始 |
| `tool_start` | `{ id, name, arguments }` | 开始执行工具 |
| `tool_result` | `{ id, name, resultLabel }` | 工具执行完成 |
| `tripbook_update` | `TripBook.toPanelData() + _snapshot` | TripBook 状态变更 |
| `quick_replies` | `{ questions: [...] }` | 快捷回复选项 |
| `done` | `{}` | 响应结束 |
| `error` | `{ message }` | 错误发生 |

### 3.2 主 Agent Loop

```
循环 (最多 MAX_TOOL_ROUNDS=12 轮):
  1. 调用 LLM API（流式, streamOpenAI）
  2. 实时转发文本 token → SSE(token)
  3. 收集 tool_calls（含 DSML 格式兜底解析）
  4. 如有工具调用:
     a. 所有工具并行执行 → Promise.allSettled(toolPromises)
        - delegate_to_agents: 检查委派次数/重复
        - web_search: 去重缓存 + 已覆盖主题拦截
        - 其他工具: 直接执行
     b. 同步结果到 TripBook
     c. 追加 tool_result 到消息列表
     d. 注入 coveredTopics 警告（如有）
     e. continue → 回到步骤 1
  5. 无工具调用 → sanitizeLLMOutput → Quick Replies → 退出

轮次耗尽处理:
  - 放行最后一轮的 update_trip_info
  - 强制 TripBook segments 补写（如果缺少）
  - 不带 tools 调用 LLM 生成最终总结
```

### 3.3 子 Agent 系统 (`agents/`)

#### 架构

```
主 Agent (server.js handleChat)
  │
  │ delegate_to_agents({ tasks: [flight, research] })
  ▼
delegate.js — executeDelegation()
  │
  ├─ 验证 Agent 类型 (AGENT_CONFIGS)
  ├─ 并行启动: Promise.allSettled(tasks.map(runSubAgent))
  │
  ├── sub-agent-runner.js — runSubAgent()
  │   ├─ 从 config.js 加载 Agent 配置
  │   ├─ 过滤可用工具 (config.tools)
  │   ├─ 构建 Agent System Prompt (config.buildPrompt)
  │   ├─ Agent 内部循环 (最多 config.maxRounds 轮)
  │   │   ├─ 调用 LLM (支持多提供商适配)
  │   │   ├─ 执行工具调用
  │   │   └─ 追加结果，继续循环
  │   └─ 返回 Agent 结果 + coveredTopics
  │
  └── 聚合所有 Agent 结果 → 返回主 Agent
```

#### Agent 配置 (`agents/config.js`)

| Agent | 可用工具 | 最大轮次 | Max Tokens |
|-------|---------|---------|-----------|
| flight | search_flights, web_search | 4 | 4096 |
| research | web_search | 2 | 8192 |

#### 防护机制

- **委派次数限制**: 整个对话最多 2 次 `delegate_to_agents`
- **重复委派拦截**: 同类型 Agent 不重复委派 (`delegatedAgents` Set)
- **coveredTopics 注入**: 子 Agent 返回后，已覆盖主题注入消息流，防止主 Agent 重复搜索
- **web_search 拦截**: 委派完成后，签证/航班/天气/交通/美食概览类搜索被自动拦截
- **web_search 去重缓存**: 同一 query（normalized）不重复执行 (`webSearchCache` Map)
- **Phase 回退重置**: 检测到 phase 回退时，清除委派标记和搜索缓存

### 3.4 DSML 解析器

DeepSeek 模型（尤其 R1）可能将 tool call 以 DSML XML 标签输出到 content 中，而非通过 `delta.tool_calls` 返回。系统内置 DSML 解析器：

```
检测: containsDSML() — 匹配 <｜DSML｜function_calls> 标签（支持全角/半角竖线）
解析: parseDSMLToolCalls() — 提取 invoke/parameter → 转换为 OpenAI tool_calls 格式
清洗: sanitizeLLMOutput() — 移除 <think>、DSML、泄露的 JSON 工具调用片段
```

### 3.5 TripBook 数据模型 (`models/trip-book.js`)

TripBook 是行程规划的核心数据模型，采用 **3 层架构**：

```
TripBook
├── Layer 1: 动态数据 (dynamic)
│   ├── flightQuotes[]   — 机票报价 [{ id, route, date, airline, price_usd, status }]
│   ├── hotelQuotes[]    — 酒店报价 [{ id, name, city, checkin, price_per_night_usd }]
│   └── webSearches[]    — 搜索记录 [{ query, summary, fetched_at }] (按 query 去重)
│
├── Layer 2: 用户约束 (constraints)
│   ├── destination      — { value, cities[], confirmed, confirmed_at }
│   ├── departCity       — { value, airports[], confirmed }
│   ├── dates            — { start, end, days, flexible, confirmed }
│   ├── people           — { count, details, confirmed }
│   ├── budget           — { value, per_person, currency, confirmed }
│   ├── preferences      — { tags[], notes, confirmed }
│   └── specialRequests[]— [{ type, value, confirmed }]
│
└── Layer 3: 结构化行程 (itinerary)
    ├── phase (0-4)      — 当前规划阶段
    ├── phaseLabel       — 阶段中文标签
    ├── theme            — 旅行主题（如"海岛潜水·城市探索之旅"）
    ├── route[]          — 城市路线 ["东京","京都","大阪"]
    ├── days[]           — 每日计划 [{ day, date, city, title, segments[] }]
    │   └── segments[]   — [{ time, title, type, location, notes, duration }]
    │       type 枚举:     transport | attraction | activity | meal | hotel | flight
    ├── budgetSummary    — 预算汇总 { flights, hotels, meals, ..., total_cny }
    ├── reminders[]      — 出发前清单
    └── practicalInfo[]  — 实用信息 [{ category, content, icon }]
```

**关键方法**:

| 方法 | 用途 |
|------|------|
| `updateConstraints(delta)` | 增量更新用户约束 |
| `updateItinerary(delta)` | 增量更新行程（按 day 编号合并，segments 完全替换） |
| `updatePhase(phase)` | 更新规划阶段 |
| `addFlightQuote(quote)` | 添加机票报价 |
| `addHotelQuote(quote)` | 添加酒店报价 |
| `addWebSearch(entry)` | 记录搜索查询（按 query 去重） |
| `toSystemPromptSection()` | 生成注入 System Prompt 的文本段 |
| `toPanelData()` | 导出前端面板渲染数据 |
| `toJSON()` | 序列化为 JSON（含 _snapshot 供客户端保存） |

**行程变更 clearLevel 机制**:

| clearLevel | 清空范围 | 触发场景 |
|-----------|---------|---------|
| `full` | days/route/theme/budgetSummary/reminders/practicalInfo + 动态报价 | 改目的地、日期、天数 |
| `details` | days 的 segments + budgetSummary/reminders/practicalInfo | 改预算、人数 |

### 3.6 System Prompt 组装 (`prompts/system-prompt.js`)

System Prompt 是动态拼装的，结构如下：

```
┌──────────────────────────────────────┐
│ 1. 当前时间 (UTC+8) + 日期规则        │
│ 2. 角色定义 & 行为准则                │
│ 3. 规划状态机 (Phase 0-4)             │
│    - 每轮决策流程                      │
│    - 各阶段定义 + 触发条件 + 完成标志    │
│    - 对话节奏 + 禁止规则               │
│    - 需求变更回退规则                   │
│ 4. 工具使用策略                       │
│    - 职责边界（主Agent vs 子Agent）     │
│    - 禁止直接调用的工具                 │
│    - web_search 去重原则               │
│      Phase 1-2: 每轮 1-2 个           │
│      Phase 3: 每轮最多 5 个并行        │
│    - delegate_to_agents 用法           │
│    - update_trip_info 调用时机          │
│    - segment.type 标注规则             │
│ 5. [条件注入] TripBook 行程参考书       │
│    ├── 动态数据 (报价/搜索记录)         │
│    ├── 用户约束 (已确认/待确认)         │
│    └── 当前行程进度                    │
└──────────────────────────────────────┘
```

### 3.7 工具系统 (`tools/`)

#### 工具注册中心 (`tools/index.js`)

```javascript
// 每个工具模块导出统一接口:
module.exports = {
  TOOL_DEF: { name, description, parameters },  // JSON Schema
  execute: async (args) => result                 // 执行函数
};

// index.js 导出三种能力:
getToolDefinitions()            // 全量工具列表（含 delegate_to_agents）
getMainAgentToolDefinitions()   // 主 Agent 专用（排除 search_flights）
executeToolCall(name, args)     // 统一执行器

// 子 Agent 独占工具:
SUB_AGENT_EXCLUSIVE_TOOLS = Set(['search_flights'])
```

#### 工具-TripBook 同步 (server.js runTool 后处理)

| 工具 | 同步行为 |
|------|---------|
| `search_flights` | → `tripBook.addFlightQuote()` |
| `search_hotels` | → `tripBook.addHotelQuote()` |
| `web_search` | → `tripBook.addWebSearch()` |
| `update_trip_info` | → `tripBook.updateConstraints/Phase/Itinerary()` + SSE `tripbook_update` |

---

## 4. 前端架构

### 4.1 页面布局

```
┌───────────────────────────────────────────────────┐
│ Header: [历史]  🌏 AI Travel Planner  [新建] [设置] │
├──────────────────────────┬────────────────────────┤
│                          │                        │
│    Chat Panel            │   Itinerary Panel      │
│                          │                        │
│  ┌────────────────────┐  │  ┌──────────────────┐  │
│  │ Welcome Card       │  │  │ 行程概览          │  │
│  │ / 消息列表          │  │  │ - 目的地/日期     │  │
│  │ / 工具调用动画      │  │  │ - 阶段进度 (1-4) │  │
│  │ / Quick Replies    │  │  │ - 路线           │  │
│  └────────────────────┘  │  │ - 机票/酒店报价   │  │
│                          │  │ - 每日详细行程    │  │
│  ┌────────────────────┐  │  │ - 预算汇总       │  │
│  │ [输入框]     [发送] │  │  │ - 行前准备       │  │
│  └────────────────────┘  │  └──────────────────┘  │
├──────────────────────────┴────────────────────────┤
│ Settings Drawer (侧边抽屉)                          │
│ History Drawer (侧边抽屉)                           │
└───────────────────────────────────────────────────┘
```

### 4.2 前端文件职责

| 文件 | 职责 |
|------|------|
| `index.html` | 页面结构 + 面板布局 |
| `css/style.css` | 全局样式 |
| `js/chat.js` | 聊天核心: SSE 连接、消息渲染、工具状态动画、Quick Reply、设置管理、历史管理 |
| `js/itinerary.js` | 行程面板: 接收 `tripbook_update` 事件、渲染结构化行程数据（每日 segments、预算、行前准备） |

### 4.3 数据流

```
用户输入
  ↓
chat.js → POST /api/chat (附带 tripBookSnapshot)
  ↓
SSE 事件流:
  thinking     → chat.js: 显示思考指示器
  token        → chat.js: 追加文字到消息气泡
  fold_text    → chat.js: 折叠中间文本
  replace_text → chat.js: 替换已推送文本（清除 DSML 等）
  round_start  → chat.js: 新轮次指示
  tool_start   → chat.js: 显示工具调用动画（loading 状态）
  tool_result  → chat.js: 更新工具状态（完成标签）
  tripbook_update → itinerary.js: 渲染行程面板 + 保存 _snapshot
  quick_replies → chat.js: 渲染可点击选项按钮
  thinking_done → chat.js: 清除思考指示器
  done         → chat.js: 结束流式接收、保存对话
  error        → chat.js: 显示错误信息
```

### 4.4 本地存储

| Key | 内容 | 说明 |
|-----|------|------|
| `settings` | `{ provider, model, apiKey, baseUrl, braveKey }` | 用户配置 |
| `conversations` | 对话历史数组 | 含 messages + TripBook 快照 |

---

## 5. 关键设计决策

### 5.1 为什么用 SSE 而不是 WebSocket？

- **单向数据流**: 聊天场景天然是「请求-流式响应」模式，SSE 完美匹配
- **简单性**: SSE 基于 HTTP，无需额外协议升级、心跳管理
- **兼容性**: 原生浏览器支持，无需第三方库
- **代理友好**: 比 WebSocket 更容易穿透反向代理

### 5.2 为什么 TripBook 在服务端是请求级别而非会话级别？

- 服务端**无状态设计**: 每次请求创建新 TripBook 实例，从客户端 `tripBookSnapshot` 恢复
- 客户端是真正的状态持有者，通过 localStorage 持久化
- 好处: 服务端无需 session 管理，水平扩展无压力

### 5.3 为什么采用主从 Agent 架构？

- **并行加速**: 机票搜索和目的地调研可以同时进行，缩短 50%+ 等待时间
- **职责隔离**: flight Agent 专注航线调研+机票搜索，research Agent 专注签证/交通/天气/美食，避免主 Agent 上下文过载
- **轮次节省**: 子 Agent 有独立的轮次预算（flight 4 轮，research 2 轮），不占用主 Agent 的 12 轮上限
- **防重复机制**: coveredTopics 机制确保子 Agent 完成后主 Agent 不重复搜索

### 5.4 为什么 Phase 3 采用并行搜索策略？

- **效率提升**: 每轮最多 5 个并行工具调用，7 天行程只需 2-3 轮即可覆盖（vs 逐天搜索需 7+ 轮）
- **后端已支持**: `Promise.allSettled(toolPromises)` 天然并行执行同一轮的所有工具调用
- **体验优化**: 减少用户等待时间，避免"逐天搜索"导致的长时间等待

### 5.5 为什么用 OpenAI SDK 统一多提供商？

- DeepSeek / Kimi / GLM / MiniMax 等均提供 OpenAI 兼容接口
- 通过 `baseUrl` 参数切换不同提供商，无需维护多套 SDK 适配代码
- 子 Agent 系统 (`sub-agent-runner.js`) 也统一使用 OpenAI SDK，通过 provider 配置自动适配

### 5.6 为什么需要 DSML 解析器？

- DeepSeek R1 模型有时将 tool call 以 DSML XML 标签输出到 content 而非 `tool_calls` 字段
- DSML 解析器作为兜底机制，将 DSML 格式转换为标准 OpenAI tool_calls
- `sanitizeLLMOutput()` 清除 `<think>` 标签和泄露的 JSON 工具调用片段，确保前端显示干净

### 5.7 为什么从 7 阶段简化为 4 阶段？

- 原 7 阶段过于细碎（机票/框架/酒店/详情/预算/导出分开），实际对话中阶段转换不自然
- 4 阶段更贴合用户认知：了解需求 → 规划框架 → 完善详情 → 行程总结
- Phase 2 将机票搜索和框架规划合并（通过 flight + research Agent 并行实现）
- Phase 3 将酒店搜索和每日详情合并（住宿位置根据景点分布决定）

---

## 6. 性能优化

### 6.1 并行执行策略

| 场景 | 并行方式 | 效果 |
|------|---------|------|
| Phase 2 委派 | flight + research Agent 并行 | 缩短 50%+ 等待 |
| Phase 3 搜索 | 每轮最多 5 个工具调用并行 | 7 天行程 2-3 轮完成 |
| 同轮工具调用 | Promise.allSettled 并行等待 | 所有工具同时执行 |

### 6.2 去重与缓存

| 机制 | 实现 | 效果 |
|------|------|------|
| web_search 去重 | `webSearchCache` Map (normalized query) | 同一查询不重复调用 |
| coveredTopics 拦截 | 委派后 BLOCKED_PATTERNS 正则匹配 | 防止重复搜索已覆盖主题 |
| TripBook webSearches | 按 query 去重存储 | 注入 Prompt 避免 LLM 重复搜索 |
| 委派去重 | `delegatedAgents` Set | 同类型 Agent 不重复委派 |

### 6.3 Token 优化

- **动态 Prompt 注入**: TripBook 仅注入当前有效数据，无数据不注入
- **TripBook 压缩**: `toPanelData()` 只导出面板需要的扁平数据
- **按需组装**: System Prompt 基于 TripBook 当前状态动态拼装

### 6.4 Agent Loop 保护

- 主 Agent 最大 12 轮工具调用循环
- 子 Agent 独立轮次上限（flight: 4, research: 2）
- 子 Agent 执行超时: 120 秒/个
- 单次 LLM 调用超时: 300 秒
- 单次工具执行超时: 30 秒
- 轮次耗尽时放行 `update_trip_info` 确保数据不丢失

---

## 7. 安全架构

### 7.1 中间件层 (`middleware/`)

| 中间件 | 功能 |
|--------|------|
| Helmet | 设置安全 HTTP 头（CSP, HSTS, X-Frame-Options 等） |
| CORS | 跨域资源共享控制 |
| express-rate-limit | 请求频率限制（通用/聊天/工具三级） |
| Joi validation | 请求 body/header 的 Schema 校验 |
| sanitizeBody | 输入清洗，防止 XSS/注入 |
| globalErrorHandler | 全局错误处理，防止敏感信息泄露 |

### 7.2 API Key 安全

- API Key 仅存储在浏览器 localStorage
- 通过 `X-API-Key` 请求头传输（HTTPS 保障传输安全）
- 服务端不持久化、不日志记录 API Key
- Brave Search Key 通过 `X-Brave-Key` 头传输，运行时注入 `process.env`

---

## 8. 扩展指南

### 8.1 添加新工具

1. 在 `tools/` 目录创建新文件，导出标准接口:

```javascript
const TOOL_DEF = {
  name: 'my_new_tool',
  description: '工具描述',
  parameters: {
    type: 'object',
    properties: { /* JSON Schema */ },
    required: []
  }
};

async function execute(args) {
  // 实现逻辑
  return result;
}

module.exports = { TOOL_DEF, execute };
```

2. 在 `tools/index.js` 的 `ALL_TOOLS` 数组中注册
3. (可选) 在 `server.js` 的 `runTool()` 后处理中添加 TripBook 同步逻辑
4. (可选) 在 `getToolResultLabel()` 中添加人类可读标签
5. (可选) 如需设为子 Agent 独占，添加到 `SUB_AGENT_EXCLUSIVE_TOOLS`

### 8.2 添加新子 Agent

1. 在 `agents/prompts/` 创建新的 prompt 文件，导出 `build(task)` 函数
2. 在 `agents/config.js` 的 `AGENT_CONFIGS` 中注册新 Agent:

```javascript
myAgent: {
  tools: ['web_search', 'my_tool'],  // 可用工具
  buildPrompt: myPrompt.build,        // System Prompt 构建函数
  maxRounds: 3,                        // 最大工具调用轮次
  maxTokens: 4096,                     // 最大输出 token
  icon: '🔍',                          // 前端图标
  label: '我的Agent'                    // 中文标签
}
```

3. 在 `prompts/system-prompt.js` 的委派规则中说明新 Agent 的职责和触发条件

### 8.3 添加新 AI 提供商

1. 确认提供商支持 OpenAI 兼容接口
2. 在 `utils/constants.js` 的 `DEFAULT_MODELS` 中添加默认模型
3. 在前端 `index.html` 的 provider/model 下拉框中添加选项
4. 用户配置自定义 Base URL 即可接入
