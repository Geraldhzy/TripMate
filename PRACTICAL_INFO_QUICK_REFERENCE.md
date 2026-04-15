# 实用信息（Practical Info）快速参考

## 🎯 5秒速记

**实用信息** = 天气 + 签证 + 汇率 + 目的地知识 + 行前清单 + 特殊需求

所有数据在后端 `TripBook` 中存储，通过 `tripbook_update` SSE 事件推送到前端，在面板的 **"📚 行前准备 & 实用信息"** 区块统一展示。

---

## 📂 文件地图

### 前端（显示层）
| 文件 | 行 | 功能 |
|------|-----|------|
| `/public/js/itinerary.js` | 484-576 | **renderSectionPrepAndInfo()** — 渲染6个子区块 |
| `/public/js/itinerary.js` | 159-215 | **updateFromTripBook()** — SSE 事件处理 |
| `/public/js/chat.js` | 303-323 | SSE 'tripbook_update' 事件接收 |

### 后端（数据模型层）
| 文件 | 行 | 功能 |
|------|-----|------|
| `/models/trip-book.js` | 26-57 | **dynamic/constraints/itinerary** 三层数据结构 |
| `/models/trip-book.js` | 430-506 | **toPanelData()** — 导出前端用数据 |

### 工具层
| 文件 | 行 | 功能 |
|------|-----|------|
| `/tools/dest-knowledge.js` | 43-50 | **execute()** — 目的地知识缓存 |
| `/tools/update-trip-info.js` | 60-146 | **execute()** — 更新行程（含 reminders） |
| `/tools/weather.js` | — | get_weather — 获取天气 |
| `/tools/exchange-rate.js` | — | get_exchange_rate — 获取汇率 |
| `/tools/web-search.js` | — | web_search — 搜索（签证/实用信息） |

### 服务端
| 文件 | 行 | 功能 |
|------|-----|------|
| `/server.js` | 116-205 | **/api/chat** — SSE 主端点 |
| `/server.js` | 256-402 | **runTool()** — 工具执行 & TripBook 同步 |
| `/server.js` | 376-380 | **tripbook_update 事件推送** |

---

## 🔄 关键数据流

### 完整流程（7步）

```
1. AI 调用 update_trip_info(constraints, itinerary)
   ↓
2. server.js runTool() 接收结果
   ↓
3. tripBook.updateConstraints() + tripBook.updateItinerary()
   ↓
4. tripBook.toPanelData() 导出面板数据
   ↓
5. sendSSE('tripbook_update', data) 推送到前端
   ↓
6. chat.js 接收，sessionStorage 保存快照
   ↓
7. itinerary.js updateFromTripBook() 更新状态 → renderPanel()
```

### 数据涉及的工具

| 工具 | 推送到 TripBook | 最终在前端显示为 |
|------|-----------------|------------------|
| web_search | addWebSearch() | webSearchSummaries（分为签证/实用信息两个卡片组） |
| get_weather | setWeather() | weatherList → renderSectionPrepAndInfo() 天气区块 |
| get_exchange_rate | setExchangeRate() | exchangeRates → 汇率卡片 |
| cache_destination_knowledge | addKnowledgeRef() | knowledge（仅记录引用，内容在系统提示中复用） |
| update_trip_info(itinerary) | updateItinerary() | reminders → 行前清单；specialRequests → 特殊需求 |

---

## 💾 实用信息的6个子区块

### 1. 🌤️ 天气预报
- **数据来源**：TripBook.dynamic.weather
- **前端字段**：weatherList（多城市）/ weather（单城市）
- **渲染函数**：itinerary.js 第498行
- **显示内容**：`📍 城市名 — XX°C，天气描述`

### 2. 🛂 签证信息
- **数据来源**：TripBook.dynamic.webSearches（筛选含 /签证|visa|入境|护照|免签/）
- **前端字段**：webSearchSummaries
- **渲染函数**：itinerary.js 第512行
- **显示内容**：搜索查询 + 摘要文本

### 3. 💱 汇率
- **数据来源**：TripBook.dynamic.exchangeRates
- **前端字段**：exchangeRates
- **渲染函数**：itinerary.js 第524行
- **显示内容**：`1 JPY = 0.043 CNY (更新时间)`

### 4. 🔍 实用信息
- **数据来源**：TripBook.dynamic.webSearches（筛选不含签证关键词）
- **前端字段**：webSearchSummaries
- **渲染函数**：itinerary.js 第536行
- **显示内容**：餐厅推荐、交通指南、景点介绍等

### 5. ⚠️ 特殊需求
- **数据来源**：TripBook.constraints.specialRequests
- **前端字段**：specialRequests
- **渲染函数**：itinerary.js 第548行
- **显示内容**：`type（如"dietary"） — value（如"清真"）`

### 6. 📝 行前清单
- **数据来源**：TripBook.itinerary.reminders
- **前端字段**：reminders
- **渲染函数**：itinerary.js 第560行
- **显示内容**：可勾选的清单项 ☐

---

## 📐 数据结构快览

### 前端状态（itinerary.js）
```javascript
{
  reminders: ["出发前完成Visit Japan Web注册", ...],
  exchangeRates: [{ from, to, rate, last_updated }, ...],
  webSearchSummaries: [{ query, summary, fetched_at }, ...],
  weatherList: [{ city, temp_c, description }, ...],
  specialRequests: [{ type, value, confirmed }, ...],
}
```

### 后端 TripBook（模型层）
```javascript
{
  dynamic: {
    knowledge: { "日本": { added_at } },
    weather: { "tokyo": { city, current, forecast, _meta } },
    exchangeRates: { "JPY_CNY": { from, to, rate, last_updated, _meta } },
    webSearches: [{ query, summary, fetched_at }],
  },
  constraints: {
    specialRequests: [{ type, value, confirmed }],
  },
  itinerary: {
    reminders: [...]
  }
}
```

---

## 🛠️ 调试技巧

### 1. 查看 TripBook 完整快照
```javascript
// 在浏览器控制台
JSON.parse(sessionStorage.getItem('tp_tripbook_snapshot'))
```

### 2. 查看面板状态
```javascript
// 在浏览器控制台
itineraryState
```

### 3. 查看缓存的目的地知识
```bash
# 在项目根目录
ls -la prompts/knowledge/dest-*.js
cat prompts/knowledge/dest-日本.js
```

### 4. 跟踪 SSE 事件
```javascript
// 在 chat.js 中加 console.log
case 'tripbook_update': {
  console.log('[SSE] tripbook_update:', data);  // ← 添加
  // ...
}
```

### 5. 测试目的地知识工具
```bash
# 查询是否已缓存
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "缓存日本知识库"}],
    "provider": "openai",
    "model": "gpt-4"
  }'
```

---

## ⚡ 关键实现要点

### 1. 实用信息如何进入 TripBook

**路径：** AI 调用工具 → server.js runTool() → TripBook 同步方法 → tripbook_update SSE 事件

### 2. webSearchSummaries 如何分为两个卡片组

**筛选逻辑**（itinerary.js 第487-488行）：
```javascript
const visaSearches = s.webSearchSummaries.filter(
  w => /签证|visa|入境|护照|免签/i.test(w.query)
);
const infoSearches = s.webSearchSummaries.filter(
  w => !/签证|visa|入境|护照|免签/i.test(w.query)
);
```

### 3. 行前清单的去重机制

**去重逻辑**（trip-book.js 第233-237行）：
```javascript
if (Array.isArray(delta.reminders)) {
  const existing = new Set(this.itinerary.reminders);
  delta.reminders.forEach(r => existing.add(r));  // Set 自动去重
  this.itinerary.reminders = Array.from(existing);
}
```

### 4. 天气和汇率的 TTL 缓存

- **天气**：3小时 TTL（3 * 3600000 ms）
- **汇率**：4小时 TTL（4 * 3600000 ms）
- **检查**：在 buildDynamicDataPromptSection() 中 age < ttl

### 5. 特殊需求的确认状态

每个特殊需求有 `confirmed` 标志：
```javascript
{ type: "dietary", value: "清真", confirmed: true }
```

当 `confirmed: true` 时，系统提示会标记为 ✅ 已确认，防止 AI 重复询问。

---

## 📊 实用信息处理的三层分工

### Layer 1: 工具层（tools/）
负责**获取和缓存**原始数据
- weather.js: 获取天气数据
- exchange-rate.js: 获取汇率数据
- web-search.js: 搜索签证/实用信息
- dest-knowledge.js: 缓存目的地知识

### Layer 2: 模型层（models/trip-book.js）
负责**存储和聚合**数据
- dynamic: 存储缓存的工具结果
- constraints: 存储特殊需求
- itinerary: 存储行前清单
- toPanelData(): 导出前端用数据

### Layer 3: 显示层（public/js/）
负责**渲染和交互**
- chat.js: 接收 SSE tripbook_update 事件
- itinerary.js: 更新状态 → 渲染 6 个子区块

---

## 🔗 相关文档

- 详细数据流：`PRACTICAL_INFO_DATAFLOW.md`
- 系统提示分析：`README_SYSTEM_PROMPT_ANALYSIS.md`
- 架构文档：`PRACTICAL_INFO_ARCHITECTURE.txt`

---

## ✅ 常见问题

**Q: 实用信息何时显示在面板上？**
A: 当 AI 调用 update_trip_info 或其他工具（weather/exchange-rate/web_search）时，server.js 将结果同步到 TripBook，并立即推送 tripbook_update 事件到前端，触发 renderPanel()。

**Q: 为什么有时看不到某些实用信息？**
A: 检查 itineraryState 中对应字段是否为空。如不为空，检查浏览器控制台是否有 JS 错误。

**Q: 如何添加新的实用信息子区块？**
A: 在 itinerary.js 的 renderSectionPrepAndInfo() 中添加新的 if 块，读取 itineraryState 的新字段并渲染 HTML。

**Q: 目的地知识如何在系统提示中复用？**
A: dest-knowledge.js 的 getAllCachedDests() 被 system-prompt.js 调用，生成"目的地知识库"段落注入到系统提示。

**Q: 行前清单项为什么会重复？**
A: 因为使用了 Set 去重机制，重复调用 update_trip_info 时会自动合并。

---

**最后修改：2026-04-13**
**版本：1.0**
