# 实用信息（Practical Information）实现分析

## 概述
在该旅行规划应用中，"实用信息"（实用信息）通过三个层级实现：
1. **后端存储**：TripBook 模型（Layer 1: 动态数据）
2. **前端展示**：行程详情面板（Section 7：行前准备 & 实用信息）
3. **知识缓存**：目的地知识库（prompts/knowledge/dest-*.js）

---

## 1. 后端存储架构：TripBook 模型

### 文件位置
`/models/trip-book.js` （第1-542行）

### 核心数据结构

#### Layer 1: 动态数据（dynamic）
存储在 `this.dynamic` 对象中，包含以下实用信息相关字段：

```javascript
this.dynamic = {
  knowledge: {},           // { "日本": {...}, "日本-东京": {...} }
  weather: {},             // { "tokyo": { city, current, forecast, _meta } }
  exchangeRates: {},       // { "JPY_CNY": { from, to, rate, last_updated, _meta } }
  flightQuotes: [],        // [{ id, route, date, airline, price_usd, price_cny, ... }]
  hotelQuotes: [],         // [{ id, name, city, checkin, checkout, ... }]
  webSearches: [],         // [{ query, summary, fetched_at }]  ⭐ 实用信息存储
};
```

#### Layer 3: 行程数据（itinerary）
在 `this.itinerary` 对象中：

```javascript
this.itinerary = {
  phase: 0,
  phaseLabel: '',
  route: [],
  days: [],
  budgetSummary: null,
  reminders: [],  ⭐ 行前清单/提醒存储
};
```

### 关键方法

| 方法名 | 功能 | 源代码行 |
|--------|------|--------|
| `addKnowledgeRef(key)` | 记录目的地知识引用 | L65-69 |
| `getKnowledgeRefs()` | 获取已缓存的知识 key | L72-74 |
| `setWeather(cityKey, data)` | 保存天气数据 | L77-79 |
| `setExchangeRate(key, data)` | 保存汇率数据 | L82-84 |
| `addWebSearch(entry)` | 记录 web search 结果 | L103-115 |
| `toPanelData()` | 🔑 导出前端面板数据 | L430-506 |
| `toSystemPromptSection()` | 生成 AI 系统提示注入 | L398-420 |

### 实用信息的导出（toPanelData 方法）

**源代码**: `/models/trip-book.js` 第430-506行

关键导出字段：
```javascript
return {
  // ... 基础信息
  reminders: it.reminders || [],                    // 行前清单
  exchangeRates: Object.values(this.dynamic.exchangeRates).map(r => ({
    from: r.from, to: r.to, rate: r.rate, last_updated: r.last_updated,
  })),                                              // 汇率信息
  webSearchSummaries: this.dynamic.webSearches.map(s => ({
    query: s.query, summary: s.summary || '', fetched_at: s.fetched_at,
  })),                                              // 实用信息搜索结果
  specialRequests: (c.specialRequests || []).map(r => ({
    type: r.type, value: r.value, confirmed: r.confirmed,
  })),                                              // 特殊需求
};
```

---

## 2. 工具定义与更新

### 2.1 cache_destination_knowledge 工具

**文件**: `/tools/dest-knowledge.js` (第1-166行)

#### 工具定义 (TOOL_DEF)
```javascript
{
  name: 'cache_destination_knowledge',
  description: '将目的地基础信息保存为知识库缓存...',
  parameters: {
    destination: '国家/国家-城市（如"日本"、"日本-东京"）',
    content: '结构化知识（Markdown格式）'
  }
}
```

#### 执行流程
1. **缓存存储** (L53-58): 
   - 内存 Map: `destCache.set(destination, { content, saved_at })`
   - TTL: 30 天 (CACHE_TTL)

2. **文件持久化** (L83-92):
   - 保存位置: `prompts/knowledge/dest-{destination}.js`
   - 格式: CommonJS 模块
   - 示例: `prompts/knowledge/dest-日本.js`

3. **启动加载** (L95-127):
   - `initCache()` 在服务器启动时调用 (server.js L15)
   - 扫描 `prompts/knowledge/dest-*.js` 加载缓存
   - 支持旧版 JSON 迁移

#### 实例文件内容
**文件**: `/prompts/knowledge/dest-日本.js` (第1-54行)

包含以下实用信息：
- 签证政策
- 货币与支付方式
- 语言信息
- 最佳旅游季节
- 城市间交通
- 入境注意事项
- 实用信息（时差、小费文化、垃圾分类等）

### 2.2 update_trip_info 工具

**文件**: `/tools/update-trip-info.js` (第1-149行)

#### 工具定义 (TOOL_DEF)
```javascript
{
  name: 'update_trip_info',
  parameters: {
    constraints: { /* 用户约束 */ },
    phase: integer,        // 当前规划阶段（1-7）
    itinerary: {
      route: [],
      days: [],
      budgetSummary: {},
      reminders: []  ⭐ 行前准备清单
    }
  }
}
```

#### 核心功能 (L60-146)
- 验证和格式化输入数据
- 确保所有 constraint 字段都有 `confirmed: true` (L92-112)
- 返回验证结果供 server.js 写入 TripBook

---

## 3. 服务端集成（server.js）

### 文件位置
`/server.js` 第350-380行

### 工具结果处理流程

```javascript
// web_search → TripBook 搜索记录（避免重复搜索）
if (funcName === 'web_search' && !parsed.error) {
  const query = funcArgs.query || '';
  const summary = firstResult 
    ? `找到 ${parsed.results.length} 条结果，首条: ${...}`
    : '已搜索';
  tripBook.addWebSearch({ query, summary });
}

// update_trip_info → 写入 TripBook
if (funcName === 'update_trip_info' && parsed.success) {
  const updates = parsed.updates;
  if (updates.constraints) tripBook.updateConstraints(updates.constraints);
  if (updates.phase !== undefined) tripBook.updatePhase(updates.phase);
  if (updates.itinerary) tripBook.updateItinerary(updates.itinerary);
  
  // 推送 SSE 事件到前端
  sendSSE('tripbook_update', {
    ...tripBook.toPanelData(),              // 扁平化面板数据
    _snapshot: tripBook.toJSON()            // 完整结构化数据
  });
}
```

### 关键点
- **SSE 事件**: `tripbook_update` 事件名称 (L376)
- **推送内容**: `toPanelData()` 的完整导出 + `_snapshot`

---

## 4. 前端展示（itinerary.js）

### 文件位置
`/public/js/itinerary.js` (第1-694行)

### 状态管理

**初始化** (L5-26):
```javascript
let itineraryState = {
  reminders: [],
  exchangeRates: [],
  webSearchSummaries: [],
  specialRequests: [],
  // ... 其他字段
};
```

### Section 7：行前准备 & 实用信息渲染

#### 函数: `renderSectionPrepAndInfo()` (L483-576)

**完整渲染逻辑**:

```javascript
// 1. 数据提取
const weatherItems = s.weatherList || (s.weather ? [s.weather] : []);
const visaSearches = s.webSearchSummaries.filter(
  w => /签证|visa|入境|护照|免签/i.test(w.query)
);
const infoSearches = s.webSearchSummaries.filter(
  w => !/签证|visa|入境|护照|免签/i.test(w.query)
);

// 2. 内容区分
// ├─ 天气预报 (L498-509)
// ├─ 签证信息 (L511-521)
// ├─ 汇率 (L523-533)
// ├─ 实用信息 (L535-545)  ⭐ 过滤出非签证类的 web search
// ├─ 特殊需求 (L547-557)
// └─ 行前清单 (L559-570)

// 3. 返回面板区块
return `<section class="panel-section">
  <div class="panel-section-header">📚 行前准备 & 实用信息</div>
  ${content}
</section>`;
```

#### 各子组件详情

| 组件 | 数据源 | 筛选规则 | CSS 类 | 行号 |
|------|--------|---------|--------|------|
| 天气 | `s.weatherList` | 全部 | `.prep-card` | 498-509 |
| 签证 | `s.webSearchSummaries` | `/签证\|visa\|入境\|护照\|免签/` | `.prep-card` | 511-521 |
| 汇率 | `s.exchangeRates` | 全部 | `.rate-card` | 523-533 |
| **实用信息** ⭐ | `s.webSearchSummaries` | **非签证相关** | `.info-card` | 535-545 |
| 特殊需求 | `s.specialRequests` | 全部 | `.prep-card` | 547-557 |
| **行前清单** ⭐ | `s.reminders` | 全部 | `.reminder-list` | 559-570 |

### HTML 结构示例

```html
<!-- 实用信息 Tab -->
<div class="tab-content-section">
  <div class="tab-section-label">🔍 实用信息</div>
  <div class="info-card">
    <div class="info-card-title">${query}</div>
    <div class="info-card-body">${summary}</div>
  </div>
  <!-- 更多 info-card ... -->
</div>

<!-- 行前清单 -->
<div class="tab-content-section">
  <div class="tab-section-label">📝 行前清单</div>
  <ul class="reminder-list">
    <li class="reminder-item">
      <span class="reminder-check" onclick="toggleReminder(this)"></span>
      <span>出发前3天完成Visit Japan Web注册</span>
    </li>
    <!-- 更多 reminder-item ... -->
  </ul>
</div>
```

### 数据更新入口 (L159-215)

```javascript
function updateFromTripBook(data) {
  if (data.reminders) {
    itineraryState.reminders = data.reminders;
  }
  if (data.exchangeRates) {
    itineraryState.exchangeRates = data.exchangeRates;
  }
  if (data.webSearchSummaries) {
    itineraryState.webSearchSummaries = data.webSearchSummaries;
  }
  if (data.specialRequests) {
    itineraryState.specialRequests = data.specialRequests;
  }
  renderPanel();  // 触发重新渲染
}
```

---

## 5. 样式（CSS）

### 文件位置
`/public/css/style.css`

### 样式类定义

| 类名 | 用途 | 行号 | 样式特点 |
|------|------|------|---------|
| `.prep-card` | 行前准备卡片 | 682-704 | 半透明白色背景，蓝色标题 |
| `.info-card` | 实用信息卡片 | 814-831 | 类似 prep-card，用于一般信息 |
| `.rate-card` | 汇率卡片 | 749-767 | 蓝色背景，inline-flex 排列 |
| `.reminder-list` | 行前清单容器 | 707-710 | 列表样式 |
| `.reminder-item` | 清单项目 | 712-723 | 带复选框的 flex 布局 |
| `.reminder-check` | 复选框 | 724-746 | 可交互，支持 hover 和 checked 状态 |

#### 复选框交互 (L724-746)
```css
.reminder-check {
  border: 1.5px solid rgba(59,130,246,.4);
  cursor: pointer;
  transition: all .2s;
}
.reminder-check:hover {
  border-color: #3b82f6;
  background: rgba(59,130,246,.1);
}
.reminder-check.checked {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
  /* 显示 ✓ 符号 */
}
```

#### 复选框交互函数 (itinerary.js L581-584)
```javascript
function toggleReminder(el) {
  el.classList.toggle('checked');
  el.textContent = el.classList.contains('checked') ? '✓' : '';
}
```

---

## 6. 数据流完整链路

### 流程图
```
User Conversation
        ↓
AI calls tools:
├─ web_search → server extracts query + results
├─ cache_destination_knowledge → saves to prompts/knowledge/
└─ update_trip_info → passes itinerary data with reminders
        ↓
server.js (L350-380)
├─ web_search result → tripBook.addWebSearch()
└─ update_trip_info → tripBook.updateItinerary(reminders)
        ↓
tripBook.toPanelData() 
        ↓
SSE 'tripbook_update' event
        ↓
Frontend: updateFromTripBook(data)
├─ itineraryState.reminders = data.reminders
├─ itineraryState.exchangeRates = data.exchangeRates
├─ itineraryState.webSearchSummaries = data.webSearchSummaries
└─ itineraryState.specialRequests = data.specialRequests
        ↓
renderPanel() → renderSectionPrepAndInfo()
        ↓
HTML output with:
├─ Weather cards
├─ Visa info (filtered from web search)
├─ Exchange rates
├─ Practical info ⭐ (filtered from web search)
├─ Special requests
└─ Reminder checklist ⭐ (interactive toggles)
```

---

## 7. 关键文件映射

| 功能 | 文件 | 行号 | 关键代码 |
|------|------|------|---------|
| TripBook 数据模型 | `models/trip-book.js` | 22-58 | constructor |
| 实用信息导出 | `models/trip-book.js` | 430-506 | `toPanelData()` |
| 知识缓存工具 | `tools/dest-knowledge.js` | 19-41 | TOOL_DEF |
| 知识缓存执行 | `tools/dest-knowledge.js` | 43-50 | `execute()` |
| 知识缓存文件 | `prompts/knowledge/dest-*.js` | - | 目的地知识库 |
| 行程更新工具 | `tools/update-trip-info.js` | 16-58 | TOOL_DEF |
| 工具结果同步 | `server.js` | 350-380 | TripBook 写入 + SSE |
| 前端状态管理 | `public/js/itinerary.js` | 5-26 | `itineraryState` |
| 数据更新入口 | `public/js/itinerary.js` | 159-215 | `updateFromTripBook()` |
| 实用信息渲染 | `public/js/itinerary.js` | 483-576 | `renderSectionPrepAndInfo()` |
| CSS 样式 | `public/css/style.css` | 682-831 | 卡片样式定义 |

---

## 8. 核心字段总结

### 实用信息相关的字段

#### 在 TripBook 中存储
```
tripBook.dynamic.webSearches        // [{ query, summary, fetched_at }]
tripBook.dynamic.exchangeRates      // { key: { from, to, rate, ... } }
tripBook.dynamic.weather            // { cityKey: { city, current, ... } }
tripBook.itinerary.reminders        // [string, ...]
tripBook.constraints.specialRequests // [{ type, value, confirmed }, ...]
```

#### 在前端 itineraryState 中
```
itineraryState.webSearchSummaries   // [{ query, summary, fetched_at }, ...]
itineraryState.exchangeRates        // [{ from, to, rate, last_updated }, ...]
itineraryState.weather / weatherList // 单城市或多城市天气
itineraryState.reminders            // [string, ...]
itineraryState.specialRequests      // [{ type, value, confirmed }, ...]
```

#### 在 toPanelData() 中导出
```javascript
{
  reminders: it.reminders,
  exchangeRates: [{ from, to, rate, last_updated }, ...],
  webSearchSummaries: [{ query, summary, fetched_at }, ...],
  specialRequests: [{ type, value, confirmed }, ...],
  weather: {...} or null,
  weatherList: [...] or null
}
```

---

## 9. 调试和测试

### 测试文件
- `/models/trip-book.js` 模型测试: `__tests__/models/trip-book.test.js`
- 前端测试: `__tests__/frontend/itinerary.test.js`

### 查看实时数据
1. 打开浏览器开发者工具
2. SSE Events 中监听 `tripbook_update` 事件
3. 检查 `_snapshot` 字段查看完整 TripBook 数据

### 缓存管理
```javascript
// 获取所有缓存的目的地知识
const allCached = getAllCachedDests();

// 获取单个目的地知识
const japanKnowledge = getCachedDestKnowledge('日本');
```

---

## 10. 实用信息的三大类型

### 1. **Web Search 实用信息** 
- 来源: AI 调用 `web_search` 工具
- 存储: `tripBook.dynamic.webSearches[]`
- 显示: 前端分为两类
  - **签证信息**: 关键词匹配 `/签证|visa|入境|护照|免签/`
  - **其他实用信息**: 非签证相关的搜索结果
- 去重: 按 query 去重，避免重复搜索

### 2. **目的地知识库** (缓存)
- 来源: AI 调用 `cache_destination_knowledge` 工具
- 存储: `prompts/knowledge/dest-{destination}.js`
- 包含: 签证、货币、语言、交通、入境注意、实用信息等
- TTL: 30 天
- 用途: 提供给后续对话的系统提示

### 3. **行前准备清单** (reminders)
- 来源: AI 调用 `update_trip_info` 工具，传入 `itinerary.reminders`
- 存储: `tripBook.itinerary.reminders[]`
- 特点: 可交互的复选框，支持用户勾选
- 示例: "出发前3天完成Visit Japan Web注册"、"兑换3万日元现金"

