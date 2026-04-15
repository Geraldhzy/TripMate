# 实用信息（Practical Info）在旅行规划器中的完整数据流

## 目录
1. [概述](#概述)
2. [数据结构](#数据结构)
3. [前端组件](#前端组件)
4. [后端模型](#后端模型)
5. [工具实现](#工具实现)
6. [API端点](#api端点)
7. [数据流图](#数据流图)
8. [完整使用示例](#完整使用示例)

---

## 概述

"实用信息"（实用信息）在应用中指的是为旅客提供的**非行程安排类的参考信息**，包括：
- 🌤️ **天气预报** — 各目的地城市实时/预报天气
- 🛂 **签证信息** — 从web搜索获取的目的地签证政策
- 💱 **汇率** — 目的地货币与人民币的实时兑换率
- 🔍 **目的地知识** — 结构化的目的地百科信息（签证、货币、语言、交通等）
- 📝 **行前清单/提醒** — 出发前需完成的任务（参加Japan Web注册、兑换现金等）
- ⚠️ **特殊需求** — 用户特定需求备注（如清真饮食、轮椅无障碍等）

这些信息在前端面板的**"📚 行前准备 & 实用信息"** 区块统一展示。

---

## 数据结构

### TripBook 层级关系

```
TripBook {
  ├─ dynamic (Layer 1: 动态数据，带TTL)
  │  ├─ knowledge {
  │  │  "日本": { added_at: timestamp },
  │  │  "日本-东京": { added_at: timestamp },
  │  │  ...
  │  │}
  │  ├─ weather {
  │  │  "tokyo": {
  │  │    city: "东京",
  │  │    current: { temp_c: 20, description: "晴" },
  │  │    forecast: [{ date, min_temp_c, max_temp_c, description }],
  │  │    _meta: { fetched_at: timestamp, ttl: 3600000 }
  │  │  },
  │  │  ...
  │  │}
  │  ├─ exchangeRates {
  │  │  "JPY_CNY": {
  │  │    from: "JPY", to: "CNY", rate: 0.043,
  │  │    last_updated: "2026-04-13 10:30",
  │  │    _meta: { fetched_at: timestamp, ttl: 14400000 }
  │  │  },
  │  │  ...
  │  │}
  │  ├─ webSearches [
  │  │  { query: "日本签证要求", summary: "...", fetched_at: timestamp },
  │  │  { query: "东京美食推荐", summary: "...", fetched_at: timestamp },
  │  │  ...
  │  │]
  │  └─ flightQuotes, hotelQuotes, ...
  │
  ├─ constraints (Layer 2: 用户约束)
  │  ├─ destination: { value: "日本", cities: ["东京","京都"], confirmed: true }
  │  ├─ departCity: { value: "北京", airports: ["PEK"], confirmed: true }
  │  ├─ specialRequests: [
  │  │  { type: "dietary", value: "清真", confirmed: true },
  │  │  { type: "accessibility", value: "轮椅无障碍", confirmed: true }
  │  │]
  │  └─ ...
  │
  └─ itinerary (Layer 3: 结构化行程)
     ├─ route: ["东京", "京都", "大阪"]
     ├─ days: [{ day, date, city, title, segments[] }]
     ├─ budgetSummary: { flights, hotels, meals, total_cny, ... }
     └─ reminders: [
        "出发前3天完成Visit Japan Web注册",
        "兑换3万日元现金（估¥1290）",
        "购买旅行保险（推荐美亚保险¥188起）"
     ]
}
```

### 前端状态结构（itinerary.js）

```javascript
let itineraryState = {
  // 基本信息
  destination: "日本（东京·京都·大阪）",
  departCity: "北京",
  dates: "2026-05-01 ~ 2026-05-07",
  days: 7,
  people: 2,
  budget: "¥28000（2人，含机票住宿）",
  preferences: ["美食","文化"],
  
  // 行程
  route: ["东京", "京都", "大阪"],
  daysPlan: [
    {
      day: 1,
      date: "2026-05-01",
      city: "东京",
      title: "抵达成田",
      segments: [
        {
          time: "14:00",
          title: "抵达成田机场",
          type: "flight",
          location: "成田机场",
          notes: "航班NH878"
        },
        ...
      ]
    },
    ...
  ],
  
  // === 实用信息区块 ===
  
  // 天气预报
  weather: { city: "东京", temp_c: 20, description: "晴" },
  weatherList: [
    { city: "东京", temp_c: 20, description: "晴" },
    { city: "京都", temp_c: 18, description: "多云" },
    { city: "大阪", temp_c: 22, description: "晴" }
  ],
  
  // web搜索结果（签证+其他实用信息）
  webSearchSummaries: [
    {
      query: "日本中国护照签证要求2026",
      summary: "单次旅游签证...",
      fetched_at: timestamp
    },
    {
      query: "日本JR Pass使用指南",
      summary: "JR Pass是...",
      fetched_at: timestamp
    }
  ],
  
  // 汇率
  exchangeRates: [
    {
      from: "JPY",
      to: "CNY",
      rate: 0.043,
      last_updated: "2026-04-13 10:30"
    }
  ],
  
  // 行前清单
  reminders: [
    "出发前3天完成Visit Japan Web注册",
    "兑换3万日元现金",
    "购买旅行保险"
  ],
  
  // 特殊需求
  specialRequests: [
    { type: "dietary", value: "清真", confirmed: true },
    { type: "accessibility", value: "无障碍", confirmed: true }
  ],
  
  // 其他
  flights: [],
  hotels: [],
  budgetSummary: {}
};
```

---

## 前端组件

### 文件位置
**`/public/js/itinerary.js`** (824 行)

### 核心函数

#### 1. 更新函数

**`updateFromTripBook(data)` — 第159行**
```javascript
function updateFromTripBook(data) {
  // 从 SSE tripbook_update 事件接收后端数据
  if (data.destination) itineraryState.destination = data.destination;
  if (data.reminders) itineraryState.reminders = data.reminders;
  if (data.exchangeRates) itineraryState.exchangeRates = data.exchangeRates;
  if (data.webSearchSummaries) itineraryState.webSearchSummaries = data.webSearchSummaries;
  if (data.specialRequests) itineraryState.specialRequests = data.specialRequests;
  if (data.weatherList) itineraryState.weatherList = data.weatherList;
  
  renderPanel();  // 触发重新渲染
}
```

#### 2. 渲染函数 — "📚 行前准备 & 实用信息" 区块

**`renderSectionPrepAndInfo()` — 第484行**

该函数负责渲染整个"实用信息"面板区块，包含以下子部分：

**子区块1：天气预报** (第498行)
```javascript
// 🌤️ 天气预报
if (weatherItems.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">🌤️ 天气预报</div>';
  for (const w of weatherItems) {
    const desc = w.description ? translateWeather(w.description) : '';
    const cityName = translateCity(w.city);
    content += `<div class="prep-card">
      <div class="prep-card-title">📍 ${escItinHtml(cityName)}</div>
      <div class="prep-card-body">${w.temp_c}°C${desc ? '，' + escItinHtml(desc) : ''}</div>
    </div>`;
  }
  content += '</div>';
}
```

**子区块2：签证信息** (第512行)
```javascript
// 🛂 签证信息（从 webSearchSummaries 中筛选签证相关）
const visaSearches = s.webSearchSummaries.filter(
  w => /签证|visa|入境|护照|免签/i.test(w.query)
);
if (visaSearches.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">🛂 签证信息</div>';
  for (const v of visaSearches) {
    content += `<div class="prep-card">
      <div class="prep-card-title">${escItinHtml(v.query)}</div>
      <div class="prep-card-body">${escItinHtml(v.summary)}</div>
    </div>`;
  }
  content += '</div>';
}
```

**子区块3：汇率** (第524行)
```javascript
// 💱 汇率
if (s.exchangeRates.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">💱 汇率</div>';
  for (const r of s.exchangeRates) {
    content += `<div class="rate-card">
      1 ${escItinHtml(r.from)} = ${r.rate} ${escItinHtml(r.to)}
      <small>${r.last_updated ? escItinHtml(r.last_updated) : ''}</small>
    </div>`;
  }
  content += '</div>';
}
```

**子区块4：实用信息** (第536行)
```javascript
// 🔍 实用信息（非签证类的 web 搜索）
const infoSearches = s.webSearchSummaries.filter(
  w => !/签证|visa|入境|护照|免签/i.test(w.query)
);
if (infoSearches.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">🔍 实用信息</div>';
  for (const info of infoSearches) {
    content += `<div class="info-card">
      <div class="info-card-title">${escItinHtml(info.query)}</div>
      <div class="info-card-body">${escItinHtml(info.summary)}</div>
    </div>`;
  }
  content += '</div>';
}
```

**子区块5：特殊需求** (第548行)
```javascript
// ⚠️ 特殊需求
if (s.specialRequests.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">⚠️ 特殊需求</div>';
  for (const req of s.specialRequests) {
    content += `<div class="prep-card">
      <div class="prep-card-title">${escItinHtml(req.type || '需求')}</div>
      <div class="prep-card-body">${escItinHtml(req.value)}</div>
    </div>`;
  }
  content += '</div>';
}
```

**子区块6：行前清单/提醒** (第560行)
```javascript
// 📝 行前清单 / 提醒（可点击勾选）
if (s.reminders.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">📝 行前清单</div>';
  content += '<ul class="reminder-list">';
  for (let i = 0; i < s.reminders.length; i++) {
    content += `<li class="reminder-item">
      <span class="reminder-check" onclick="toggleReminder(this)"></span>
      <span>${escItinHtml(s.reminders[i])}</span>
    </li>`;
  }
  content += '</ul></div>';
}
```

### SSE 事件处理（chat.js）

**文件：`/public/js/chat.js`** 第303行
```javascript
case 'tripbook_update': {
  // 后端通过 SSE 推送更新时的处理
  const snapshot = data._snapshot;  // 完整结构化数据
  if (snapshot) {
    sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot));
  }
  // 提取面板用数据（去掉内部 _snapshot）
  const panelData = { ...data };
  delete panelData._snapshot;
  
  // 调用 itinerary.js 的更新函数
  if (typeof updateFromTripBook === 'function') {
    updateFromTripBook(panelData);
  }
  
  // 同时保存到 sessionStorage 供刷新恢复
  try {
    sessionStorage.setItem('tp_tripbook', JSON.stringify(panelData));
  } catch {}
  break;
}
```

### 工具函数

- **`translateWeather(desc)` 第52行** — 英文天气描述转中文
- **`translateCity(name)` 第79行** — 城市英文转中文映射
- **`escItinHtml(str)` 第816行** — HTML 转义，防止 XSS

---

## 后端模型

### TripBook 类

**文件：`/models/trip-book.js`** (542 行)

#### Layer 1: 动态数据 — 实用信息存储

**初始化** (第28行)
```javascript
this.dynamic = {
  knowledge: {},        // { "日本": { added_at }, "日本-东京": { added_at } }
  weather: {},          // { "tokyo": { city, current, forecast, _meta } }
  exchangeRates: {},    // { "JPY_CNY": { from, to, rate, last_updated, _meta } }
  flightQuotes: [],
  hotelQuotes: [],
  webSearches: [],      // [{ query, summary, fetched_at }]
};
```

#### 关键方法

**知识引用管理** (第64-74行)
```javascript
/** 记录目的地知识引用（存入 dynamic.knowledge） */
addKnowledgeRef(key) {
  if (key && !this.dynamic.knowledge[key]) {
    this.dynamic.knowledge[key] = { added_at: Date.now() };
  }
}

getKnowledgeRefs() {
  return Object.keys(this.dynamic.knowledge);
}
```

**天气同步** (第76-79行)
```javascript
setWeather(cityKey, data) {
  this.dynamic.weather[cityKey.toLowerCase()] = data;
}
```

**汇率同步** (第81-84行)
```javascript
setExchangeRate(key, data) {
  this.dynamic.exchangeRates[key] = data;
}
```

**Web搜索去重记录** (第102-115行)
```javascript
addWebSearch(entry) {
  const key = (entry.query || '').toLowerCase().trim();
  if (!key) return;
  // 按 query 去重，覆盖旧结果
  const idx = this.dynamic.webSearches.findIndex(
    s => (s.query || '').toLowerCase().trim() === key
  );
  const record = { ...entry, fetched_at: Date.now() };
  if (idx >= 0) {
    this.dynamic.webSearches[idx] = record;  // 更新已有
  } else {
    this.dynamic.webSearches.push(record);   // 新增
  }
}
```

#### Layer 3: 行程数据 — 提醒和需求

**更新行程** (第198-238行)
```javascript
updateItinerary(delta) {
  if (!delta) return;
  
  // ... 路由、每日行程等处理 ...
  
  // ✅ 行前清单 / 提醒（追加模式，去重）
  if (Array.isArray(delta.reminders)) {
    const existing = new Set(this.itinerary.reminders);
    delta.reminders.forEach(r => existing.add(r));
    this.itinerary.reminders = Array.from(existing);
  }
}
```

**特殊需求** (第45行定义，第165-177行更新)
```javascript
// 在 updateConstraints 中
if (Array.isArray(delta.specialRequests)) {
  for (const req of delta.specialRequests) {
    const existing = this.constraints.specialRequests.find(
      r => r.type === req.type && r.value === req.value
    );
    if (existing) {
      existing.confirmed = req.confirmed;
    } else {
      this.constraints.specialRequests.push(req);
    }
  }
}
```

#### 面板数据导出

**`toPanelData()` 方法** (第430-506行)

该方法将 TripBook 的所有数据转换为前端 itinerary.js 需要的格式：

```javascript
toPanelData() {
  // ... 基本信息处理 ...
  
  return {
    destination: destStr,
    departCity: c.departCity?.value || '',
    dates: c.dates ? (c.dates.start ? `${c.dates.start} ~ ${c.dates.end}` : '') : '',
    days: c.dates?.days || 0,
    people: c.people?.count || 0,
    budget: c.budget?.value || '',
    preferences: c.preferences?.tags || [],
    
    // ... flights, hotels, route, daysPlan ...
    
    // === 实用信息字段 ===
    
    // 天气（单城市向后兼容，多城市用 weatherList）
    weather: weatherList.length === 1 ? weatherList[0] : null,
    weatherList: weatherList.length > 0 ? weatherList : null,
    
    // 汇率
    exchangeRates: Object.values(this.dynamic.exchangeRates).map(r => ({
      from: r.from,
      to: r.to,
      rate: r.rate,
      last_updated: r.last_updated,
    })),
    
    // Web 搜索摘要（被前端分为"签证信息"和"实用信息"两个子区块）
    webSearchSummaries: this.dynamic.webSearches.map(s => ({
      query: s.query,
      summary: s.summary || '',
      fetched_at: s.fetched_at,
    })),
    
    // 行前清单
    reminders: it.reminders || [],
    
    // 特殊需求
    specialRequests: (c.specialRequests || []).map(r => ({
      type: r.type,
      value: r.value,
      confirmed: r.confirmed,
    })),
  };
}
```

---

## 工具实现

### 1. 目的地知识缓存工具

**文件：`/tools/dest-knowledge.js`** (166 行)

#### 工具定义

```javascript
const TOOL_DEF = {
  name: 'cache_destination_knowledge',
  description: '将目的地基础信息保存为知识库缓存...',
  parameters: {
    properties: {
      destination: {
        type: 'string',
        description: '目的地名称（国家级如"日本"，城市级如"日本-东京"）'
      },
      content: {
        type: 'string',
        description: 'Markdown格式结构化知识（签证、货币、语言、时区等全国通用或城市特有信息）'
      }
    },
    required: ['destination', 'content']
  }
};
```

#### 执行函数

```javascript
async function execute({ destination, content }) {
  if (!destination || !content) {
    return JSON.stringify({ error: '缺少必要参数' });
  }
  // 1. 写入内存缓存
  destCache.set(destination, { content, saved_at: Date.now() });
  
  // 2. 持久化到文件（JS 格式）
  saveOneToFile(destination, content, Date.now());
  
  return JSON.stringify({
    success: true,
    destination,
    message: `已缓存"${destination}"目的地知识库，后续对话将直接复用`
  });
}
```

#### 缓存初始化

**启动时加载** (第162-165行)
```javascript
function initCache() {
  migrateLegacyCache();    // 从旧 JSON 文件迁移
  loadFromFiles();          // 从 prompts/knowledge/dest-*.js 加载
}
```

#### 文件存储

**存储位置：** `/prompts/knowledge/dest-{destination}.js`

**格式示例** — `/prompts/knowledge/dest-日本.js`：
```javascript
/** 目的地知识库：日本（自动生成，可人工编辑） */
module.exports = {
  destination: '日本',
  saved_at: 1775815481672,
  content: `# 日本旅游知识库

## 签证政策（中国护照）
- 签证类型：需提前申请日本旅游签证
- 办理时间：建议出发前1-2个月
- ...

## 货币与支付
- 官方货币：日元（JPY）
- 汇率参考：1 CNY ≈ 23.24 JPY
- ...

## 语言
- 官方语言：日语
- ...

## 最佳旅游季节
- 春季（3月-5月）：樱花季
- ...

## 入境注意事项
1. 入境卡...
2. 海关申报...
...

## 实用信息
- 时差...
- 饮用水...
...`
};
```

#### 查询接口

```javascript
/** 获取指定目的地缓存 */
function getCachedDestKnowledge(destination) {
  const entry = destCache.get(destination);
  if (!entry) return null;
  if (Date.now() - entry.saved_at > CACHE_TTL) {
    destCache.delete(destination);
    return null;
  }
  return entry;
}

/** 获取所有未过期的目的地缓存 */
function getAllCachedDests() {
  const now = Date.now();
  const result = [];
  for (const [dest, entry] of destCache) {
    if (now - entry.saved_at <= CACHE_TTL) {
      result.push({ destination: dest, ...entry });
    } else {
      destCache.delete(dest);
    }
  }
  return result;
}
```

### 2. 更新行程信息工具

**文件：`/tools/update-trip-info.js`** (149 行)

用于 AI 推送约束、行程、提醒等数据到 TripBook。

#### 提醒和特殊需求字段

```javascript
parameters: {
  type: 'object',
  properties: {
    itinerary: {
      type: 'object',
      description: [
        '行程数据增量更新...',
        'reminders: ["出发前完成Visit Japan Web注册", "兑换3万日元现金", "购买旅行保险"] — 行前准备清单，在最终阶段必须写入'
      ].join('')
    },
    constraints: {
      type: 'object',
      description: [
        '...',
        'specialRequests: [{ type: "dietary", value: "清真", confirmed: true }]'
      ].join('')
    }
  }
}
```

#### 执行逻辑

```javascript
async function execute(args) {
  const { constraints, phase, itinerary } = args || {};
  
  if (!constraints && phase === undefined && !itinerary) {
    return JSON.stringify({ error: '至少需要传入一个字段' });
  }
  
  const updates = {};
  const messages = [];
  
  // 确保所有约束字段都标记为 confirmed
  if (constraints) {
    const constraintFields = ['destination', 'departCity', 'dates', 'people', 'budget', 'preferences', 'specialRequests'];
    for (const field of constraintFields) {
      if (constraints[field] !== undefined) {
        if (Array.isArray(constraints[field])) {
          constraints[field] = constraints[field].map(item => ({
            ...item,
            confirmed: item.confirmed !== false ? true : false
          }));
        } else if (typeof constraints[field] === 'object') {
          constraints[field].confirmed = constraints[field].confirmed !== false ? true : false;
        }
      }
    }
    updates.constraints = constraints;
  }
  
  if (itinerary) {
    updates.itinerary = itinerary;  // 包含 reminders
  }
  
  return JSON.stringify({
    success: true,
    updates,
    message: messages.join('；')
  });
}
```

### 3. 其他相关工具

**天气工具** (`/tools/weather.js`)
- 获取目的地城市的当前和预报天气
- 结果由 `server.js` 同步到 TripBook.setWeather()

**汇率工具** (`/tools/exchange-rate.js`)
- 获取货币对的实时汇率
- 结果由 `server.js` 同步到 TripBook.setExchangeRate()

**Web搜索工具** (`/tools/web-search.js`)
- 搜索签证、实用信息等
- 结果由 `server.js` 同步到 TripBook.addWebSearch()

---

## API 端点

### POST /api/chat

**文件：** `/server.js` 第116行

SSE 流式端点，处理对话并推送事件。

#### 请求

```json
{
  "messages": [{ "role": "user", "content": "..." }],
  "provider": "openai" | "anthropic" | "deepseek",
  "model": "gpt-4",
  "tripBookSnapshot": { 
    "constraints": {...},
    "itinerary": {...},
    "dynamic": {...}
  }
}
```

#### 响应事件

**事件1：`tripbook_update`** (第376行)
```javascript
sendSSE('tripbook_update', {
  ...tripBook.toPanelData(),           // 面板用数据
  _snapshot: tripBook.toJSON()         // 完整快照用于服务端恢复
});
```

数据包含：
- `destination`, `departCity`, `dates`, `days`, `people`, `budget`, `preferences`
- `route`, `daysPlan`, `flights`, `hotels`
- **`reminders`** — 行前清单
- **`exchangeRates`** — 汇率列表
- **`webSearchSummaries`** — Web搜索摘要
- **`weatherList`** — 天气列表
- **`specialRequests`** — 特殊需求
- `_snapshot` — 完整结构化数据

**事件2：`weather_cached`** (第313行)
```javascript
sendSSE('weather_cached', {
  city: "东京",
  current: { temp_c: 20, description: "晴" },
  forecast: [...],
  fetched_at: timestamp
});
```

**事件3：`rate_cached`** (第303行)
```javascript
sendSSE('rate_cached', {
  from: "JPY",
  to: "CNY",
  rate: 0.043,
  last_updated: "2026-04-13 10:30",
  fetched_at: timestamp
});
```

**事件4：`tool_result`** (第291行)
```javascript
sendSSE('tool_result', {
  id: toolId,
  name: "cache_destination_knowledge",
  resultLabel: "已缓存「日本」知识库"  // 人类可读的工具结果标签
});
```

#### 工具结果同步逻辑

当 AI 调用工具时，`server.js` 的 `runTool()` 函数（第256行）负责：

1. **缓存知识** (第348行)
```javascript
if (funcName === 'cache_destination_knowledge' && parsed.destination) {
  tripBook.addKnowledgeRef(parsed.destination);
}
```

2. **缓存天气** (第312行)
```javascript
if (funcName === 'get_weather' && !parsed.error) {
  sendSSE('weather_cached', parsed);
  tripBook.setWeather(parsed.city || '', {
    city: parsed.city, current: parsed.current, forecast: parsed.forecast,
    _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 3 * 3600000 }
  });
}
```

3. **缓存汇率** (第302行)
```javascript
if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
  sendSSE('rate_cached', parsed);
  tripBook.setExchangeRate(`${parsed.from}_${parsed.to}`, {
    from: parsed.from, to: parsed.to, rate: parsed.rate,
    last_updated: parsed.last_updated,
    _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 4 * 3600000 }
  });
}
```

4. **记录 Web 搜索** (第352行)
```javascript
if (funcName === 'web_search' && !parsed.error) {
  const query = funcArgs.query || parsed.query || '';
  const firstResult = Array.isArray(parsed.results) && parsed.results[0];
  const summary = firstResult
    ? `找到 ${parsed.results.length} 条结果，首条: ${(firstResult.title || '').slice(0, 60)}`
    : '已搜索';
  tripBook.addWebSearch({ query, summary });
}
```

5. **更新 TripBook（最重要）** (第363-380行)
```javascript
if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
  const updates = parsed.updates;
  
  // 写入约束（包含 specialRequests）
  if (updates.constraints) {
    tripBook.updateConstraints(updates.constraints);
  }
  
  // 更新阶段
  if (updates.phase !== undefined) {
    tripBook.updatePhase(updates.phase);
  }
  
  // 更新行程（包含 reminders）
  if (updates.itinerary) {
    tripBook.updateItinerary(updates.itinerary);
  }
  
  // ✅ 推送 tripbook_update 事件到前端
  sendSSE('tripbook_update', {
    ...tripBook.toPanelData(),
    _snapshot: tripBook.toJSON()
  });
}
```

---

## 数据流图

```
┌─ 前端用户交互 ──────────────────────────────────────────────┐
│                                                              │
│  用户输入: "去日本5天，要清真餐，要无障碍..."                │
│                                                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
         ┌────────────────────────────┐
         │   /api/chat (POST)         │
         │   + tripBookSnapshot       │
         │   + messages               │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────────────────┐
         │  server.js — runTool() 执行各类工具   │
         │                                        │
         │  ┌──────────────────────────────────┐  │
         │  │ AI 调用工具：                    │  │
         │  │ • web_search("日本签证")        │  │
         │  │ • get_weather("东京")           │  │
         │  │ • get_exchange_rate("JPY","CNY")│  │
         │  │ • cache_destination_knowledge   │  │
         │  │ • update_trip_info              │  │
         │  └──────────────────────────────────┘  │
         │                                        │
         │  ▼                                     │
         │  工具结果同步到 TripBook:             │
         │  • tripBook.addWebSearch()           │
         │  • tripBook.setWeather()             │
         │  • tripBook.setExchangeRate()        │
         │  • tripBook.addKnowledgeRef()        │
         │  • tripBook.updateItinerary()        │
         │    (包含 reminders)                  │
         │  • tripBook.updateConstraints()      │
         │    (包含 specialRequests)            │
         │                                        │
         │  ▼                                     │
         │  生成 tripbook_update 事件            │
         │  data = tripBook.toPanelData()        │
         │                                        │
         │  包含：                                │
         │  • reminders: [...]                 │
         │  • exchangeRates: [...]             │
         │  • webSearchSummaries: [...]        │
         │  • weatherList: [...]               │
         │  • specialRequests: [...]           │
         │  • _snapshot: {...}                 │
         └────────────┬───────────────┘
                      │
                      ▼ SSE 事件流
         ┌─────────────────────────────┐
         │  浏览器接收 tripbook_update  │
         │  event (chat.js)            │
         │                             │
         │  sessionStorage.setItem(    │
         │    'tp_tripbook_snapshot'   │  ← 持久化完整快照
         │  )                          │
         │                             │
         │  updateFromTripBook(        │
         │    panelData                │  ← 提取面板用数据
         │  )                          │
         └────────────┬────────────────┘
                      │
                      ▼
         ┌─────────────────────────────┐
         │  itinerary.js 处理          │
         │                             │
         │  updateFromTripBook() {     │
         │    itineraryState.reminders │
         │      = data.reminders       │
         │    itineraryState           │
         │      .exchangeRates         │
         │      = data.exchangeRates   │
         │    itineraryState           │
         │      .webSearchSummaries    │
         │      = data.webSearchSummaries
         │    itineraryState.weatherList
         │      = data.weatherList     │
         │    itineraryState           │
         │      .specialRequests       │
         │      = data.specialRequests │
         │    renderPanel()            │
         │  }                          │
         └────────────┬────────────────┘
                      │
                      ▼
         ┌─────────────────────────────┐
         │  renderPanel()              │
         │  renderSectionPrepAndInfo() │
         │                             │
         │  生成 HTML：                │
         │  • 🌤️ 天气预报             │
         │  • 🛂 签证信息             │
         │  • 💱 汇率                 │
         │  • 🔍 实用信息             │
         │  • ⚠️ 特殊需求             │
         │  • 📝 行前清单             │
         └────────────┬────────────────┘
                      │
                      ▼
         ┌─────────────────────────────┐
         │  前端面板显示               │
         │  "📚 行前准备 & 实用信息"   │
         └─────────────────────────────┘
```

---

## 完整使用示例

### 场景：用户规划日本5天行程

#### 第1步：用户输入
```
我想去日本玩5天，下个月5号出发。人数2人。
特殊要求：我老婆吃清真，需要无障碍设施。
预算在2.5万以内。
```

#### 第2步：后端处理链路

1. **AI 调用 `update_trip_info` 确认约束**
```javascript
// AI 调用
update_trip_info({
  constraints: {
    destination: { value: "日本", confirmed: true },
    dates: { start: "2026-05-01", end: "2026-05-05", days: 5, confirmed: true },
    people: { count: 2, confirmed: true },
    budget: { value: "25000", per_person: false, currency: "CNY", confirmed: true },
    specialRequests: [
      { type: "dietary", value: "清真", confirmed: true },
      { type: "accessibility", value: "轮椅无障碍", confirmed: true }
    ]
  },
  phase: 1  // 锁定约束阶段
})

// server.js 响应：
{
  "success": true,
  "updates": {
    "constraints": {...},
    "phase": 1
  },
  "message": "已记录目的地、日期、人数、预算、特殊需求；确认需求（1/4）"
}
```

2. **AI 调用 `cache_destination_knowledge` 缓存目的地知识**
```javascript
cache_destination_knowledge({
  destination: "日本",
  content: `# 日本旅游知识库
## 签证政策
...
## 货币与支付
- 官方货币：日元（JPY）
- 汇率参考：1 CNY ≈ 23.24 JPY
...
## 无障碍设施
日本对无障碍的支持：
- 地铁、公交大多配有无障碍设施
- 主要景点有轮椅通道
- 酒店可提前预订无障碍房间
...
## 清真饮食
日本清真餐厅：
- 东京有多家清真餐厅
- 便利店有清真方便食品
- 可提前告知酒店餐饮需求
...`
})

// 结果：
{
  "success": true,
  "destination": "日本",
  "message": "已缓存\"日本\"目的地知识库，后续对话将直接复用"
}
```

3. **AI 调用 `web_search` 搜索签证信息**
```javascript
web_search({
  query: "日本中国护照旅游签证2026年要求"
})

// 结果包含：
{
  "results": [
    {
      "title": "日本旅游签证办理指南2026 - 中国驻日本大使馆",
      "url": "...",
      "snippet": "中国护照持有人赴日旅游需要提前办理旅游签证。单次旅游签证通常允许停留15天..."
    },
    ...
  ]
}
```

4. **AI 调用 `get_weather` 查询天气**
```javascript
get_weather({
  city: "东京",
  date_range: "2026-05-01 to 2026-05-05"
})

// 结果：
{
  "city": "东京",
  "current": { "temp_c": 20, "description": "晴" },
  "forecast": [
    { "date": "2026-05-01", "min_temp_c": 15, "max_temp_c": 22, "description": "晴" },
    { "date": "2026-05-02", "min_temp_c": 14, "max_temp_c": 20, "description": "多云" },
    ...
  ]
}
```

5. **AI 调用 `get_exchange_rate` 查询汇率**
```javascript
get_exchange_rate({
  from: "JPY",
  to: "CNY"
})

// 结果：
{
  "from": "JPY",
  "to": "CNY",
  "rate": 0.043,
  "last_updated": "2026-04-13 10:30"
}
```

6. **AI 再次调用 `update_trip_info` 推送行程框架和提醒**
```javascript
update_trip_info({
  phase: 3,  // 推进到行程规划阶段
  itinerary: {
    route: ["东京", "京都"],
    days: [
      {
        day: 1,
        date: "2026-05-01",
        city: "东京",
        title: "抵达东京",
        segments: [
          {
            time: "14:00",
            title: "抵达成田机场",
            type: "flight",
            location: "成田机场"
          }
        ]
      },
      ...
    ],
    reminders: [
      "出发前2周向日本使馆提交签证申请",
      "出发前3天确认无障碍酒店预订",
      "兑换日元现金（估3万日元¥1290）",
      "购买旅行保险（推荐美亚保险¥188起）",
      "下载Google Translate和Maps离线地图",
      "告知航空公司特殊饮食需求（清真）",
      "预订清真餐厅（东京、京都各1-2家）"
    ]
  }
})

// server.js 同步到 TripBook，然后：
// tripBook.updateItinerary(itinerary)
//   └─ this.itinerary.reminders = Array.from(new Set([...existing, ...新reminders]))
//
// 最后生成 tripbook_update 事件：
{
  "event": "tripbook_update",
  "data": {
    "destination": "日本",
    "departCity": "北京",
    "dates": "2026-05-01 ~ 2026-05-05",
    "days": 5,
    "people": 2,
    "budget": "¥25000",
    "preferences": [],
    
    "route": ["东京", "京都"],
    "daysPlan": [...],
    "flights": [],
    "hotels": [],
    
    // === 实用信息字段 ===
    "weatherList": [
      { "city": "东京", "temp_c": 20, "description": "晴" },
      { "city": "京都", "temp_c": 18, "description": "多云" }
    ],
    
    "exchangeRates": [
      {
        "from": "JPY",
        "to": "CNY",
        "rate": 0.043,
        "last_updated": "2026-04-13 10:30"
      }
    ],
    
    "webSearchSummaries": [
      {
        "query": "日本中国护照旅游签证2026年要求",
        "summary": "中国护照持有人赴日旅游需要提前办理旅游签证...",
        "fetched_at": 1768342800000
      },
      {
        "query": "日本无障碍设施旅游指南",
        "summary": "日本对无障碍的支持...",
        "fetched_at": 1768342800000
      },
      {
        "query": "东京京都清真餐厅推荐",
        "summary": "东京有多家清真餐厅...",
        "fetched_at": 1768342800000
      }
    ],
    
    "specialRequests": [
      { "type": "dietary", "value": "清真", "confirmed": true },
      { "type": "accessibility", "value": "轮椅无障碍", "confirmed": true }
    ],
    
    "reminders": [
      "出发前2周向日本使馆提交签证申请",
      "出发前3天确认无障碍酒店预订",
      "兑换日元现金（估3万日元¥1290）",
      "购买旅行保险（推荐美亚保险¥188起）",
      "下载Google Translate和Maps离线地图",
      "告知航空公司特殊饮食需求（清真）",
      "预订清真餐厅（东京、京都各1-2家）"
    ],
    
    "_snapshot": {
      "id": "trip_xxx",
      "created_at": 1768342800000,
      "constraints": {...},
      "itinerary": {...},
      "dynamic": {
        "knowledge": { "日本": { "added_at": 1768342800000 } },
        "weather": {...},
        "exchangeRates": {...},
        "webSearches": [...]
      }
    }
  }
}
```

#### 第3步：前端渲染

chat.js 接收 `tripbook_update` 事件：
```javascript
case 'tripbook_update': {
  const snapshot = data._snapshot;
  sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot));
  
  const panelData = { ...data };
  delete panelData._snapshot;
  
  updateFromTripBook(panelData);  // 调用 itinerary.js
}
```

itinerary.js 更新状态：
```javascript
function updateFromTripBook(data) {
  if (data.reminders) itineraryState.reminders = data.reminders;
  if (data.exchangeRates) itineraryState.exchangeRates = data.exchangeRates;
  if (data.webSearchSummaries) itineraryState.webSearchSummaries = data.webSearchSummaries;
  if (data.weatherList) itineraryState.weatherList = data.weatherList;
  if (data.specialRequests) itineraryState.specialRequests = data.specialRequests;
  
  renderPanel();
}
```

renderPanel() 调用 renderSectionPrepAndInfo()，生成 HTML：

```html
<section class="panel-section">
  <div class="panel-section-header">📚 行前准备 & 实用信息</div>
  
  <!-- 天气预报 -->
  <div class="tab-content-section">
    <div class="tab-section-label">🌤️ 天气预报</div>
    <div class="prep-card">
      <div class="prep-card-title">📍 东京</div>
      <div class="prep-card-body">20°C，晴</div>
    </div>
    <div class="prep-card">
      <div class="prep-card-title">📍 京都</div>
      <div class="prep-card-body">18°C，多云</div>
    </div>
  </div>
  
  <!-- 签证信息 -->
  <div class="tab-content-section">
    <div class="tab-section-label">🛂 签证信息</div>
    <div class="prep-card">
      <div class="prep-card-title">日本中国护照旅游签证2026年要求</div>
      <div class="prep-card-body">中国护照持有人赴日旅游需要提前办理旅游签证...</div>
    </div>
    <div class="prep-card">
      <div class="prep-card-title">日本无障碍设施旅游指南</div>
      <div class="prep-card-body">日本对无障碍的支持...</div>
    </div>
  </div>
  
  <!-- 汇率 -->
  <div class="tab-content-section">
    <div class="tab-section-label">💱 汇率</div>
    <div class="rate-card">
      1 JPY = 0.043 CNY
      <small>2026-04-13 10:30</small>
    </div>
  </div>
  
  <!-- 实用信息 -->
  <div class="tab-content-section">
    <div class="tab-section-label">🔍 实用信息</div>
    <div class="info-card">
      <div class="info-card-title">东京京都清真餐厅推荐</div>
      <div class="info-card-body">东京有多家清真餐厅...</div>
    </div>
  </div>
  
  <!-- 特殊需求 -->
  <div class="tab-content-section">
    <div class="tab-section-label">⚠️ 特殊需求</div>
    <div class="prep-card">
      <div class="prep-card-title">dietary</div>
      <div class="prep-card-body">清真</div>
    </div>
    <div class="prep-card">
      <div class="prep-card-title">accessibility</div>
      <div class="prep-card-body">轮椅无障碍</div>
    </div>
  </div>
  
  <!-- 行前清单 -->
  <div class="tab-content-section">
    <div class="tab-section-label">📝 行前清单</div>
    <ul class="reminder-list">
      <li class="reminder-item">
        <span class="reminder-check" onclick="toggleReminder(this)"></span>
        <span>出发前2周向日本使馆提交签证申请</span>
      </li>
      <li class="reminder-item">
        <span class="reminder-check" onclick="toggleReminder(this)"></span>
        <span>出发前3天确认无障碍酒店预订</span>
      </li>
      <!-- ... 更多项目 ... -->
    </ul>
  </div>
</section>
```

最后显示给用户：

```
📚 行前准备 & 实用信息
━━━━━━━━━━━━━━━━━━━━━━

🌤️ 天气预报
  📍 东京 — 20°C，晴
  📍 京都 — 18°C，多云

🛂 签证信息
  日本中国护照旅游签证2026年要求
  中国护照持有人赴日旅游需要提前办理旅游签证。单次旅游
  签证通常允许停留15天...

💱 汇率
  1 JPY = 0.043 CNY (2026-04-13 10:30)

🔍 实用信息
  东京京都清真餐厅推荐
  东京有多家清真餐厅。主要街道如表参道、新宿都有清真
  餐饮选择...

⚠️ 特殊需求
  dietary — 清真
  accessibility — 轮椅无障碍

📝 行前清单
  ☐ 出发前2周向日本使馆提交签证申请
  ☐ 出发前3天确认无障碍酒店预订
  ☐ 兑换日元现金（估3万日元¥1290）
  ☐ 购买旅行保险（推荐美亚保险¥188起）
  ☐ 下载Google Translate和Maps离线地图
  ☐ 告知航空公司特殊饮食需求（清真）
  ☐ 预订清真餐厅（东京、京都各1-2家）
```

---

## 关键代码路径总结

| 功能 | 文件 | 行号 |
|------|------|------|
| **前端面板渲染** | `/public/js/itinerary.js` | 484-576 |
| SSE 事件接收 | `/public/js/chat.js` | 303-323 |
| **后端 TripBook 模型** | `/models/trip-book.js` | 全文 |
| 实用信息导出 | `/models/trip-book.js` | 430-506 |
| **目的地知识工具** | `/tools/dest-knowledge.js` | 全文 |
| **更新行程工具** | `/tools/update-trip-info.js` | 53, 128-139 |
| **API 端点** | `/server.js` | 116-205 |
| 工具结果同步 | `/server.js` | 256-402 |
| tripbook_update 事件 | `/server.js` | 376-380 |
| **系统提示** | `/prompts/system-prompt.js` | 全文 |

---

## 缓存和持久化

### 内存缓存
- **目的地知识**：`destCache` Map（30天 TTL）
- **汇率**：`exchangeRates`（4小时 TTL）
- **天气**：`weather`（3小时 TTL）

### 文件持久化
- **目的地知识**：`/prompts/knowledge/dest-{destination}.js`
- **汇率缓存**：`/data/rates-cache.json`
- **天气缓存**：`/data/weather-cache.json`

### 前端会话持久化
- **TripBook 快照**：`sessionStorage['tp_tripbook_snapshot']`
- **面板数据**：`sessionStorage['tp_tripbook']`

---

## 推荐阅读顺序

1. 先读 **`/models/trip-book.js`** — 理解数据模型
2. 再读 **`/public/js/itinerary.js`** 的 `renderSectionPrepAndInfo()` — 前端如何显示
3. 再读 **`/server.js`** 的 `runTool()` 和 `tripbook_update` 逻辑 — 了解后端如何推送
4. 再读 **`/tools/dest-knowledge.js`** — 知识库缓存机制
5. 再读 **`/tools/update-trip-info.js`** — AI 如何推送数据

