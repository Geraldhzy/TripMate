---
name: ai-travel-planner-agent
overview: 开发AI旅游规划助手Web应用（Agent架构）。在上一版计划基础上，新增经过验证的机票搜索工具（fast-flights/Python，抓取Google Flights精确报价），工具链调整为6个工具（web搜索、天气、汇率、POI、机票搜索、酒店搜索）。其余功能不变：对比决策卡片、渐进式规划、来源标注、行程可视化、分享。
design:
  architecture:
    framework: html
  styleKeywords:
    - 深色主题AI工具
    - 玻璃拟态
    - 青绿渐变色调
    - 流式打字动画
    - 工具调用状态可视化
    - 交互式对比决策卡片
    - 卡片式行程展示
    - 现代高端感
  fontSystem:
    fontFamily: Poppins, Noto Sans SC
    heading:
      size: 36px
      weight: 700
    subheading:
      size: 20px
      weight: 600
    body:
      size: 15px
      weight: 400
  colorSystem:
    primary:
      - "#0891B2"
      - "#06B6D4"
      - "#10B981"
      - "#F59E0B"
    background:
      - "#0F172A"
      - "#1E293B"
      - "#F0FDFA"
      - "#FFFFFF"
    text:
      - "#0F172A"
      - "#334155"
      - "#94A3B8"
      - "#FFFFFF"
    functional:
      - "#10B981"
      - "#EF4444"
      - "#F59E0B"
      - "#3B82F6"
todos:
  - id: init-backend
    content: 初始化项目结构，创建 package.json、server.js（Express + Agent 工具循环 + SSE 流式输出含 COMPARE/TRIP_DATA 标记检测 + 分享路由）、.env.example
    status: pending
  - id: build-prompts
    content: 编写 prompts/system-prompt.js（角色定义、渐进式方法论、6工具策略、对比输出规范含Schema和示例、来源标注规则、行程JSON Schema）和 prompts/knowledge/ 下三个知识库文件（从artifact文档转译为JS模块）
    status: pending
    dependencies:
      - init-backend
  - id: build-tools
    content: 编写 tools/ 下 6 个工具模块（web-search/weather/exchange-rate/flight-search/hotel-search）和 index.js 注册中心，使用 [skill:tencentmap-lbs-skill] 实现 poi-search，编写 tools/scripts/ 下 Python 脚本（search_flights.py 用 fast-flights、search_hotels.py 用 playwright）
    status: pending
    dependencies:
      - init-backend
  - id: build-frontend
    content: 创建 public/index.html 主页面骨架（三大视图容器）和 css/style.css 全局样式（聊天气泡、工具状态指示器、对比卡片、行程时间线、深色主题、响应式适配、所有动画关键帧）
    status: pending
    dependencies:
      - init-backend
  - id: chat-compare-settings
    content: 编写 js/app.js 视图路由和模块初始化、js/chat.js 聊天核心模块（SSE 流式收发、工具状态、对比数据事件处理、Markdown+来源链接渲染、行程数据检测）、js/compare-card.js 对比卡片渲染器（并列布局/选择按钮/推荐标识）、js/settings.js 设置模块和 js/utils.js 工具函数
    status: pending
    dependencies:
      - build-frontend
  - id: trip-map-share
    content: 编写 js/trip-renderer.js 行程可视化渲染器（时间线/预算图表/美食住宿/贴士/来源列表/天数切换）、js/map.js 地图模块（Leaflet 景点标记+路线连线）、js/share.js 分享模块，以及 templates/share-template.html 自包含分享页面模板
    status: pending
    dependencies:
      - chat-compare-settings
      - build-tools
  - id: polish
    content: 使用 [skill:多模态内容生成] 生成欢迎区装饰图片，整合所有模块端到端联调，完善欢迎引导区交互、对比卡片选择后状态变化、行程展示细节打磨和跨设备响应式适配
    status: pending
    dependencies:
      - trip-map-share
      - build-prompts
---

## 用户需求

开发一个 AI 旅游规划助手 Web 应用，作为通用旅行规划工具供所有人使用。

## 产品概述

一个基于 AI Agent 架构的对话式旅游规划 Web 应用。用户通过聊天界面描述旅行需求，AI 借助 6 种实时工具（Web搜索、天气、汇率、POI、机票搜索、酒店搜索）获取可靠信息，采用渐进式规划流程（锁定约束、搭建框架、用户确认、逐步细化），在关键决策点通过交互式对比卡片辅助用户选择，最终生成结构化行程并支持分享。

## 核心功能

### 渐进式 AI 对话规划

- 用户用自然语言描述需求，AI 遵循六阶段方法论逐步协作
- 先锁定硬性约束（日期/预算/必去安排），再搭框架，确认后逐步填充
- 每个阶段等用户确认后再推进，而非一次性输出完整行程

### 6 种实时信息工具

- Web搜索：签证政策、景点信息、PADI 官方信息等
- 天气查询：目的地天气预报，辅助行程安排
- 汇率查询：实时汇率，所有价格显示当地货币+人民币
- POI 搜索：餐厅、景点、酒店坐标和评分
- 机票搜索：通过 Google Flights 获取精确报价（价格/航司/时间/经停）
- 酒店搜索：通过 Google Hotels 获取精确报价

### 交互式对比决策卡片

- AI 需要用户选择时输出结构化对比数据，前端渲染为并列卡片
- 支持景点/交通/住宿/路线/餐厅全场景对比
- 卡片可点击选择，也可文字回复
- 推荐选项有特殊视觉标识

### 信息来源标注

- AI 回复中标注来源链接，行程包含来源汇总

### 行程可视化

- 每日时间线、预算图表、地图标记、美食住宿推荐、实用贴士

### 分享功能

- 一键生成独立静态 HTML 分享页面

### 设置面板

- 配置 AI 模型 API Key（OpenAI/Claude），本地存储

## 技术栈

- **前端**：HTML + CSS（Tailwind CSS CDN）+ 原生 JavaScript，无构建依赖
- **后端**：Node.js + Express（Agent 引擎 + API 代理 + 静态服务）
- **AI 接入**：OpenAI API（Function Calling）/ Anthropic Claude API（Tool Use）
- **机票搜索**：Python `fast-flights` 库（已验证，通过抓取 Google Flights 获取精确报价）
- **酒店搜索**：Python Playwright 抓取 Google Hotels
- **Web 搜索**：DuckDuckGo HTML 搜索（后端 fetch）
- **天气**：wttr.in JSON API（免费）
- **汇率**：open.er-api.com（免费）
- **POI**：腾讯地图 WebService API
- **前端地图**：Leaflet + OpenStreetMap
- **图表**：Chart.js CDN
- **Markdown**：marked.js CDN
- **图标**：Font Awesome 6 CDN
- **字体**：Google Fonts — Poppins + Noto Sans SC

## 实现方案

### 整体架构：Node.js Agent 引擎 + Python 工具脚本

后端核心是 Express 服务器，实现 AI Agent 循环。6 个工具中，Web搜索/天气/汇率/POI 由 Node.js 原生实现；机票搜索和酒店搜索通过 `child_process.spawn` 调用 Python 脚本，因为 `fast-flights` 是 Python 库。

### Agent 执行循环

1. 用户消息 + 聊天历史通过 POST /api/chat 发送到后端
2. 后端组装 System Prompt（含方法论 + 按需注入的知识库） + 工具定义 + 消息历史，调用大模型 API
3. 大模型返回文本或 tool_calls
4. 若为 tool_calls：后端执行对应工具函数，将结果追加到消息列表，再次调用大模型
5. 循环直到返回最终文本
6. 全程 SSE 流式传输，工具调用和对比数据通过特殊事件类型推送

### SSE 事件协议

| 事件类型 | 用途 |
| --- | --- |
| `event: token` | AI 文本流式输出 |
| `event: tool_start` | 工具调用开始（前端显示加载状态） |
| `event: tool_result` | 工具调用完成（前端显示结果摘要） |
| `event: compare_data` | 对比卡片数据 |
| `event: trip_data` | 结构化行程数据 |
| `event: done` | 完成 |
| `event: error` | 错误 |


### 对比决策卡片数据流

AI 输出 `[COMPARE_START]...[COMPARE_END]` 标记包裹 JSON。后端在流式输出中用缓冲区检测标记，检测到后解析 JSON 并通过 `event: compare_data` 发送给前端。前端渲染对比卡片，用户点击选择按钮时自动构造消息（如"我选择方案A"）发送回 AI。同理处理 `[TRIP_DATA_START]...[TRIP_DATA_END]` 行程数据标记。

### System Prompt 分层设计

- 第一层：核心角色定义 + 渐进式规划方法论
- 第二层：工具使用策略 + 来源标注规则
- 第三层：对比输出规范（Schema + Few-shot 示例）
- 第四层：结构化行程输出规范（JSON Schema）
- 动态层：根据对话关键词按需注入知识库（"马来西亚"→malaysia.js，"潜水"→diving.js）

### 机票搜索工具实现

Node.js 的 `tools/flight-search.js` 内部通过 `child_process.spawn('python3', ['tools/scripts/search_flights.py', ...args])` 调用 Python 脚本。Python 脚本使用 `fast-flights` 库查询 Google Flights，返回 JSON 格式的航班列表。价格默认为 USD，AI 会自动调用汇率工具转换为 CNY。

### 性能与可靠性

- 工具调用超时：Node.js 工具 10 秒，Python 工具 30 秒（机票搜索较慢）
- 工具结果缓存：同一会话相同参数缓存 5 分钟
- JSON 解析容错：多层 try-catch + 正则提取
- API Key 不持久化到后端，仅在请求头中传输

## 架构设计

```mermaid
graph TB
    subgraph "浏览器前端"
        A[聊天界面] -->|用户输入| B[消息管理器]
        B -->|POST /api/chat| C[API 客户端]
        A -->|切换视图| D[行程可视化页面]
        A -->|设置| E[设置面板]
        C -->|SSE token| F[流式文本渲染]
        C -->|SSE tool_start/result| G[工具状态指示器]
        C -->|SSE compare_data| H[对比卡片渲染器]
        C -->|SSE trip_data| D
        H -->|用户点击选择| B
        D --> I[时间线渲染器]
        D --> J[地图 Leaflet]
        D --> K[预算图表 Chart.js]
    end

    subgraph "Node.js 后端 Agent 引擎"
        L[Express Server] --> M[/api/chat Agent 路由]
        L --> N[/api/share 分享路由]
        L --> O[静态文件服务]
        M --> P{Agent 循环}
        P -->|文本| Q[SSE 流式输出 + 标记检测]
        P -->|tool_calls| R[工具执行器]
        R --> S[web_search]
        R --> T[get_weather]
        R --> U[get_exchange_rate]
        R --> V[search_poi]
        R --> W[search_flights Python]
        R --> X[search_hotels Python]
    end

    subgraph "外部服务"
        Y[OpenAI / Claude API]
        Z[DuckDuckGo]
        AA[wttr.in]
        BB[ExchangeRate API]
        CC[腾讯地图 LBS]
        DD[Google Flights]
        EE[Google Hotels]
    end

    P --> Y
    S --> Z
    T --> AA
    U --> BB
    V --> CC
    W --> DD
    X --> EE
```

## 目录结构

```
project-root/
├── server.js                           # [NEW] Express 后端入口。Agent 路由 /api/chat（SSE + Agent 循环 + 流式标记检测）、/api/share（分享页面生成）、静态文件托管。OpenAI/Anthropic 适配层
├── tools/
│   ├── index.js                        # [NEW] 工具注册中心。导出 6 个工具的 schema 和执行函数映射。统一超时控制、结果缓存
│   ├── web-search.js                   # [NEW] Web 搜索工具。DuckDuckGo 搜索，提取标题/摘要/URL
│   ├── weather.js                      # [NEW] 天气查询。wttr.in JSON API
│   ├── exchange-rate.js                # [NEW] 汇率查询。open.er-api.com
│   ├── poi-search.js                   # [NEW] POI 搜索。腾讯地图 WebService API
│   ├── flight-search.js                # [NEW] 机票搜索。spawn Python 子进程调用 fast-flights，返回航班列表 JSON（价格/航司/时间/经停）
│   ├── hotel-search.js                 # [NEW] 酒店搜索。spawn Python 子进程用 Playwright 抓取 Google Hotels
│   └── scripts/
│       ├── search_flights.py           # [NEW] Python 机票搜索脚本。使用 fast-flights 库查询 Google Flights，接收命令行参数（出发/到达/日期），JSON stdout 输出
│       └── search_hotels.py            # [NEW] Python 酒店搜索脚本。使用 Playwright 抓取 Google Hotels，JSON stdout 输出
├── prompts/
│   ├── system-prompt.js                # [NEW] System Prompt 组装器。角色定义、方法论、工具策略、对比输出规范、来源标注规则、行程 JSON Schema。按需注入知识库
│   └── knowledge/
│       ├── methodology.js              # [NEW] 渐进式规划方法论（从 artifact 文档转译）
│       ├── malaysia.js                 # [NEW] 马来西亚知识库
│       └── diving.js                   # [NEW] 潜水知识库
├── package.json                        # [NEW] 项目配置。dependencies: express, openai, @anthropic-ai/sdk, uuid, marked
├── .env.example                        # [NEW] 环境变量示例。TMAP_KEY, PORT
├── public/
│   ├── index.html                      # [NEW] 前端主页面。三大视图容器（聊天/行程/设置）HTML 骨架
│   ├── css/
│   │   └── style.css                   # [NEW] 全局样式。Tailwind 基础 + 聊天气泡、工具状态、对比卡片、行程时间线、深色主题、动画
│   ├── js/
│   │   ├── app.js                      # [NEW] 前端主入口。视图路由、模块初始化、Toast 通知
│   │   ├── chat.js                     # [NEW] 聊天模块。SSE 连接、流式渲染、工具状态事件、对比卡片事件、行程数据事件、Markdown 渲染、消息历史 localStorage
│   │   ├── compare-card.js             # [NEW] 对比卡片渲染器。并列卡片布局，选择按钮，推荐标识，差异项高亮
│   │   ├── trip-renderer.js            # [NEW] 行程可视化渲染器。每日时间线、各类卡片、预算环形图、美食住宿推荐、贴士、来源列表
│   │   ├── map.js                      # [NEW] 地图模块。Leaflet + OpenStreetMap
│   │   ├── share.js                    # [NEW] 分享模块。调用后端生成分享页、复制链接
│   │   ├── settings.js                 # [NEW] 设置模块。Provider/Key/模型配置
│   │   └── utils.js                    # [NEW] 工具函数。日期/货币格式化、UUID、DOM 辅助、JSON 容错解析
│   └── shares/
│       └── .gitkeep                    # [NEW] 占位
└── templates/
    └── share-template.html             # [NEW] 分享页面模板。自包含行程展示 HTML，内嵌 CDN 资源
```

## 关键代码结构

```javascript
// tools/index.js - 工具 Schema 定义（部分展示）
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_flights",
      description: "搜索指定日期和航线的机票价格。返回航班列表含精确价格(USD)、航司、出发到达时间、飞行时长、经停数。价格为USD需配合get_exchange_rate转换",
      parameters: {
        type: "object",
        properties: {
          from_airport: { type: "string", description: "出发机场IATA代码，如MFM" },
          to_airport: { type: "string", description: "到达机场IATA代码，如TWU" },
          date: { type: "string", description: "出发日期，格式YYYY-MM-DD" },
          max_results: { type: "number", description: "返回结果数量，默认5" }
        },
        required: ["from_airport", "to_airport", "date"]
      }
    }
  },
  // ... web_search, get_weather, get_exchange_rate, search_poi, search_hotels
];

// 对比卡片通用 Schema
const CompareSchema = {
  type: "comparison",
  title: "string",
  description: "string",
  dimensions: ["string"],
  options: [{
    id: "string",
    name: "string",
    recommended: "boolean",
    tag: "string",
    values: { "dimension": "value" },
    pros: ["string"],
    cons: ["string"],
    source: "string"
  }]
};
```

## 设计概述

采用现代深色主题 AI 工具界面风格，融合旅行元素。聊天界面深色背景营造沉浸式对话体验，行程可视化切换为热带渐变色调和玻璃拟态卡片。工具调用过程和对比决策全程可视化，增强信任感和参与感。

## 页面规划

本应用为单页应用（SPA），包含三大视图。

### 视图一：聊天界面（主视图）

- **顶部导航栏**：固定顶部，深色玻璃拟态背景（rgba(15,23,42,0.85) + backdrop-blur-xl），左侧地球飞机组合 SVG 图标 + 应用名称"AI Travel Planner"，中部三个导航标签（对话/行程/设置）选中态带底部青绿渐变滑块动画，右侧当前模型名称 + 连接状态圆点（绿色已连/红色未设置）
- **欢迎引导区**：首次打开居中显示，大号渐变色地球图标（CSS 径向渐变），主标题"你好，我是你的 AI 旅行规划师"使用青绿渐变文字，副标题"告诉我你的旅行梦想，我来帮你实现"，三张快捷提问卡片半透明深色背景+悬浮时边框发光效果，点击直接发送对应消息
- **聊天消息区**：深色背景(#0F172A)，最大宽度 840px 居中。AI 消息靠左，头像青绿渐变圆形，气泡半透明深灰(rgba(30,41,59,0.8))带左侧 3px 青绿渐变边框。用户消息靠右，气泡主题色渐变(#0891B2 到 #06B6D4)白色文字。来源链接渲染为小号可点击标签。消息入场淡入上移
- **工具调用状态指示器**：消息流中插入的半透明卡片，左侧旋转加载 SVG 图标 + 描述文字（如"正在搜索澳门飞斗湖机票..."），完成后图标变绿色对勾，展示结果摘要（如"找到 77 个航班，最低 $164"）
- **对比决策卡片**：嵌入消息流中，2-3 列并列卡片布局（深色半透明背景 + rgba 细边框），每列顶部选项名称（大字），中间对比维度列表（差异项自动高亮为橙色），底部"选择此方案"渐变按钮。推荐选项加青绿渐变边框 + 右上角"推荐"角标徽章。超过 3 选项横向滚动。悬浮微放大 + 边框发光
- **输入区域**：底部固定深色面板，圆角输入框深灰背景聚焦时青绿微光边框，右侧渐变圆形发送按钮（禁用态灰色），支持多行自动扩展（最大 4 行），Enter 发送 Shift+Enter 换行

### 视图二：行程可视化页面

- **行程头部横幅**：全宽渐变背景(#0891B2 到 #10B981 斜向)叠加半透明几何图案，居中目的地大标题、日期范围标签、人数和总预算徽章，底部"返回对话"透明边框按钮 + "分享行程"实色渐变按钮
- **天数 Tab 栏**：吸顶深色背景横向滚动，每天圆角标签"Day X · 城市名"，未选中透明边框，选中渐变填充(#0891B2 到 #06B6D4)
- **每日时间线**：浅色背景区域，左侧 3px 渐变竖线（青绿到翠绿），右侧活动卡片交替排列。景点卡片顶部青绿类型标签、餐饮橙色标签、交通蓝色标签。每卡片含时间徽章、标题、描述、费用标签、来源链接。圆角 12px 浅阴影，悬浮微放大
- **地图区域**：圆角带阴影容器，Leaflet 地图展示当天景点标记（自定义彩色图标）和路线连线
- **预算概览**：左侧 Chart.js 环形图渐变色段，右侧分类卡片列表每类带对应色彩进度条
- **美食住宿推荐**：双栏响应式网格，卡片带 Unsplash 图片渐变遮罩叠加文字
- **实用贴士**：手风琴列表各分类带彩色图标
- **参考来源**：底部来源汇总列表

### 视图三：设置面板

- **API 配置卡片**：深色背景卡片，顶部 Provider 选择按钮组（OpenAI/Anthropic 切换），API Key 密码输入框带眼睛图标，模型下拉选择，"验证连接"按钮
- **使用说明**：步骤卡片（1.输入Key 2.开始对话 3.获取行程 4.分享）

## 交互与动画

- 聊天流式输出带光标闪烁 CSS animation
- 工具调用状态旋转加载 + 脉冲背景
- 对比卡片入场交错淡入，悬浮微放大 + 边框发光
- 选择按钮点击后选中项高亮其他变淡
- 视图切换水平滑动 CSS transform
- 行程卡片滚动入场 Intersection Observer 交错淡入
- 导航标签底部滑块跟随动画

## 响应式设计

- 桌面端(大于1024px)：对比卡片并列 2-3 列，行程双栏布局
- 平板端(768-1024px)：对比卡片 2 列，行程单栏
- 移动端(小于768px)：对比卡片纵向堆叠或横向滚动，汉堡菜单导航

## Agent Extensions

### Skill

- **tencentmap-lbs-skill**
- 用途：为 POI 搜索工具（tools/poi-search.js）提供腾讯地图 WebService API 集成，实现景点、餐厅、酒店等地点搜索，获取名称、地址、坐标、评分数据
- 预期结果：获取腾讯地图 API Key 配置方式和 API 调用文档，在 poi-search.js 中实现地点关键词搜索和周边搜索功能，返回结构化 POI JSON 数据

- **多模态内容生成**
- 用途：生成聊天界面欢迎区域使用的旅行主题装饰图片
- 预期结果：生成一张深色调现代风格旅行主题图片（地球/飞机/热带元素），用于首页欢迎区背景装饰