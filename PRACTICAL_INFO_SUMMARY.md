# 实用信息（Practical Info）- 完整分析总结

## 📋 执行总结

本文档追踪了"实用信息"（天气、签证、汇率、行前清单、特殊需求等）在旅行规划应用中的**完整数据流**。

### 关键发现

1. **三层架构设计**
   - **工具层**：5个工具负责数据获取和缓存
   - **模型层**：TripBook 的三层数据结构（dynamic/constraints/itinerary）
   - **显示层**：前端状态管理和 HTML 渲染

2. **实时推送机制**
   - 使用 SSE（Server-Sent Events）`tripbook_update` 事件
   - 每次工具执行都会触发完整的面板重新渲染
   - 前端状态和服务端快照同步保存

3. **6个独立的信息区块**
   - 🌤️ 天气预报
   - 🛂 签证信息
   - 💱 汇率
   - 🔍 实用信息
   - ⚠️ 特殊需求
   - 📝 行前清单

---

## 🗂️ 文件清单与关键代码

### 1. 前端显示层

#### `/public/js/itinerary.js`（824行）

**核心函数：renderSectionPrepAndInfo()** （第484-576行）

生成整个"📚 行前准备 & 实用信息"区块的HTML，包含6个子区块：

```javascript
// 第484-492行：开始条件判断
const weatherItems = s.weatherList || (s.weather ? [s.weather] : []);
const visaSearches = s.webSearchSummaries.filter(w => /签证|visa|入境|护照|免签/i.test(w.query));
const infoSearches = s.webSearchSummaries.filter(w => !/签证|visa|入境|护照|免签/i.test(w.query));

const hasContent = weatherItems.length > 0 || visaSearches.length > 0 ||
                   s.exchangeRates.length > 0 || infoSearches.length > 0 ||
                   s.specialRequests.length > 0 || s.reminders.length > 0;
```

**子区块1：天气预报**（第498-509行）
```javascript
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

**子区块2：签证信息**（第512-521行）
```javascript
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

**子区块3：汇率**（第524-533行）
```javascript
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

**子区块4：实用信息**（第536-545行）
```javascript
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

**子区块5：特殊需求**（第548-557行）
```javascript
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

**子区块6：行前清单**（第560-570行）
```javascript
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

**状态更新函数：updateFromTripBook()** （第159-215行）
```javascript
function updateFromTripBook(data) {
  if (!data) return;
  try {
    // 更新基本信息
    if (data.destination) itineraryState.destination = data.destination;
    // ...
    
    // === 更新实用信息字段 ===
    if (data.reminders) itineraryState.reminders = data.reminders;
    if (data.exchangeRates) itineraryState.exchangeRates = data.exchangeRates;
    if (data.webSearchSummaries) itineraryState.webSearchSummaries = data.webSearchSummaries;
    if (data.specialRequests) itineraryState.specialRequests = data.specialRequests;
    if (data.weatherList) itineraryState.weatherList = data.weatherList;
    
    try { renderPanel(); } catch(e) { console.error('renderPanel error:', e); }
  } catch(e) {
    console.error('updateFromTripBook error:', e);
  }
}
```

#### `/public/js/chat.js`（949行）

**SSE事件处理**（第303-323行）
```javascript
case 'tripbook_update': {
  // 提取并存储完整快照（供服务端恢复 TripBook）
  const snapshot = data._snapshot;
  if (snapshot) {
    try {
      sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot));
    } catch (err) {
      console.error('[Chat] Failed to store TripBook snapshot in sessionStorage', {
        error: err.message,
        snapshotSize: JSON.stringify(snapshot).length
      });
    }
  }
  // 面板渲染用去掉 _snapshot 的数据（避免 itinerary.js 处理多余字段）
  const panelData = { ...data };
  delete panelData._snapshot;
  if (typeof updateFromTripBook === 'function') updateFromTripBook(panelData);
  // 同时保存面板数据（供页面刷新时快速恢复面板）
  try { sessionStorage.setItem('tp_tripbook', JSON.stringify(panelData)); } catch {}
  break;
}
```

---

### 2. 后端模型层

#### `/models/trip-book.js`（542行）

**三层数据结构初始化**（第23-57行）
```javascript
class TripBook {
  constructor(id) {
    this.id = id || `trip_${Date.now()}`;
    this.created_at = Date.now();

    // Layer 1: 动态数据（含目的地知识缓存）
    this.dynamic = {
      knowledge: {},        // 目的地知识引用
      weather: {},          // 天气缓存
      exchangeRates: {},    // 汇率缓存
      flightQuotes: [],
      hotelQuotes: [],
      webSearches: [],      // Web搜索摘要
    };

    // Layer 2: 用户约束
    this.constraints = {
      destination: null,
      departCity: null,
      dates: null,
      people: null,
      budget: null,
      preferences: null,
      specialRequests: [],  // ← 特殊需求在这一层
      _history: [],
    };

    // Layer 3: 结构化行程
    this.itinerary = {
      phase: 0,
      phaseLabel: '',
      route: [],
      days: [],
      budgetSummary: null,
      reminders: [],        // ← 行前清单在这一层
    };
  }
}
```

**关键方法：toPanelData()** （第430-506行）

该方法将 TripBook 的所有层级数据转换为前端需要的扁平格式：

```javascript
toPanelData() {
  const c = this.constraints;
  const it = this.itinerary;

  // ... 基本信息处理 ...

  // === 实用信息字段导出 ===
  
  // 天气（单城市兼容性 + 多城市完整列表）
  const weatherEntries = Object.values(this.dynamic.weather);
  const weatherList = weatherEntries.map(w => ({
    city: w.city,
    temp_c: w.current?.temp_c,
    description: w.current?.description,
  }));

  return {
    // 基本字段...
    
    // === 实用信息字段 ===
    reminders: it.reminders || [],
    exchangeRates: Object.values(this.dynamic.exchangeRates).map(r => ({
      from: r.from,
      to: r.to,
      rate: r.rate,
      last_updated: r.last_updated,
    })),
    webSearchSummaries: this.dynamic.webSearches.map(s => ({
      query: s.query,
      summary: s.summary || '',
      fetched_at: s.fetched_at,
    })),
    weather: weatherList.length === 1 ? weatherList[0] : null,
    weatherList: weatherList.length > 0 ? weatherList : null,
    specialRequests: (c.specialRequests || []).map(r => ({
      type: r.type,
      value: r.value,
      confirmed: r.confirmed,
    })),
  };
}
```

**更新方法：updateItinerary()** （第198-238行）

处理行前清单的去重：
```javascript
updateItinerary(delta) {
  if (!delta) return;

  // ... 路由、日期等处理 ...

  // ✅ 行前清单 - 追加模式，自动去重
  if (Array.isArray(delta.reminders)) {
    const existing = new Set(this.itinerary.reminders);
    delta.reminders.forEach(r => existing.add(r));  // Set 自动去重
    this.itinerary.reminders = Array.from(existing);
  }
}
```

**更新方法：updateConstraints()** （第132-178行）

处理特殊需求的追加和确认状态：
```javascript
updateConstraints(delta) {
  if (!delta) return;
  // ... 其他字段处理 ...

  // 特殊需求（追加模式）
  if (Array.isArray(delta.specialRequests)) {
    for (const req of delta.specialRequests) {
      const existing = this.constraints.specialRequests.find(
        r => r.type === req.type && r.value === req.value
      );
      if (existing) {
        existing.confirmed = req.confirmed;  // 更新确认状态
      } else {
        this.constraints.specialRequests.push(req);  // 新增
      }
    }
  }
}
```

**缓存管理方法**
```javascript
// 天气同步
setWeather(cityKey, data) {
  this.dynamic.weather[cityKey.toLowerCase()] = data;
}

// 汇率同步
setExchangeRate(key, data) {
  this.dynamic.exchangeRates[key] = data;
}

// Web搜索去重记录
addWebSearch(entry) {
  const key = (entry.query || '').toLowerCase().trim();
  if (!key) return;
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

// 知识引用
addKnowledgeRef(key) {
  if (key && !this.dynamic.knowledge[key]) {
    this.dynamic.knowledge[key] = { added_at: Date.now() };
  }
}
```

---

### 3. 工具层

#### `/tools/dest-knowledge.js`（166行）

**工具定义**（第19-41行）
```javascript
const TOOL_DEF = {
  name: 'cache_destination_knowledge',
  description: '将目的地基础信息保存为知识库缓存...',
  parameters: {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: '目的地名称（国家级如"日本"，城市级如"日本-东京"）'
      },
      content: {
        type: 'string',
        description: 'Markdown格式的结构化知识'
      }
    },
    required: ['destination', 'content']
  }
};
```

**执行函数**（第43-50行）
```javascript
async function execute({ destination, content }) {
  if (!destination || !content) {
    return JSON.stringify({ error: '缺少必要参数: destination, content' });
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

**文件保存**（第83-92行）
```javascript
function saveOneToFile(destination, content, savedAt) {
  try {
    const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    const jsContent = `/** 目的地知识库：${destination}（自动生成，可人工编辑） */
module.exports = {
  destination: '${destination.replace(/'/g, "\\'")}',
  saved_at: ${savedAt},
  content: \`${escaped}\`
};
`;
    fs.writeFileSync(destFilePath(destination), jsContent, 'utf-8');
  } catch (err) {
    log.warn('保存目的地知识库文件失败', { destination, error: err.message });
  }
}
```

**缓存初始化**（第162-165行）
```javascript
function initCache() {
  migrateLegacyCache();    // 从旧 JSON 迁移
  loadFromFiles();          // 从 prompts/knowledge/ 加载
}
```

#### `/tools/update-trip-info.js`（149行）

**工具定义**（第16-58行）

包含对 reminders 和 specialRequests 的说明：
```javascript
parameters: {
  type: 'object',
  properties: {
    // ...
    itinerary: {
      type: 'object',
      description: [
        '行程数据增量更新...',
        'reminders: ["出发前完成Visit Japan Web注册", ...] — 行前准备清单',
        'segment.type 必须是: transport/attraction/activity/meal/hotel/flight'
      ].join('')
    },
    constraints: {
      type: 'object',
      description: [
        'specialRequests: [{ type: "dietary", value: "清真", confirmed: true }]',
      ].join('')
    }
  }
}
```

**执行逻辑**（第60-146行）

确保所有字段都标记为 confirmed：
```javascript
async function execute(args) {
  const { constraints, phase, itinerary } = args || {};

  if (!constraints && phase === undefined && !itinerary) {
    return JSON.stringify({ error: '至少需要传入一个字段' });
  }

  const updates = {};
  const messages = [];

  if (constraints) {
    // ⚠️ 确保所有约束字段都标记为 confirmed
    const constraintFields = ['destination', 'departCity', 'dates', 'people', 'budget', 'preferences', 'specialRequests'];
    for (const field of constraintFields) {
      if (constraints[field] !== undefined) {
        if (Array.isArray(constraints[field])) {
          // specialRequests 是数组
          constraints[field] = constraints[field].map(item => ({
            ...item,
            confirmed: item.confirmed !== false ? true : false
          }));
        } else if (typeof constraints[field] === 'object') {
          // 其他是对象
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

---

### 4. 服务端

#### `/server.js` - SSE 主端点

**端点定义**（第116-205行）
```javascript
app.post('/api/chat', validateHeaders(), validate(chatRequestSchema), chatLimiter, toolLimiter, async (req, res) => {
  const { messages, provider, model, tripBookSnapshot } = req.body;
  
  // SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const sendSSE = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // 创建本次请求的 TripBook 实例
    const tripBook = new TripBook();
    
    // 从客户端快照恢复 TripBook 状态
    if (tripBookSnapshot) {
      if (tripBookSnapshot.constraints) tripBook.updateConstraints(tripBookSnapshot.constraints);
      if (tripBookSnapshot.itinerary) tripBook.updateItinerary(tripBookSnapshot.itinerary);
      if (tripBookSnapshot.knowledgeRefs) {
        for (const ref of tripBookSnapshot.knowledgeRefs) tripBook.addKnowledgeRef(ref);
      }
    }
    
    // 调用 AI
    fullText = await handleChat(provider, apiKey, model, systemPrompt, messages, sendSSE, effectiveBaseUrl, tripBook, reqLog) || '';
    
    sendSSE('done', {});
  } catch (err) {
    sendSSE('error', { message: err.message || '未知错误' });
  } finally {
    res.end();
  }
});
```

**工具执行和 TripBook 同步** （第256-402行）
```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook, delegateCtx, reqLog) {
  // ...
  
  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  
  try {
    const result = await executeToolCall(funcName, funcArgs);
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const resultLabel = getToolResultLabel(funcName, funcArgs, resultStr);
    
    sendSSE('tool_result', { id: toolId, name: funcName, resultLabel });

    // === 将工具结果同步到 TripBook ===
    
    if (tripBook) {
      try {
        const parsed = JSON.parse(resultStr);

        // 天气 → TripBook + SSE 事件
        if (funcName === 'get_weather' && !parsed.error) {
          sendSSE('weather_cached', parsed);
          tripBook.setWeather(parsed.city || '', {
            city: parsed.city,
            current: parsed.current,
            forecast: parsed.forecast,
            _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 3 * 3600000 }
          });
        }

        // 汇率 → TripBook + SSE 事件
        if (funcName === 'get_exchange_rate' && parsed.rate && !parsed.error) {
          sendSSE('rate_cached', parsed);
          tripBook.setExchangeRate(`${parsed.from}_${parsed.to}`, {
            from: parsed.from,
            to: parsed.to,
            rate: parsed.rate,
            last_updated: parsed.last_updated,
            _meta: { fetched_at: parsed.fetched_at || Date.now(), ttl: 4 * 3600000 }
          });
        }

        // Web搜索 → TripBook 记录
        if (funcName === 'web_search' && !parsed.error) {
          const query = funcArgs.query || parsed.query || '';
          const firstResult = Array.isArray(parsed.results) && parsed.results[0];
          const summary = firstResult
            ? `找到 ${parsed.results.length} 条结果，首条: ${(firstResult.title || '').slice(0, 60)}`
            : '已搜索';
          tripBook.addWebSearch({ query, summary });
        }

        // 目的地知识 → TripBook 引用
        if (funcName === 'cache_destination_knowledge' && parsed.destination) {
          tripBook.addKnowledgeRef(parsed.destination);
        }

        // === 核心：update_trip_info 触发 tripbook_update 事件 ===
        if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
          const updates = parsed.updates;
          
          // 写入约束（含 specialRequests）
          if (updates.constraints) {
            tripBook.updateConstraints(updates.constraints);
          }
          
          // 更新阶段
          if (updates.phase !== undefined) {
            tripBook.updatePhase(updates.phase);
          }
          
          // 更新行程（含 reminders）
          if (updates.itinerary) {
            tripBook.updateItinerary(updates.itinerary);
          }
          
          // ✅ 推送 tripbook_update 事件到前端
          sendSSE('tripbook_update', {
            ...tripBook.toPanelData(),
            _snapshot: tripBook.toJSON()
          });
        }
      } catch (err) {
        // 错误处理
      }
    }

    return resultStr;
  } catch (toolErr) {
    // 错误处理
  }
}
```

---

## 📊 数据流时序图

```
用户输入
    ↓
[AI 处理]
    ↓
AI 调用工具链：
    ├─ web_search("日本签证")
    ├─ get_weather("东京")
    ├─ get_exchange_rate("JPY", "CNY")
    ├─ cache_destination_knowledge("日本", "...")
    └─ update_trip_info({
         constraints: { specialRequests: [...] },
         itinerary: { reminders: [...] }
       })
    ↓
server.js runTool()
    ├─ web_search 结果 → tripBook.addWebSearch()
    ├─ weather 结果 → tripBook.setWeather()
    │               → sendSSE('weather_cached', ...)
    ├─ rate 结果 → tripBook.setExchangeRate()
    │             → sendSSE('rate_cached', ...)
    ├─ knowledge 结果 → tripBook.addKnowledgeRef()
    └─ update_trip_info 结果 → tripBook.updateConstraints() + updateItinerary()
                              → tripBook.toPanelData()
                              → sendSSE('tripbook_update', {
                                  reminders: [...],
                                  exchangeRates: [...],
                                  webSearchSummaries: [...],
                                  weatherList: [...],
                                  specialRequests: [...],
                                  _snapshot: {...}
                                })
    ↓
浏览器接收 SSE 事件
    ↓
chat.js 处理 'tripbook_update'
    ├─ sessionStorage.setItem('tp_tripbook_snapshot', ...)
    └─ updateFromTripBook(panelData)
    ↓
itinerary.js updateFromTripBook()
    ├─ itineraryState.reminders = data.reminders
    ├─ itineraryState.exchangeRates = data.exchangeRates
    ├─ itineraryState.webSearchSummaries = data.webSearchSummaries
    ├─ itineraryState.weatherList = data.weatherList
    ├─ itineraryState.specialRequests = data.specialRequests
    └─ renderPanel()
    ↓
renderPanel() → renderSectionPrepAndInfo()
    ├─ renderWeatherSection(weatherList)
    ├─ renderVisaSection(visaSearches)
    ├─ renderRateSection(exchangeRates)
    ├─ renderInfoSection(infoSearches)
    ├─ renderSpecialRequestsSection(specialRequests)
    └─ renderRemindersSection(reminders)
    ↓
前端面板更新，用户看到所有实用信息
```

---

## 🔑 关键代码片段速查

### 前端接收数据
```javascript
// chat.js 第303-323行
case 'tripbook_update': {
  const snapshot = data._snapshot;
  sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot));
  const panelData = { ...data };
  delete panelData._snapshot;
  updateFromTripBook(panelData);
}
```

### 后端推送数据
```javascript
// server.js 第376-380行
sendSSE('tripbook_update', {
  ...tripBook.toPanelData(),
  _snapshot: tripBook.toJSON()
});
```

### 渲染天气卡片
```javascript
// itinerary.js 第498-509行
if (weatherItems.length > 0) {
  content += '<div class="tab-content-section"><div class="tab-section-label">🌤️ 天气预报</div>';
  for (const w of weatherItems) {
    content += `<div class="prep-card">
      <div class="prep-card-title">📍 ${translateCity(w.city)}</div>
      <div class="prep-card-body">${w.temp_c}°C，${translateWeather(w.description)}</div>
    </div>`;
  }
  content += '</div>';
}
```

### 行前清单去重
```javascript
// trip-book.js 第233-237行
if (Array.isArray(delta.reminders)) {
  const existing = new Set(this.itinerary.reminders);
  delta.reminders.forEach(r => existing.add(r));  // Set 自动去重
  this.itinerary.reminders = Array.from(existing);
}
```

---

## 📚 补充文档

| 文档 | 内容 |
|------|------|
| `PRACTICAL_INFO_DATAFLOW.md` | **详细数据流** — 包含完整使用场景和HTML示例 |
| `PRACTICAL_INFO_QUICK_REFERENCE.md` | **快速参考** — 文件地图、常见问题、调试技巧 |
| `PRACTICAL_INFO_ARCHITECTURE.txt` | **架构文档** — 层级设计、数据流图、关键路径 |
| `PRACTICAL_INFO_FINDINGS.md` | **发现报告** — 实用信息组件、存储、显示的详细分析 |

---

## ✅ 验证清单

- [x] 前端组件：`/public/js/itinerary.js` — 6 个子区块渲染
- [x] SSE 事件处理：`/public/js/chat.js` — tripbook_update 事件
- [x] 数据模型：`/models/trip-book.js` — 三层结构 + toPanelData()
- [x] 知识缓存：`/tools/dest-knowledge.js` — 文件持久化 + 查询接口
- [x] 行程更新：`/tools/update-trip-info.js` — reminders + specialRequests
- [x] 服务端同步：`/server.js` — runTool() + tripbook_update 事件
- [x] 缓存文件：`/prompts/knowledge/dest-*.js` — 5个已存缓存
- [x] 系统提示：`/prompts/system-prompt.js` — 知识注入逻辑

---

**最后修改：2026-04-13**
**版本：Final v1.0**
