# Conversation History & TripBook Data Flow Analysis

## Executive Summary

This AI Travel Planner has a **dual-layer persistence system**:

1. **Conversation History**: Stored in `localStorage` as complete message sequences (user + assistant turns)
2. **TripBook State**: Stored in `sessionStorage` during active conversation, NOT persisted to localStorage for historical trips

This creates an interesting asymmetry: conversations can be restored with full chat history, but the TripBook state at the time of saving is LOST when the page reloads.

---

## Part 1: Conversation History Persistence

### 1.1 How Conversations are Saved

**Location**: `public/js/chat.js` - `saveTripSnapshot()` function (lines 647-672)

**Storage Mechanism**: `localStorage` under key `tp_trips`

**What Gets Saved**:
```javascript
{
  id: 'trip_' + timestamp + '_' + randomSuffix,
  title: firstUserMessage.substring(0, 24),
  createdAt: timestamp,
  updatedAt: timestamp,
  messages: [...chatHistory]  // Full message array
}
```

**When It Gets Saved**:
1. **Auto-save after each AI response** (line 217 in `streamChat()`)
   - Triggers after `tripbook_update` SSE events are processed
2. **Manual save on page unload** (line 982)
   - `window.addEventListener('beforeunload', () => saveTripSnapshot())`
3. **Manual save on "New Chat"** (line 836)
   - Saves current before clearing

**Data Stored in Each Message**:
```javascript
// In chatHistory array:
{ role: 'user', content: 'user message text' }
{ role: 'assistant', content: 'full markdown response' }
```

---

### 1.2 How Conversations are Loaded

**Location**: `public/js/chat.js` - `loadTripById()` function (lines 686-695)

**Flow**:
1. User clicks a trip card in history panel
2. `loadTripById(tripId)` reads from `localStorage`
3. Restores `chatHistory` array
4. Calls `restoreChatUI()` to re-render all messages

**Restoration Logic** (lines 697-718):
- Iterates through `chatHistory` array
- For each user message: creates a simple div with text (NO streaming, NO SSE)
- For each assistant message: renders markdown and appends to chat area
- Scrolls to bottom

**Key Limitation**: Historical messages are displayed as **static, pre-rendered text**. No tool execution status, no SSE streaming visualization, just the final rendered Markdown.

---

## Part 2: TripBook State Management

### 2.1 TripBook Creation on Each Request

**Location**: `server.js` - `/api/chat` route (lines 22-131)

**Server-Side Flow**:

```
Request arrives with:
  - messages: chatHistory array
  - tripBookSnapshot: (optional) from sessionStorage
  
↓

1. Create NEW TripBook instance each request (line 51):
   const tripBook = new TripBook()

2. Restore from snapshot if provided (lines 95-102):
   if (tripBookSnapshot) {
     tripBook.updateConstraints(snapshot.constraints)
     tripBook.updateItinerary(snapshot.itinerary)
     tripBook.addKnowledgeRef(snapshot.knowledgeRefs)
   }

3. Merge cached rates + weather from client (lines 53-92)

4. AI processes conversation with injected TripBook context

5. AI calls update_trip_info tool → runTool() updates TripBook

6. SSE sends tripbook_update event with toPanelData()
```

### 2.2 TripBook Data Structure

**Location**: `models/trip-book.js`

**Four Layers**:

```javascript
class TripBook {
  // Layer 1: Static Knowledge (cross-trip)
  knowledgeRefs: []      // ["日本", "泰国"]
  activityRefs: []       // ["潜水"]

  // Layer 2: Dynamic Data (TTL-based)
  dynamic: {
    weather: {},         // { "tokyo": {city, current, forecast, _meta} }
    exchangeRates: {},   // { "JPY_CNY": {from, to, rate, _meta} }
    flightQuotes: [],    // [{id, route, airline, price_usd, ...}]
    hotelQuotes: [],     // [{id, name, city, checkin, ...}]
    webSearches: []      // [{query, summary, fetched_at}]
  }

  // Layer 3: User Constraints (confirmed by AI)
  constraints: {
    destination: {value, cities[], confirmed, confirmed_at}
    departCity: {value, airports[], confirmed, confirmed_at}
    dates: {start, end, days, flexible, confirmed}
    people: {count, details, confirmed}
    budget: {value, per_person, currency, confirmed}
    preferences: {tags[], notes, confirmed}
    _history: [] // Change audit trail
  }

  // Layer 4: Structured Itinerary
  itinerary: {
    phase: 0-7,
    route: ["东京", "京都", "大阪"],
    days: [{day, date, city, title, segments[]}],
    budgetSummary: {flights, hotels, total_cny, budget_cny},
    reminders: []
  }
}
```

---

## Part 3: Frontend Data Flow

### 3.1 TripBook Snapshot in Session Storage

**Storage Mechanism**: `sessionStorage` (NOT persistent across page reloads)

**Key**: `tp_tripbook`

**When Stored** (line 317 in `chat.js`):
```javascript
// On receiving 'tripbook_update' SSE event
case 'tripbook_update':
  if (typeof updateFromTripBook === 'function') updateFromTripBook(data);
  // ↓ Save to sessionStorage
  try { sessionStorage.setItem('tp_tripbook', JSON.stringify(data)); } catch {}
  break;
```

**When Restored** (lines 148-150 in `chat.js`):
```javascript
// Before sending next request
const tripBookSnapshot = sessionStorage.getItem('tp_tripbook');
if (tripBookSnapshot) bodyPayload.tripBookSnapshot = JSON.parse(tripBookSnapshot);
```

**Data Format** (from `trip-book.js` - `toPanelData()` method):
```javascript
{
  destination: "日本 东京·京都·大阪",
  departCity: "北京",
  dates: "2024-05-01 ~ 2024-05-07",
  days: 7,
  people: 2,
  budget: "¥20000",
  preferences: ["文化", "美食", "购物"],
  phase: 3,
  phaseLabel: "完善细节",
  route: ["东京", "京都", "大阪"],
  flights: [{route, airline, price, time, status}],
  hotels: [{name, city, price, nights, status}],
  weather: {city, temp_c, description},
  daysPlan: [{day, date, city, title, segments[]}],
  budgetSummary: {flights, hotels, total_cny, budget_cny}
}
```

### 3.2 SSE Events for Updates

**Location**: Server sends events (lines 45-47 in `server.js`)

**Key Events**:

| Event | Source | Usage |
|-------|--------|-------|
| `token` | AI streaming | Append text to bubble |
| `tool_start` | Tool execution | Show loading spinner |
| `tool_result` | Tool completion | Mark tool done ✅ |
| `rate_cached` | get_exchange_rate | Save to localStorage rate cache |
| `weather_cached` | get_weather | Save to localStorage weather cache |
| `tripbook_update` | update_trip_info | Update panel + save to sessionStorage |
| `quick_replies` | AI analysis | Render choice buttons |
| `error` | Any error | Display error message |
| `done` | Stream complete | Cleanup spinners |

---

## Part 4: Caching Layers

### 4.1 Exchange Rate Cache

**Storage**: `localStorage` under key `tp_rate_cache`

**TTL**: 4 hours

**Flow**:
1. Tool `get_exchange_rate` called → rate fetched from external API
2. Server sends `rate_cached` event
3. Frontend saves to localStorage (line 590)
4. Next request: `getFreshRates()` includes cached rates in request body
5. Server merges client cache + server cache (server preferred)

**Code** (lines 573-597):
```javascript
function saveRateToCache(rateData) {
  const cache = loadRateCache();
  const key = `${rateData.from}_${rateData.to}`;
  cache[key] = { ...rateData, fetched_at: Date.now() };
  localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache));
}

function getFreshRates() {
  const now = Date.now();
  const cache = loadRateCache();
  return Object.values(cache).filter(r => (now - r.fetched_at) < RATE_TTL);
}
```

### 4.2 Weather Cache

**Storage**: `localStorage` under key `tp_weather_cache`

**TTL**: 3 hours

**Key Difference**: Weather is stored client-side for reference, but NOT auto-injected into new conversations to avoid stale data (line 90-92 in `server.js`):
```javascript
// 注意：不将客户端缓存的天气自动注入 TripBook，避免旧行程天气（如清迈）
// 污染新行程面板。天气仍通过 knownWeather 注入系统提示防止重复查询
```

---

## Part 5: The Critical Asymmetry

### The Problem

**When loading a historical conversation:**

1. ✅ Conversation messages ARE restored
2. ✅ Markdown text is rendered
3. ❌ **TripBook state is NOT restored**
4. ❌ **Itinerary panel starts empty**

**Why**:
- Conversations stored in: `localStorage` (persistent)
- TripBook state stored in: `sessionStorage` (ephemeral)
- Historical trips don't have associated TripBook snapshots

### Example Scenario

1. User creates trip "日本7天"
2. Conversation evolves, TripBook state updates in sessionStorage
3. User closes browser → sessionStorage cleared ❌
4. User reopens, loads "日本7天" from history
5. Chat messages appear ✅, but itinerary panel shows "开始对话后，行程信息将在这里汇总" ❌

---

## Part 6: How to Restore TripBook State for Historical Conversations

### Current Missing Piece

To fix the asymmetry, we would need:

```javascript
// In chat.js - trip object structure
{
  id: 'trip_xxx',
  title: '...',
  messages: [...],
  // ADD THIS:
  tripBookSnapshot: {  // Latest TripBook state from last interaction
    constraints: {...},
    itinerary: {...},
    knowledgeRefs: [...]
  }
}
```

### Implementation Points

**Server-side** (`server.js`):
- On `update_trip_info` tool call, emit `tripbook_snapshot` SSE event
- Include full TripBook state

**Frontend** (`chat.js`):
- Capture `tripbook_snapshot` SSE events
- Store latest TripBook in `currentTripSnapshot` variable
- Include in `saveTripSnapshot()` when persisting to localStorage

**Restoration** (`chat.js`):
- `loadTripById()` should check for `trip.tripBookSnapshot`
- If present, restore to sessionStorage
- Call `updateFromTripBook()` to render itinerary panel

---

## Part 7: Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER SENDS MESSAGE                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  Add to chatHistory[]                 │
        │  Display in UI                        │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────────────┐
        │  POST /api/chat {                            │
        │    messages: chatHistory,                    │
        │    knownRates: getFreshRates(),             │
        │    knownWeather: getFreshWeather(),         │
        │    tripBookSnapshot: from sessionStorage    │
        │  }                                           │
        └──────────────┬───────────────────────────────┘
                       │
                       ▼ (SERVER)
        ┌──────────────────────────────────────────────┐
        │  new TripBook()                              │
        │  if (snapshot) restore from client           │
        │  merge cached rates/weather                  │
        │  AI processes with TripBook injected context │
        └──────────────┬───────────────────────────────┘
                       │
        ┌──────────────┴───────────┬──────────────────┐
        │                          │                  │
        ▼                          ▼                  ▼
    Token Stream            Tool Execution      TripBook Update
        │                          │                  │
    ┌───┴────┐              ┌──────┴────────┐      ┌─┴──────────┐
    │ send   │              │ runTool()     │      │ emit SSE   │
    │ 'token'│              │ updates       │      │ 'tripbook_ │
    │ events │              │ TripBook      │      │  update'   │
    └───┬────┘              └──────┬────────┘      └─┬──────────┘
        │                          │                 │
        ▼ (FRONTEND/JavaScript)    ▼                 ▼
    Render to              ┌──────────────┐    Save to sessionStorage
    bubble + scroll        │ send         │    & update panel
                           │ 'rate_cached'│
                           │ 'weather_    │
                           │  cached'     │
                           └──────┬───────┘
                                  │
                                  ▼
                           Save to localStorage
                           (rate/weather caches)
                                  │
                                  ▼
                        ┌─────────────────────┐
                        │ Stream completes    │
                        │ Call saveTripSnapshot()
                        │ Add to tp_trips     │
                        │ in localStorage     │
                        └─────────────────────┘
```

---

## Part 8: Storage Keys Reference

| Key | Storage | Scope | TTL | Contains |
|-----|---------|-------|-----|----------|
| `tp_trips` | localStorage | Persistent | N/A | All conversation histories [{id, title, messages[], createdAt, updatedAt}] |
| `tp_tripbook` | sessionStorage | Session | Session end | Latest TripBook panel data (NOT in historical trips) |
| `tp_rate_cache` | localStorage | Persistent | 4h | Exchange rates {from_to: {from, to, rate, fetched_at}} |
| `tp_weather_cache` | localStorage | Persistent | 3h | Weather {city: {city, current, forecast, fetched_at}} |
| `tp_provider` | localStorage | Persistent | N/A | Selected AI provider (openai/anthropic/deepseek) |
| `tp_model` | localStorage | Persistent | N/A | Selected model name |
| `tp_apiKey` | localStorage | Persistent | N/A | API key (local only, not uploaded) |
| `tp_baseUrl` | localStorage | Persistent | N/A | Custom base URL for API proxy |

---

## Part 9: Tool Execution Flow

### update_trip_info Tool (Critical for TripBook)

**Location**: `tools/update-trip-info.js`

**Called by**: AI when confirming constraints or building itinerary

**Server Processing** (server.js lines 258-271):
```javascript
if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
  const updates = parsed.updates;
  if (updates.constraints) {
    tripBook.updateConstraints(updates.constraints);
  }
  if (updates.phase !== undefined) {
    tripBook.updatePhase(updates.phase);
  }
  if (updates.itinerary) {
    tripBook.updateItinerary(updates.itinerary);
  }
  // ↓ Push complete TripBook state to client
  sendSSE('tripbook_update', tripBook.toPanelData());
}
```

**Front-end Processing** (chat.js lines 313-318):
```javascript
case 'tripbook_update':
  if (typeof updateFromTripBook === 'function') updateFromTripBook(data);
  // ↓ Save current state for next request
  try { sessionStorage.setItem('tp_tripbook', JSON.stringify(data)); } catch {}
  break;
```

---

## Part 10: Summary Table

### Conversation Persistence
| Aspect | Implementation | Behavior |
|--------|-----------------|----------|
| **Storage Location** | localStorage under `tp_trips` key | Survives page reload ✅ |
| **Data Format** | Array of trip objects with full message history | Can load and display past conversations ✅ |
| **Save Trigger** | Auto-save after each AI response, manual on unload | Continuous archiving ✅ |
| **Restore** | `loadTripById()` reads from localStorage | Messages appear as static text ✅ |
| **UI State** | No tool spinners, no streaming animation | Historical conversations are "replayed" as final text |

### TripBook Persistence
| Aspect | Implementation | Behavior |
|--------|-----------------|----------|
| **Storage Location** | sessionStorage under `tp_tripbook` key (within same conversation) | Lost on reload ❌ |
| **Data Format** | Flattened `toPanelData()` output for panel rendering | Used for current itinerary panel ✅ |
| **Save Trigger** | Auto-save to sessionStorage on SSE `tripbook_update` event | Updates during active conversation ✅ |
| **Restore** | Passed in request body for next AI call | Full TripBook reconstructed server-side ✅ |
| **Historical Trips** | NOT saved with conversation history | Itinerary panel empty when loading old conversations ❌ |

---

## Recommendations

1. **Store TripBook with Each Trip**: Save `tripBookSnapshot` in each trip record in localStorage
2. **Restore on Load**: When loading historical trip, restore TripBook to sessionStorage + render panel
3. **Versioning**: Include schema version in stored snapshots for future compatibility
4. **Compression**: Consider compressing large TripBook snapshots before storing in localStorage (size limit ~5-10MB per browser)

