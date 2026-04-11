# AI Travel Planner - 技术架构文档

> 版本: 1.0 | 最后更新: 2026-04-11

---

## 1. 架构总览

### 1.1 技术栈

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端 | 原生 HTML/CSS/JS | 零框架依赖，轻量级 SPA |
| 后端 | Node.js + Express | 单文件服务器，SSE 流式通信 |
| AI 集成 | OpenAI SDK + Anthropic SDK | 双 SDK 架构，统一 Agent Loop |
| 数据存储 | 浏览器 localStorage + 服务端内存 | 无数据库依赖 |
| 部署 | Node.js 单进程 | 可直接部署到 VPS/PaaS |

### 1.2 依赖项

```json
{
  "express": "^4.21.0",        // HTTP 服务器
  "openai": "^4.73.0",         // OpenAI/DeepSeek API 客户端
  "@anthropic-ai/sdk": "^0.32.0", // Anthropic API 客户端
  "uuid": "^11.0.0"            // 会话 ID 生成
}
```

### 1.3 系统架构图

```
┌─────────────────────────────────────────────────────────┐
│                     浏览器 (Browser)                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Chat Panel  │  │ Itinerary    │  │  Settings     │  │
│  │  (chat.js)   │  │ Panel        │  │  Panel        │  │
│  │              │  │ (itinerary.js│  │               │  │
│  │  - 消息渲染   │  │  - TripBook  │  │  - API Key    │  │
│  │  - SSE 接收   │  │    面板渲染   │  │  - 模型选择    │  │
│  │  - Quick Reply│  │  - 行程概览   │  │               │  │
│  └──────┬───────┘  └──────┬───────┘  └───────────────┘  │
│         │                 │                              │
│         └────────┬────────┘                              │
│                  │ SSE (Server-Sent Events)               │
└──────────────────┼──────────────────────────────────────┘
                   │
                   │ POST /api/chat
                   │ Headers: X-API-Key, X-Base-URL
                   │ Body: { messages, provider, model,
                   │         knownRates, knownWeather,
                   │         tripBookSnapshot }
                   ▼
┌──────────────────────────────────────────────────────────┐
│                   Express Server (server.js)              │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                 POST /api/chat Handler               │ │
│  │                                                     │ │
│  │  1. 验证 API Key                                     │ │
│  │  2. 合并缓存（客户端 + 服务端）                         │ │
│  │  3. 创建 TripBook 实例                                │ │
│  │  4. 构建 System Prompt                               │ │
│  │  5. 启动 Agent Loop → SSE 流式输出                    │ │
│  │  6. 后处理: extractItineraryInfo + Quick Replies      │ │
│  └──────────────────┬──────────────────────────────────┘ │
│                     │                                    │
│  ┌──────────────────┼──────────────────────────────────┐ │
│  │            Agent Loop (最多 10 轮)                    │ │
│  │                  │                                   │ │
│  │    ┌─────────────▼──────────────┐                    │ │
│  │    │   LLM API 调用（流式）       │                    │ │
│  │    │   OpenAI / Anthropic        │                    │ │
│  │    └─────────────┬──────────────┘                    │ │
│  │                  │                                   │ │
│  │          有 tool_calls?                               │ │
│  │           ╱         ╲                                 │ │
│  │         是            否                               │ │
│  │         │              │                              │ │
│  │    ┌────▼────┐    ┌───▼──────────┐                   │ │
│  │    │执行工具   │    │ 后处理        │                   │ │
│  │    │runTool() │    │ + Quick Reply│                   │ │
│  │    │同步TripBook│   │ + SSE done   │                   │ │
│  │    └────┬────┘    └──────────────┘                   │ │
│  │         │ 追加 tool_result → 继续循环                  │ │
│  │         └──────────→ 回到 LLM 调用                    │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                   工具层 (tools/)                     │ │
│  │                                                     │ │
│  │  web-search.js    weather.js     exchange-rate.js   │ │
│  │  poi-search.js    flight-search.js  hotel-search.js │ │
│  │  dest-knowledge.js  update-trip-info.js             │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                 模型层 (models/)                      │ │
│  │  TripBook — 行程参考书 (Single Source of Truth)        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              Prompt 层 (prompts/)                    │ │
│  │  system-prompt.js + knowledge/{methodology,          │ │
│  │    malaysia, diving, holidays}                       │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## 2. 目录结构

```
ai-travel-planner/
├── server.js              # 主服务器入口 (~800行)
├── package.json           # 项目配置 & 依赖
├── start.sh               # 启动脚本
├── .env                   # 环境变量 (API Keys)
├── .env.example           # 环境变量模板
├── README.md              # 项目说明
│
├── docs/                  # 项目文档
│   ├── PRD.md             # 产品需求文档
│   └── ARCHITECTURE.md    # 技术架构文档 (本文件)
│
├── models/                # 数据模型
│   └── trip-book.js       # TripBook 行程参考书
│
├── prompts/               # Prompt 管理
│   ├── system-prompt.js   # System Prompt 动态组装器
│   └── knowledge/         # 知识库
│       ├── methodology.js # 7阶段规划方法论
│       ├── malaysia.js    # 马来西亚知识库
│       ├── diving.js      # 潜水活动知识库
│       └── holidays.js    # 中国节假日安排
│
├── tools/                 # 工具模块
│   ├── index.js           # 工具注册中心 & 统一执行器
│   ├── web-search.js      # Web 搜索
│   ├── weather.js         # 天气查询
│   ├── exchange-rate.js   # 汇率查询
│   ├── poi-search.js      # POI 地点搜索
│   ├── flight-search.js   # 机票搜索
│   ├── hotel-search.js    # 酒店搜索
│   ├── dest-knowledge.js  # 目的地知识缓存
│   ├── update-trip-info.js# 行程信息更新
│   └── scripts/           # 工具辅助脚本
│
├── data/                  # 数据文件
│   └── dest-cache.json    # 目的地知识缓存持久化
│
└── public/                # 前端静态文件
    ├── index.html         # 主页面
    ├── css/
    │   └── style.css      # 样式
    ├── js/
    │   ├── chat.js        # 聊天核心逻辑
    │   └── itinerary.js   # 行程面板逻辑
    └── shares/            # 分享功能 (预留)
```

---

## 3. 核心模块设计

### 3.1 Server 主路由 (`server.js`)

#### 请求处理流程

```
POST /api/chat
  │
  ├─ 1. 参数校验 (API Key, messages)
  │
  ├─ 2. 缓存合并
  │     ├─ 客户端传入的 knownRates + 服务端内存缓存 → 去重合并
  │     ├─ 客户端传入的 knownWeather + 服务端内存缓存 → 去重合并
  │     └─ TTL 过滤: 汇率 4h, 天气 3h
  │
  ├─ 3. TripBook 初始化
  │     ├─ 创建新实例
  │     ├─ 注入已知汇率
  │     └─ 从 tripBookSnapshot 恢复状态 (constraints, itinerary, knowledgeRefs)
  │
  ├─ 4. 构建 System Prompt
  │     └─ buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook)
  │
  ├─ 5. Agent Loop (provider-specific)
  │     ├─ Anthropic → handleAnthropicChat()
  │     ├─ DeepSeek  → handleOpenAIChat(baseUrl=deepseek)
  │     └─ OpenAI    → handleOpenAIChat()
  │
  ├─ 6. 后处理
  │     ├─ postProcessTripBook() — 正则提取行程信息补充到 TripBook
  │     └─ extractQuickReplies() — 生成快捷回复选项
  │
  └─ 7. SSE 事件序列结束: done
```

#### SSE 事件类型

| 事件名 | 数据结构 | 触发时机 |
|--------|---------|---------|
| `token` | `{ text }` | AI 输出每个 token |
| `tool_start` | `{ id, name, arguments }` | 开始执行工具 |
| `tool_result` | `{ id, name, resultLabel }` | 工具执行完成 |
| `rate_cached` | `{ from, to, rate, ... }` | 汇率结果缓存到客户端 |
| `weather_cached` | `{ city, current, forecast }` | 天气结果缓存到客户端 |
| `tripbook_update` | `TripBook.toPanelData()` | TripBook 状态变更 |
| `itinerary_update` | `{ destination, days, ... }` | 兼容旧前端的行程更新 |
| `quick_replies` | `{ questions: [...] }` | 快捷回复选项 |
| `done` | `{}` | 响应结束 |
| `error` | `{ message }` | 错误发生 |

### 3.2 Agent Loop

系统为 OpenAI 和 Anthropic 分别实现了 Agent Loop，核心逻辑一致：

```
循环 (最多 MAX_TOOL_ROUNDS=10 轮):
  1. 调用 LLM API（流式）
  2. 实时转发文本 token → SSE(token)
  3. 收集 tool_calls / tool_use
  4. 如有工具调用:
     a. 执行 runTool() → SSE(tool_start, tool_result)
     b. 同步结果到 TripBook
     c. 追加工具结果到消息列表
     d. continue → 回到步骤 1
  5. 无工具调用 → 后处理 → 退出循环
```

**OpenAI vs Anthropic 差异**:

| 方面 | OpenAI (`handleOpenAIChat`) | Anthropic (`handleAnthropicChat`) |
|------|---------------------------|----------------------------------|
| 流式 API | `client.chat.completions.create({stream:true})` | `client.messages.stream()` |
| 工具格式 | `tool_calls[].function.{name,arguments}` | `content[].{type:'tool_use', name, input}` |
| 工具结果 | `{role:'tool', tool_call_id, content}` | `{role:'user', content:[{type:'tool_result'}]}` |
| System Prompt | `messages[0].role='system'` | `system` 参数 |
| 模型默认值 | `gpt-4o` | `claude-sonnet-4-20250514` |

### 3.3 TripBook 数据模型 (`models/trip-book.js`)

TripBook 是行程规划的核心数据模型，采用 4 层架构：

```
TripBook
├── Layer 1: 静态知识引用
│   ├── knowledgeRefs[]  — ["日本", "泰国"]
│   └── activityRefs[]   — ["潜水"]
│
├── Layer 2: 动态数据 (带 TTL)
│   ├── weather{}        — 天气缓存 (3h TTL)
│   ├── exchangeRates{}  — 汇率缓存 (4h TTL)
│   ├── flightQuotes[]   — 机票报价 (状态: quoted→selected→booked)
│   └── hotelQuotes[]    — 酒店报价 (状态: quoted→selected→booked)
│
├── Layer 3: 用户约束
│   ├── destination      — { value, cities[], confirmed, confirmed_at }
│   ├── departCity       — { value, airports[], confirmed }
│   ├── dates            — { start, end, days, flexible, confirmed }
│   ├── people           — { count, details, confirmed }
│   ├── budget           — { value, per_person, currency, confirmed }
│   ├── preferences      — { tags[], notes, confirmed }
│   ├── specialRequests[]— [{ type, value, confirmed }]
│   └── _history[]       — 约束变更记录
│
└── Layer 4: 结构化行程
    ├── phase (0-7)      — 当前规划阶段
    ├── route[]          — 城市路线 ["东京","京都","大阪"]
    ├── days[]           — 每日计划 [{ day, date, city, title, segments[] }]
    ├── budgetSummary    — 预算汇总
    └── reminders[]      — 出行提醒
```

**关键方法**:

| 方法 | 用途 |
|------|------|
| `updateConstraints(delta)` | 增量更新用户约束，自动记录变更历史 |
| `updateItinerary(delta)` | 增量更新行程（按 day 编号合并） |
| `toSystemPromptSection()` | 生成注入 System Prompt 的文本段 |
| `toPanelData()` | 导出前端面板渲染数据 |
| `toJSON()` / `fromJSON()` | 序列化/反序列化 |

### 3.4 System Prompt 组装 (`prompts/system-prompt.js`)

System Prompt 是动态拼装的，结构如下：

```
┌──────────────────────────────────┐
│ 1. 当前时间 (UTC+8)               │
│ 2. 节假日安排表                    │
│ 3. 已缓存汇率/天气 (无TripBook时)   │
│ 4. 角色定义 & 行为准则             │
│ 5. 渐进式方法论 (7阶段)            │
│ 6. 工具使用策略 (8个工具)          │
│ 7. 来源标注规则                    │
│ 8. [条件注入] 马来西亚知识库        │
│ 9. [条件注入] 潜水活动知识库        │
│ 10. [条件注入] 动态缓存的目的地知识  │
│ 11. TripBook 行程参考书             │
│     ├── 已缓存动态数据              │
│     ├── 用户已确认/待确认信息        │
│     └── 当前行程进度                │
└──────────────────────────────────┘
```

**知识库注入策略**: 基于对话文本的关键词匹配，按需注入知识库，避免无关知识消耗 token。

### 3.5 工具系统 (`tools/`)

#### 工具注册中心 (`tools/index.js`)

统一管理 8 个工具的定义和执行：

```javascript
// 每个工具模块导出统一接口:
module.exports = {
  TOOL_DEF: { name, description, parameters },  // JSON Schema
  execute: async (args) => result                 // 执行函数
};

// index.js 导出两种格式:
getToolDefinitions()          // OpenAI function calling 格式
getToolDefinitionsForAnthropic()  // Anthropic tool use 格式
executeToolCall(name, args)   // 统一执行器
```

#### 工具-TripBook 同步

工具执行结果自动同步到 TripBook：

| 工具 | 同步行为 |
|------|---------|
| `get_exchange_rate` | → `tripBook.setExchangeRate()` + SSE `rate_cached` |
| `get_weather` | → `tripBook.setWeather()` + SSE `weather_cached` |
| `search_flights` | → `tripBook.addFlightQuote()` |
| `search_hotels` | → `tripBook.addHotelQuote()` |
| `cache_destination_knowledge` | → `tripBook.addKnowledgeRef()` |
| `update_trip_info` | → `tripBook.updateConstraints/Phase/Itinerary()` + SSE `tripbook_update` |

#### 缓存策略

| 数据类型 | 缓存位置 | TTL | 去重策略 |
|---------|---------|-----|---------|
| 汇率 | 服务端内存 + 客户端 body | 4 小时 | key: `${from}_${to}`, 服务端优先 |
| 天气 | 服务端内存 + 客户端 body | 3 小时 | key: `city.toLowerCase()`, 服务端优先 |
| 目的地知识 | `data/dest-cache.json` | 持久化 | key: `destination` |

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
│  │ / 工具调用动画      │  │  │ - 阶段进度       │  │
│  │ / Quick Replies    │  │  │ - 路线           │  │
│  └────────────────────┘  │  │ - 机票/酒店      │  │
│                          │  │ - 每日概要       │  │
│  ┌────────────────────┐  │  └──────────────────┘  │
│  │ [输入框]     [发送] │  │                        │
│  └────────────────────┘  │                        │
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
| `js/itinerary.js` | 行程面板: 接收 `tripbook_update` 事件、渲染结构化行程数据 |

### 4.3 数据流

```
用户输入
  ↓
chat.js → POST /api/chat (附带 knownRates, knownWeather, tripBookSnapshot)
  ↓
SSE 事件流:
  token        → chat.js: 追加文字到消息气泡
  tool_start   → chat.js: 显示工具调用动画（loading 状态）
  tool_result  → chat.js: 更新工具状态（完成标签）
  rate_cached  → chat.js: 更新本地汇率缓存
  weather_cached → chat.js: 更新本地天气缓存
  tripbook_update → itinerary.js: 渲染行程面板
  quick_replies → chat.js: 渲染可点击选项按钮
  done         → chat.js: 结束流式接收、保存对话
  error        → chat.js: 显示错误信息
```

### 4.4 本地存储

| Key | 内容 | 说明 |
|-----|------|------|
| `settings` | `{ provider, model, apiKey, baseUrl }` | 用户配置 |
| `conversations` | 对话历史数组 | 含 messages + TripBook 快照 |
| `knownRates` | 汇率缓存数组 | 跨会话复用 |
| `knownWeather` | 天气缓存数组 | 跨会话复用 |

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

### 5.3 为什么同时支持 OpenAI 和 Anthropic？

- **用户选择权**: 不同用户有不同的 API Key 和模型偏好
- **冗余**: 一家服务不可用时可切换
- **成本灵活**: DeepSeek 提供更经济的选择

### 5.4 为什么用正则后处理补充 TripBook？

- **降级方案**: 不是所有模型都能可靠调用 `update_trip_info` 工具
- **双保险**: AI 调用工具是主路径，正则提取是补充路径
- `postProcessTripBook()` 对两种情况有不同处理策略:
  - AI 已调用工具 → 只补充尚无值的字段
  - AI 未调用工具 → 全量回写正则提取结果

### 5.5 为什么工具定义维护两份格式？

OpenAI 和 Anthropic 的工具格式不兼容：
- OpenAI: `{ type: 'function', function: { name, description, parameters } }`
- Anthropic: `{ name, description, input_schema }`

`tools/index.js` 作为适配层，从统一的 `TOOL_DEF` 转换为两种格式。

---

## 6. 性能优化

### 6.1 缓存分层

```
第一层: 服务端内存缓存
  ↓ (getCachedRates/getCachedWeather)
第二层: 客户端请求缓存 (body 传入)
  ↓
第三层: TripBook 实例内缓存
  ↓ (toSystemPromptSection)
第四层: System Prompt 注入（告知 AI 不重复查询）
```

### 6.2 Token 优化

- **按需注入知识库**: 只在对话文本包含相关关键词时才注入对应知识库
- **动态数据过期清理**: TTL 过期的数据不注入 System Prompt
- **TripBook 压缩**: `toPanelData()` 只导出面板需要的扁平数据

### 6.3 Agent Loop 保护

- 最大 10 轮工具调用循环，防止无限循环
- 单轮内可并行多个工具调用（由 LLM 决定）

---

## 7. 扩展指南

### 7.1 添加新工具

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
3. (可选) 在 `server.js` 的 `runTool()` 中添加 TripBook 同步逻辑
4. (可选) 在 `getToolResultLabel()` 中添加人类可读标签

### 7.2 添加新知识库

1. 在 `prompts/knowledge/` 创建新文件，导出 Markdown 字符串
2. 在 `prompts/system-prompt.js` 的 `buildSystemPrompt()` 中添加关键词匹配条件注入

### 7.3 添加新 AI 提供商

1. 安装对应 SDK
2. 在 `server.js` 中实现 `handleXxxChat()` 函数（参考现有实现）
3. 在前端 `index.html` 的 provider/model 下拉框中添加选项
