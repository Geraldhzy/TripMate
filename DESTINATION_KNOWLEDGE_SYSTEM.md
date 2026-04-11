# Destination Knowledge Caching System - Complete Analysis

## Overview

This AI Travel Planner has **two parallel knowledge management systems** for destination information:

1. **Hardcoded Knowledge Files** (`prompts/knowledge/`) - Static, baked into the codebase
2. **Dynamic Cache System** (`tools/dest-knowledge.js`) - Runtime, persisted to disk

---

## System 1: Hardcoded Knowledge Files

### Location
`prompts/knowledge/` directory

### Files
- `malaysia.js` - Malaysia destination knowledge (exported as string)
- `diving.js` - Diving activity knowledge (exported as string)
- `holidays.js` - China public holidays for current/next year
- `methodology.js` - Large multi-stage planning methodology guide

### How It Works

**Structure:** Each file exports a JavaScript module containing Markdown text strings.

```javascript
// Example: malaysia.js
module.exports = [
  '# 马来西亚旅行知识库',
  '## 基本国情',
  '首都吉隆坡，货币马来西亚林吉特(MYR)...',
  // ... more lines
].join('\n');
```

**Content Format:**
- Markdown text (headers, lists, tables)
- Includes: signatures, currency, language, best seasons, transportation, food, safety
- Time-sensitive data included but marked "⚠️ must verify via web_search"
- Costs approximately 2,500-12,000 tokens per file

**Injection Method:** Triggered by keyword detection in conversation

```javascript
// From system-prompt.js lines 117-127
if (text.includes('马来西亚') || text.includes('malaysia') || ...) {
  parts.push('\n---\n# 目的地知识库：马来西亚\n' + malaysiaKB);
}
```

**Triggers:**
- Malaysia KB: "马来西亚", "malaysia", "吉隆坡", "仙本那", "沙巴", "槟城", "兰卡威", "马六甲"
- Diving KB: "潜水", "diving", "padi", "考证", "ow", "诗巴丹", "sipadan"
- Holiday info: Always included (dynamic - picks current year)

**Advantages:**
- ✅ No network latency, instant available
- ✅ Version controlled in git
- ✅ Can be reviewed/updated by humans before deployment
- ✅ Reliable (no disk I/O failures)

**Disadvantages:**
- ❌ Fixed list - can't add new destinations without code changes
- ❌ Cannot be updated without redeployment
- ❌ Token overhead: Always included when keyword detected (even if not needed)

---

## System 2: Dynamic Destination Knowledge Cache

### File Location
`tools/dest-knowledge.js` (119 lines)

### Disk Storage
- **Path**: `data/dest-cache.json` (created at runtime if not exists)
- **Format**: JSON object with destination names as keys
- **Current Size**: ~20KB (7 destinations cached as of April 11, 2026)

### Cache Entry Structure

```javascript
{
  "destination_name": {
    "content": "# Markdown formatted knowledge...",
    "saved_at": 1775813140241  // Unix timestamp milliseconds
  },
  // ... more destinations
}
```

**Example from actual cache:**
```json
{
  "西欧法国意大利": {
    "content": "# 西欧（法国、意大利）旅行基础知识\n...",
    "saved_at": 1775812485890
  },
  "法国、意大利": {
    "content": "# 法国 & 意大利（申根区）旅游基础信息\n...",
    "saved_at": 1775813140241
  }
}
```

### Core Functions

#### 1. `execute({ destination, content })`
**Called by:** `cache_destination_knowledge` tool when AI uses it

**Flow:**
```javascript
async function execute({ destination, content }) {
  // Validate inputs
  if (!destination || !content) {
    return JSON.stringify({ error: '缺少必要参数' });
  }
  
  // Store in memory map
  destCache.set(destination, { content, saved_at: Date.now() });
  
  // Persist to disk
  saveCacheToDisk();
  
  // Return success
  return JSON.stringify({ 
    success: true, 
    destination, 
    message: `已缓存"${destination}"目的地知识库，后续对话将直接复用` 
  });
}
```

**Inputs:**
- `destination` (string): e.g., "日本", "西欧法国意大利", "法国巴黎"
- `content` (string): Markdown formatted knowledge

**Output:** JSON success message

#### 2. `getCachedDestKnowledge(destination)`
**Called by:** Internal code to retrieve specific destination

**Behavior:**
```javascript
function getCachedDestKnowledge(destination) {
  const entry = destCache.get(destination);
  if (!entry) return null;
  
  // TTL check: 30 days default
  if (Date.now() - entry.saved_at > CACHE_TTL) {
    destCache.delete(destination);
    return null;
  }
  
  return entry;  // { content: "...", saved_at: 1234567890 }
}
```

#### 3. `getAllCachedDests()`
**Called by:** `system-prompt.js` to inject all valid cached destinations

**Returns:** Array of active (non-expired) cache entries

```javascript
function getAllCachedDests() {
  const now = Date.now();
  const result = [];
  
  for (const [dest, entry] of destCache) {
    if (now - entry.saved_at <= CACHE_TTL) {
      result.push({ destination: dest, ...entry });
    } else {
      destCache.delete(dest);  // Clean expired
    }
  }
  
  return result;
}
```

**Output:**
```javascript
[
  { 
    destination: "日本", 
    content: "# 日本旅游知识库\n...", 
    saved_at: 1775815481672 
  },
  // ... more destinations
]
```

### Disk I/O Functions

#### 4. `loadCacheFromDisk()`
**Called at:** Server startup (via `initCache()`)

**Flow:**
```javascript
function loadCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;  // File doesn't exist yet
    
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const entries = JSON.parse(raw);  // JSON → Object
    const now = Date.now();
    
    for (const [dest, entry] of Object.entries(entries)) {
      // TTL filter: only load non-expired
      if (entry.saved_at && (now - entry.saved_at) <= CACHE_TTL) {
        destCache.set(dest, entry);  // Load to memory Map
      }
    }
    
    console.log(`  📚 已加载 ${destCache.size} 条目的地知识缓存`);
  } catch (err) {
    console.warn('  ⚠️ 加载目的地知识缓存失败:', err.message);
  }
}
```

#### 5. `saveCacheToDisk()`
**Called on:** Every cache write (after `execute()`)

**Flow:**
```javascript
function saveCacheToDisk() {
  try {
    // Create data/ directory if missing
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Convert memory Map to plain Object
    const obj = {};
    for (const [dest, entry] of destCache) {
      obj[dest] = entry;
    }
    
    // Write JSON file (pretty-printed)
    fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.warn('  ⚠️ 保存目的地知识缓存失败:', err.message);
  }
}
```

#### 6. `initCache()`
**Called at:** Server startup (in `server.js`)

```javascript
const { initCache: initDestCache } = require('./tools/dest-knowledge');
// ... later ...
initDestCache();  // Load cache from disk
```

**Simply calls:** `loadCacheFromDisk()`

### TTL (Time-To-Live)

```javascript
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days in milliseconds
```

**Logic:**
- Cache entries expire after 30 days of inactivity
- On `loadCacheFromDisk()`: skip expired entries
- On `getAllCachedDests()`: filter out and delete expired entries
- No automatic cleanup job; expiration only checked on load/inject

---

## System 3: Tool Definition & Integration

### Tool Definition
**File:** `tools/dest-knowledge.js` lines 15-38

```javascript
const TOOL_DEF = {
  name: 'cache_destination_knowledge',
  description: [
    '将目的地基础信息保存为知识库缓存，供本次及后续对话复用，避免重复搜索。',
    '调用时机：对话中出现新目的地（国家/城市），且系统提示中尚无该目的地的知识库时。',
    '调用前请先通过 web_search 搜集关键信息，再整理成结构化内容调用本工具保存。',
    // ... more instructions
  ].join(''),
  parameters: {
    type: 'object',
    properties: {
      destination: {
        type: 'string',
        description: '目的地名称，用中文简洁表达，如"日本"、"泰国"、"新加坡"'
      },
      content: {
        type: 'string',
        description: '结构化目的地知识，Markdown格式'
      }
    },
    required: ['destination', 'content']
  }
};
```

### Tool Registration
**File:** `tools/index.js` lines 1-13

```javascript
const destKnowledge = require('./dest-knowledge');
const ALL_TOOLS = [
  webSearch, 
  weather, 
  exchangeRate, 
  poiSearch, 
  flightSearch, 
  hotelSearch, 
  destKnowledge,        // ← Registered here
  updateTripInfo
];
```

**Exported for both OpenAI and Anthropic formats**

### Tool Invocation Instructions
**From:** `prompts/system-prompt.js` lines 92-99

```javascript
// ── 目的地知识库自动构建规则 ────────────────────────────
当用户提到一个目的地（国家/城市），且系统提示中**尚无该目的地的知识库**时，必须：
1. 并行调用 web_search 搜索以下信息（2-3次搜索即可覆盖）：
   - 中国护照签证政策（免签/落地签/需提前申请）
   - 官方货币、当地交通概况、最佳旅游季节
   - 入境注意事项、当地支付方式
2. 整理为结构化 Markdown 后调用 cache_destination_knowledge 保存
3. 之后直接使用缓存内容，**不再重复搜索同一目的地的基础信息**
```

---

## System Integration: How They Work Together

### Sequence Flow

```
User Mentions New Destination
    ↓
System Prompt Checks: Is it in hardcoded KB or cached KB?
    ├─ YES: Inject that knowledge into system prompt
    └─ NO: Trigger AI to search & cache
    ↓
AI Calls web_search (2-3 times)
    ↓
AI Calls cache_destination_knowledge with destination + content
    ↓
Tool execute() stores in memory + saveCacheToDisk()
    ↓
JSON written to data/dest-cache.json
    ↓
Next Conversation (same or different session)
    ├─ Startup: loadCacheFromDisk() → memory Map
    └─ On prompt build: getAllCachedDests() → inject if mentioned
```

### Injection Logic
**From:** `prompts/system-prompt.js` lines 129-143

```javascript
// ── 注入缓存的目的地知识库 ──
const cachedDests = getAllCachedDests();
if (cachedDests.length > 0) {
  // Avoid duplicate with hardcoded KB
  const hardcodedDests = ['马来西亚'];
  
  for (const entry of cachedDests) {
    if (hardcodedDests.includes(entry.destination)) continue;  // Skip Malaysia
    
    // Only inject if mentioned in conversation
    if (!text.includes(entry.destination.toLowerCase())) continue;
    
    // Add age label
    const age = Date.now() - entry.saved_at;
    const daysAgo = Math.floor(age / (24 * 60 * 60 * 1000));
    const freshLabel = daysAgo === 0 ? '今日缓存' : `${daysAgo}天前缓存`;
    
    // Inject into system prompt
    parts.push(
      `\n---\n# 目的地知识库：${entry.destination}（${freshLabel}）\n` +
      `以下为参考信息，时效性信息需通过工具验证。\n` +
      `${entry.content}`
    );
  }
}
```

**Key Behaviors:**
1. **Deduplication:** Malaysia hardcoded KB takes priority over cached (line 135)
2. **Smart Injection:** Only inject if destination mentioned in conversation (line 137)
3. **Age Labeling:** Shows how old the cache is (line 139-141)
4. **Context Aware:** Each session can have different cached knowledge injected based on conversation

---

## Key Differences Comparison

| Aspect | Hardcoded Files | Dynamic Cache |
|--------|-----------------|---------------|
| **Location** | `prompts/knowledge/*.js` | `data/dest-cache.json` |
| **Storage** | Source code (git tracked) | Disk file (gitignored) |
| **Memory** | Loaded once on startup | Loaded once on startup |
| **Scope** | Static for all sessions | Per-instance, persistent across restarts |
| **TTL** | N/A (permanent) | 30 days |
| **Update Mechanism** | Code deployment | Tool execution (`cache_destination_knowledge`) |
| **Add New Destination** | Redeploy code | Run tool (immediate) |
| **Format** | JS module exports | JSON |
| **Content Size** | Large (~11KB methodology) | Flexible, per-entry |
| **Access Pattern** | Text search trigger | Explicit function calls |
| **Tool Support** | N/A (not a tool) | `cache_destination_knowledge` tool |
| **Cost (tokens)** | Injected every relevant conversation | Injected only when needed |
| **Deduplication** | Hardcoded list check | Checks `hardcodedDests` array |

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER CONVERSATION                        │
└────────────────────────┬────────────────────────────────────┘
                         │ "I want to visit Japan and France"
                         ↓
         ┌───────────────────────────────┐
         │ buildSystemPrompt()           │
         │ system-prompt.js              │
         └───────┬───────────────────────┘
                 │
         ┌───────▼─────────────────────┐
         │ Check conversation text     │
         │ for destination keywords    │
         └───────┬───────────────────────┘
                 │
         ┌───────▼─────────────────────────────────────┐
         │ Is destination in hardcoded KB?             │
         │ ("马来西亚", "潜水", etc.)                  │
         │ YES → Inject hardcoded content              │
         └─────────────────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ Call getAllCachedDests()                     │
         │ (from tools/dest-knowledge.js)               │
         └───────┬────────────┬─────────────────────────┘
                 │            │
                 │            └─→ Filter by TTL (30 days)
                 │
         ┌───────▼──────────────────────────────────────┐
         │ For each cached destination:                 │
         │ - Check if mentioned in conversation         │
         │ - Skip if in hardcodedDests list             │
         │ - Inject with age label                      │
         └──────────────────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ System Prompt Built                          │
         │ (hardcoded + cached + metadata)              │
         └──────────────────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ AI Analyzes conversation                     │
         │ + Available knowledge                        │
         │ + Available tools                            │
         └──────────────────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ New destination not in any KB?               │
         │ (e.g., "South Korea", "Vietnam", etc.)      │
         │ YES → Call web_search 2-3 times             │
         └───────┬──────────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ AI Structures Results into Markdown          │
         │ - Visa info                                  │
         │ - Currency & exchange rates                  │
         │ - Best seasons                               │
         │ - Transportation                             │
         │ - etc.                                       │
         └───────┬──────────────────────────────────────┘
                 │
         ┌───────▼────────────────────────────────────────┐
         │ AI Calls cache_destination_knowledge tool:   │
         │ {                                              │
         │   destination: "韩国",                         │
         │   content: "# 韩国旅行知识库\n..."            │
         │ }                                              │
         └───────┬────────────────────────────────────────┘
                 │
         ┌───────▼───────────────────────────────────┐
         │ execute() in dest-knowledge.js:           │
         │ 1. destCache.set(destination, entry)     │
         │ 2. saveCacheToDisk()                      │
         └───────┬───────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ saveCacheToDisk():                           │
         │ 1. Create data/ dir if missing               │
         │ 2. Convert Map to Object                     │
         │ 3. fs.writeFileSync(data/dest-cache.json)   │
         └──────────────────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ File: data/dest-cache.json                   │
         │ {                                             │
         │   "韩国": {                                   │
         │     "content": "# 韩国...",                  │
         │     "saved_at": 1775920603025               │
         │   },                                          │
         │   ... previous entries ...                   │
         │ }                                             │
         └──────────────────────────────────────────────┘
                 │
         ┌───────▼──────────────────────────────────────┐
         │ Next Conversation (same or different user):  │
         │ 1. Server startup: initCache()               │
         │ 2. loadCacheFromDisk()                       │
         │ 3. destCache = Map with all non-expired     │
         │ 4. Build system prompt                       │
         │ 5. If "韩국" mentioned → inject cache       │
         └──────────────────────────────────────────────┘
```

---

## Implementation Details

### Memory Structure
```javascript
// In-memory cache (JavaScript Map)
const destCache = new Map();

// Example after loading:
destCache = Map(7) {
  '西欧法国意大利' → { content: '# 西欧...', saved_at: 1775812485890 },
  '法国、意大利' → { content: '# 法国...', saved_at: 1775813140241 },
  '法国意大利西欧' → { content: '# 法国&意大利...', saved_at: 1775813676564 },
  '法国巴黎' → { content: '# 巴黎...', saved_at: 1775813883898 },
  '意大利罗马' → { content: '# 罗马...', saved_at: 1775813883902 },
  '日本' → { content: '# 日本旅游知识库\n...', saved_at: 1775815481672 },
  '土耳其' → { content: '# 土耳其旅游...', saved_at: 1775914230230 },
  '泰国' → { content: '# 泰国旅行...', saved_at: 1775920603025 }
}
```

### Disk Structure
```
ai-travel-planner/
├── data/
│   └── dest-cache.json          ← Cached destination knowledge (20KB)
├── prompts/
│   ├── knowledge/
│   │   ├── malaysia.js          ← Hardcoded: Malaysia
│   │   ├── diving.js            ← Hardcoded: Diving activities
│   │   ├── holidays.js          ← Hardcoded: Chinese holidays
│   │   └── methodology.js       ← Hardcoded: Planning methodology
│   └── system-prompt.js         ← Assembler that injects all knowledge
├── tools/
│   ├── dest-knowledge.js        ← Cache manager + tool definition
│   └── index.js                 ← Tool registry
└── server.js                    ← Initializes cache on startup
```

---

## Real-World Example: France Cache Entry

When user says: "I want to visit France and bungee jump"

1. **Conversation:** `"I want to visit France and bungee jump"`
2. **System Prompt Check:**
   - "france" not in hardcoded KB keywords ❌
   - Check cached: Look for entries containing "france" or "法国"
   - Found: "法国巴黎" (cached 4/11/2026 14:31:23 UTC)
   - Found: "法国、意大利" (cached 4/11/2026 13:12:20 UTC)
3. **Injection:**
   ```markdown
   ---
   # 目的地知识库：法国巴黎（1天前缓存）
   以下为参考信息，时效性信息需通过工具验证。
   # 巴黎旅行基础信息
   ## 签证
   - **中国护照**：需要申根签证（Schengen Visa）...
   ...
   ```

4. **AI Analysis:**
   - "Bungee jump" not in any KB knowledge
   - Must call web_search for bungee jumping in France
   - Then cache if decision made to include it

5. **If Cached Later:**
   ```json
   {
     "法国蹦极跳": {
       "content": "# 法国蹦极跳活动指南\n...",
       "saved_at": 1726543210000
     }
   }
   ```

---

## Safety & Error Handling

### Error Handling in Implementation

```javascript
// loadCacheFromDisk() errors
try {
  if (!fs.existsSync(CACHE_FILE)) return;  // Silent - file not yet created
  const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
  const entries = JSON.parse(raw);  // Could fail on corrupted JSON
  // ... validation and TTL filtering ...
} catch (err) {
  console.warn('  ⚠️ 加载目的地知识缓存失败:', err.message);
  // Graceful degradation: continue without cache
}

// saveCacheToDisk() errors
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
} catch (err) {
  console.warn('  ⚠️ 保存目的地知识缓存失败:', err.message);
  // Continues - next save may succeed
}
```

**Strategy:** Fail gracefully - cache unavailability doesn't break the application

### TTL Expiration Strategy

```javascript
// No automatic cleanup job
// Expiration only checked at:
// 1. loadCacheFromDisk() - on server startup
// 2. getAllCachedDests() - when building system prompt
// Result: Stale entries cleaned on next use after 30 days
```

---

## Performance Characteristics

### Memory Usage
- Per destination: ~200-500 bytes (depends on content length)
- Current (7 destinations): ~25-50 KB in memory
- All cached destinations loaded into memory on startup

### Disk I/O
- **Read:** Once at server startup (blocking, ~5ms for 20KB file)
- **Write:** After each cache_destination_knowledge call (blocking, ~10ms)
- **Path:** `data/dest-cache.json`

### System Prompt Size Impact
- Each cached destination: +500-2000 tokens (depending on content)
- Only injected if: (1) destination mentioned in conversation, (2) not in hardcoded list
- Current ~7 destinations: each conversation could add 3.5-14K tokens if all mentioned

---

## Workflow: AI's Decision Tree

```
NEW DESTINATION MENTIONED?
├─ YES: "I want to visit South Korea"
│   │
│   ├─ Check hardcoded KB? (Malaysia, Diving)
│   │   └─ No match
│   │
│   ├─ Check cache getAllCachedDests()?
│   │   └─ No match (or expired)
│   │
│   ├─ Decision: Must search
│   │   │
│   │   ├─ Call web_search 2-3 times:
│   │   │   - "China passport South Korea visa requirements 2026"
│   │   │   - "South Korea currency transport best season 2026"
│   │   │   - "Seoul transportation payment methods entry tips"
│   │   │
│   │   ├─ Synthesize results into Markdown
│   │   │
│   │   └─ Call cache_destination_knowledge
│   │       ├─ destination: "韩国"
│   │       └─ content: "# 韩国旅行知识库\n... [structured]"
│   │
│   └─ Tool execute():
│       ├─ destCache.set("韩国", { content, saved_at: now })
│       ├─ saveCacheToDisk()
│       └─ Return success
│
├─ NO: Same destination mentioned again
│   │
│   ├─ Check hardcoded? No
│   │
│   ├─ Check cache?
│   │   └─ YES: getAllCachedDests() returns it
│   │
│   ├─ Build system prompt with cached knowledge
│   │   └─ Skip web_search! (avoid redundant searches)
│   │
│   └─ Continue planning with injected cache
│
└─ Next session (server restart)
    ├─ initCache()
    ├─ loadCacheFromDisk()
    │   └─ Restore "韩国" and others to destCache Map
    │
    ├─ When user mentions "한국":
    │   └─ Same cache available (unless >30 days old)
    │
    └─ Zero overhead for repeated destinations
```

---

## Summary: Key Takeaways

### Hardcoded Knowledge (`prompts/knowledge/`)
- **When used:** Keyword detected in conversation
- **TTL:** Permanent (part of source code)
- **Update:** Requires code deployment
- **Format:** JavaScript modules exporting Markdown strings
- **Examples:** Malaysia, Diving, Holidays, Methodology
- **Cost:** Always injected when keyword matched

### Dynamic Cache (`data/dest-cache.json`)
- **When used:** Tool execution by AI + intelligent injection
- **TTL:** 30 days from save time
- **Update:** Immediate via `cache_destination_knowledge` tool
- **Format:** JSON with destination → (content, timestamp)
- **Storage:** Persistent disk file + in-memory Map
- **Cost:** Only injected when destination mentioned

### Integration
- **Deduplication:** Hardcoded list prevents cache from overriding
- **Smart Injection:** Only adds relevant cached destinations to prompt
- **Persistence:** Survives server restarts
- **Lazy Loading:** Loaded once at startup, used throughout session
- **Error Resilience:** Graceful degradation if disk I/O fails
- **No Cleanup Job:** Expiration only checked on load/inject

### Typical Flow
1. User mentions destination
2. Check hardcoded KB (fast, always available)
3. Check cache (fast, might be expired)
4. If neither: AI searches web, caches result
5. Future mention: Skip search, use cache (within 30 days)
6. Server restart: Reload cache from disk automatically
