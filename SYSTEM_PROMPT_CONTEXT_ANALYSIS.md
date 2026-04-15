# AI Travel Planner - Main Agent System Prompt Context Analysis

Generated: 2026-04-13 | Repository: `/Users/geraldhuang/DEV/ai-travel-planner`

---

## 1. `toSystemPromptSection()` — TripBook System Prompt Injection

**Location**: `/models/trip-book.js` (lines 410-432)

### Structure & Output Format

The `toSystemPromptSection()` method generates a **dynamic system prompt section** that includes:

```
# 行程参考书                          [Always includes header]
  ├── ## 已缓存动态数据               [If weather/rates/searches exist]
  │   ├── ### 已缓存天气
  │   ├── ### 已缓存汇率
  │   └── ### 已完成的搜索
  ├── ## 用户已确认信息                [If constraints exist]
  │   ├── 用户已确认信息（勿重复询问）  ✅
  │   └── 待确认信息                   ❓
  └── ## 当前行程进度                 [If itinerary phase > 0]
      ├── 阶段 N/7: 标签
      ├── 路线: 城市 → 城市
      ├── 已选机票/酒店摘要
      └── 预算使用情况
```

### Key Methods Called

1. **`buildDynamicDataPromptSection()`** (lines 358-404)
   - Injects cached weather (with TTL/age info)
   - Injects cached exchange rates
   - Lists completed web searches (to prevent duplicate searches)
   - Format: "勿重复调用 get_weather" / "勿重复搜索相同或相似主题"

2. **`buildConstraintsPromptSection()`** (lines 260-318)
   - Separates confirmed constraints (✅) from pending (❓)
   - Confirmed constraint example: `目的地：日本（东京·京都·大阪） ✅`
   - Shows airport options, flexible dates, per-person budget, preferences
   - Uses `confirmed` flag to determine grouping (true → already asked, stop asking)

3. **`buildItineraryPromptSection()`** (lines 323-353)
   - Shows current phase (e.g., "阶段 3/7: 行程规划")
   - Route display: "路线: 东京 → 京都 → 大阪"
   - Selected flights/hotels summary with prices
   - Budget usage: "¥17,964 / ¥20,000"

### Important Details

- If `itinerary.phase === 0` (not started), the TripBook section shows: `（尚未开始规划，等待用户输入）`
- Weather cache shows **age + TTL remaining**: "浅草天妇罗（45分钟前查询，15分钟后过期）"
- Constraints use `.confirmed` field to prevent re-asking (CRITICAL: defaults to `true` when omitted)
- Selected quote status: `'selected'` or `'quoted'` → only `'selected'` appears in prompt

---

## 2. `agents/config.js` — Available Agents & Labels

**Location**: `/agents/config.js` (all 27 lines)

### Currently Configured Agents

**ONLY ONE ACTIVE AGENT:**

| Agent | Tools | Label | Icon | Max Rounds |
|-------|-------|-------|------|-----------|
| `flight` | `['search_flights', 'get_exchange_rate']` | 机票搜索 | ✈️ | 3 |

### Key Structural Points

- **Format**: `AGENT_CONFIGS = { [agentKey]: { tools, buildPrompt, maxRounds, icon, label } }`
- **buildPrompt()**: Each agent imports its own system prompt builder (e.g., `./prompts/flight`)
- **Enum constraint**: In `delegate_to_agents` schema, the `agent` field enum is `Object.keys(AGENT_CONFIGS)` = `["flight"]`
- **Note**: No other agents present (hotel, attraction, etc. are NOT available)

### What `delegate_to_agents` Supports

From `/agents/delegate.js` (lines 21-23):
```
enum: Object.keys(AGENT_CONFIGS),
description: '目标Agent类型：flight(机票搜索，穷尽式多机场多日期搜索)'
```

**Limitation**: Only `"flight"` is accepted. Attempting to delegate to undefined agents will be rejected at validation (line 58 in delegate.js).

---

## 3. `prompts/knowledge/holidays.js` — Holiday Knowledge Block

**Location**: `/prompts/knowledge/holidays.js` (77 lines, 3,321 bytes / ~3.3 KB)

### Structure

```javascript
const HOLIDAYS_2025 = `## 2025年中国法定节假日安排
| 节假日 | 放假日期 | 放假天数 | 调休上班 | 备注 |
|------|--------|--------|--------|------|
| 元旦 | 1月1日（三） | 1天 | — | |
| 春节 | 1月28日～2月4日 | 8天 | ... |
| ... (6 holidays total)
+ Daily breakdown for 五一 (May Day)
+ Detailed April-May calendar for 2025

const HOLIDAYS_2026 = `## 2026年中国法定节假日安排
+ Similar structure for 2026
+ 7 holidays total
+ Notes: "2026年安排为预测版本，以国务院官方公告为准"

function getHolidayKnowledge() {
  const year = new Date().getFullYear();
  if (year === 2025) return HOLIDAYS_2025;
  if (year === 2026) return HOLIDAYS_2026;
  return year > 2026 ? HOLIDAYS_2026 : HOLIDAYS_2025;
}
```

### Token Space Estimate

- **Actual size**: 3,321 bytes
- **Approximate tokens**: ~800-900 tokens (Chinese text compresses better, ~1 token per 3-4 bytes)
- **Content density**: 
  - 2025 holidays: 33 lines
  - 2026 holidays: 32 lines
  - Utility function: 12 lines

### IMPORTANT: NOT INJECTED

**The holiday knowledge is EXPORTED but NOT USED in system prompt:**

```bash
$ grep -r "getHolidayKnowledge" --include="*.js" | grep -v node_modules
# Result: Only 2 matches in holidays.js itself (definition + export)
# NOT imported or called anywhere in:
#   - prompts/system-prompt.js
#   - server.js
#   - agents/**
```

**Status**: ⚠️ Dead code / unused knowledge module

---

## 4. `tools/index.js` — Full Available Tools List

**Location**: `/tools/index.js` (68 lines)

### ALL_TOOLS Array (Line 15)

```javascript
const ALL_TOOLS = [
  webSearch,           // tools/web-search.js
  weather,             // tools/weather.js
  exchangeRate,        // tools/exchange-rate.js
  poiSearch,           // tools/poi-search.js
  flightSearch,        // tools/flight-search.js
  hotelSearch,         // tools/hotel-search.js
  destKnowledge,       // tools/dest-knowledge.js
  updateTripInfo       // tools/update-trip-info.js
];
```

### Complete Tool Definitions

| # | Tool Name | File | Description | Parameters | Returns |
|---|-----------|------|-------------|------------|---------|
| 1 | `web_search` | web-search.js | 搜索互联网获取最新信息（签证、景点、价格等）；优先官方来源 | `query` (string), `language` (default: zh-CN) | 搜索结果列表 + URLs |
| 2 | `get_weather` | weather.js | 查询指定城市在指定日期范围的天气（最多未来16天）；超16天返回气候参考 | `city` (string), `start_date` (YYYY-MM-DD), `end_date` (YYYY-MM-DD) | 预报/气候数据 + forecast[] |
| 3 | `get_exchange_rate` | exchange-rate.js | 查询实时汇率（如 JPY_CNY）；服务端缓存 | `from` (currency), `to` (currency) | 汇率 + 更新时间 |
| 4 | `search_poi` | poi-search.js | 搜索餐厅、景点等 POI（基于 Google Maps）；获取坐标、评分、类型 | `city` (string), `query` (string), `type` (optional: restaurant/attraction) | POI 列表 + 坐标、评分、地址 |
| 5 | `search_flights` | flight-search.js | 搜索机票报价（通常通过 delegate_to_agents 委派）；支持日期/航线 | `from_airport` (code), `to_airport` (code), `date` (YYYY-MM-DD), `passengers` (int) | 机票报价列表 |
| 6 | `search_hotels` | hotel-search.js | 搜索酒店价格 | `city` (string), `checkin` (YYYY-MM-DD), `checkout` (YYYY-MM-DD), `guests` (int) | 酒店列表 + 价格 |
| 7 | `cache_destination_knowledge` | dest-knowledge.js | 缓存目的地知识库（国家级/城市级）；按两级结构存储 | `destination` (string), `content` (markdown) | 确认 + 缓存 ID |
| 8 | `update_trip_info` | update-trip-info.js | 更新行程参考书（TripBook）；增量更新约束、行程、预算 | `constraints`, `phase`, `itinerary` (all optional, incremental) | 确认 + 更新摘要 |

### BONUS: `delegate_to_agents` (Not in ALL_TOOLS)

**Location**: `/agents/delegate.js` (lines 9-37)

| Param | Type | Description |
|-------|------|-------------|
| `tasks` | array | `[{ agent: "flight", task: "具体任务描述" }]` |
| `agent` enum | string | Only `"flight"` is valid |
| `task` | string | "出发城市及周边机场、目的地、日期及弹性范围、人数、航线背景" |

**Special Handling**: 
- NOT in standard tool registry (`toolMap`)
- Executed via `executeDelegation()` in `/agents/delegate.js`
- Results capped at **4,000 chars** per sub-agent (line 128, avoid inflating main context)
- Parallel execution with **120s timeout** per agent (line 49)
- Returns: `{ results: [{ agent, status, data/error }] }`

---

## 5. How System Prompt is Assembled (server.js)

**Location**: `/server.js` lines 177-178

```javascript
const systemPrompt = buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook);
```

**Flow:**
1. Server receives `/api/chat` request with `messages[]` and `tripBookSnapshot`
2. Creates fresh `TripBook` instance (line 140)
3. Syncs cached rates/weather to TripBook (lines 147-156)
4. Restores TripBook state from client snapshot (lines 161-175)
5. Calls `buildSystemPrompt()` from `/prompts/system-prompt.js` (line 178)
6. Passes to LLM along with messages

**System Prompt Components** (lines 19-150 in system-prompt.js):

```
1. Current Time (YYYY年MM月DD日 HH:MM)
2. Role Definition + Behavioral Guidelines
3. Progressive Planning Methodology
   ├── Phase 1: Lock constraints
   ├── Phase 2: Confirm flights
   ├── Phase 3: Build route + fill details
   └── Phase 4: Final summary
4. Tool Usage Strategy
   ├── delegate_to_agents for flights
   ├── Direct tools for everything else
   ├── Detailed guidelines for search_hotels, search_poi, cache_destination_knowledge
5. Cached Destination Knowledge (if any)
6. TripBook行程参考书 (if tripBook instance exists)
```

---

## 6. Key System Prompt Sections (Verbatim from system-prompt.js)

### Core Instructions

```
# 角色定义
你是一位专业的 AI 旅行规划助手。你通过对话帮助用户规划旅行行程，能调用工具获取实时信息，
也能委派机票搜索 Agent 执行穷尽式机票搜索。用中文回复。

## 行为准则
1. 遵循渐进式规划，不要一次性输出完整行程
2. 所有关键信息（价格、政策、时间）必须通过工具验证，不要编造
3. 引用信息时标注来源：[来源: 显示文字](URL)
4. 价格同时标注当地货币和人民币（用 get_exchange_rate 查询实时汇率）
5. 需要用户做选择时，用编号列表或表格展示对比，给出推荐
6. **严禁重复询问**：行程参考书中已确认的信息直接使用，不再追问
7. **职责边界**：只负责制定行程方案，不代替用户预订或支付。涉及预订的一律给出渠道/链接
```

### Segment Type Taxonomy (Line 135-142)

```
- `transport` — 交通（飞机/火车/地铁/出租/步行等）
- `attraction` — 景点游览
- `activity` — 体验活动（潜水、SPA、烹饪课等）
- `meal` — 餐饮（早/午/晚餐、下午茶等）
- `hotel` — 住宿（入住/退房）
- `flight` — 航班（起飞/降落）
```

---

## 7. TripBook Three-Layer Architecture

**From /models/trip-book.js (Lines 4-8, 23-58)**

```
Layer 1: 动态数据 (DynamicData)
  - knowledge{}          [destination keys with TTL]
  - weather{}            [city → {current, forecast, _meta}]
  - exchangeRates{}      [pair → {rate, last_updated, _meta}]
  - flightQuotes[]       [{id, route, airline, price_usd, price_cny, status}]
  - hotelQuotes[]        [{id, name, city, checkin, checkout, status}]
  - webSearches[]        [{query, summary, fetched_at}]

Layer 2: 用户约束 (UserConstraints)
  - destination          {value, cities[], confirmed, confirmed_at}
  - departCity           {value, airports[], confirmed, confirmed_at}
  - dates                {start, end, days, flexible, confirmed_at}
  - people               {count, details, confirmed, confirmed_at}
  - budget               {value, per_person, currency, scope, confirmed, confirmed_at}
  - preferences          {tags[], notes, confirmed, confirmed_at}
  - specialRequests[]    [{type, value, confirmed}]
  - _history[]           [audit trail of changes]

Layer 3: 结构化行程 (Itinerary)
  - phase                [0-7, with labels in PHASE_LABELS array]
  - phaseLabel           (auto-populated from PHASE_LABELS)
  - route[]              ["city1", "city2", "city3"]
  - days[]               [{day, date, city, title, segments[]}]
  - budgetSummary        {flights, hotels, meals, ..., total_cny, budget_cny}
  - reminders[]          [string array for pre-departure checklist]
  - practicalInfo[]      [{category, content, icon}]
```

**Critical Field**: `confirmed` flag
- When `AI.call(update_trip_info, { destination: { value: "...", confirmed: true } })`
- Defaults to `true` if omitted (line 148: `if (newVal.confirmed === undefined) { newVal.confirmed = true }`)
- Used by `buildConstraintsPromptSection()` to separate ✅ from ❓

---

## 8. Unused / Potential Dead Code

| File | Status | Note |
|------|--------|------|
| `prompts/knowledge/holidays.js` | ⚠️ NOT INJECTED | Exported but never imported/used; 3.3 KB of holiday tables for 2025-2026 that aren't in system prompt |
| `tools/cache_destination_knowledge` | ✅ USED | Called by AI when new destination encountered; cached results injected into next prompt |

---

## 9. Constraints & Limitations

### System Prompt Constraints

1. **Cached data TTL**:
   - Weather: 3 hours (TTL = 3 * 3600000 ms)
   - Exchange rates: 4 hours (TTL = 4 * 3600000 ms)
   - Web searches: no TTL, de-duplicated by query

2. **Sub-agent output cap**: 4,000 chars per agent result (line 128, delegate.js)

3. **Phase system**: 0-7 (8 phases total), labels in PHASE_LABELS array

4. **Tool availability**: Main agent has all 8 + delegate_to_agents; flight agent has only search_flights + get_exchange_rate

### Prompt Assembly Constraints

1. **No auto-injection of holidays**: Must explicitly call web_search for holiday info
2. **Destination knowledge cached per session**: Reused across turns within same TripBook instance
3. **Conversation text filtering**: If destination mentioned in conversation, cached knowledge re-injected (line 157)

---

## 10. Quick Reference: Tool Invocation Paths

```
Main Agent Toolset:
├── Delegate Path (flight searches only):
│   delegate_to_agents(tasks[{agent:"flight", task:"..."}])
│   └─→ Flight Agent (sub-agent-runner.js)
│       ├─ search_flights
│       └─ get_exchange_rate
│
└─ Direct Tools:
   ├─ web_search (Bing; with retry logic)
   ├─ get_weather (Open-Meteo; 16-day limit)
   ├─ get_exchange_rate (cached; server-side TTL)
   ├─ search_poi (Google Maps integration)
   ├─ search_hotels (hotel-search.js)
   ├─ cache_destination_knowledge (persistent per session)
   └─ update_trip_info (TripBook writer)
```

---

**End of Analysis**
