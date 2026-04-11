# Destination Knowledge Caching - Quick Reference

## Two Systems at a Glance

### 🔧 System 1: Hardcoded Knowledge Files
```
Location:        prompts/knowledge/
Storage:         JavaScript modules (git tracked)
Files:           malaysia.js, diving.js, holidays.js, methodology.js
TTL:             ∞ (permanent)
Update Method:   Code deployment (redeploy required)
Trigger:         Keyword detection in conversation
Token Cost:      Always included when triggered
Example:         text.includes('马来西亚') → inject Malaysia KB
```

### 💾 System 2: Dynamic Cache
```
Location:        data/dest-cache.json (created at runtime)
Storage:         JSON file (persistent, gitignored)
Format:          { "destination": { "content": "...", "saved_at": timestamp } }
TTL:             30 days
Update Method:   cache_destination_knowledge tool (immediate)
Trigger:         AI tool execution + smart injection
Token Cost:      Only if destination mentioned in conversation
Example:         AI calls tool → saves to JSON → reused forever (30 days)
```

---

## File Structure

```
tools/dest-knowledge.js (119 lines)
├── TOOL_DEF                    ← Tool definition for cache_destination_knowledge
├── execute()                   ← Called when AI uses the tool
│   └─→ destCache.set()
│   └─→ saveCacheToDisk()
├── getCachedDestKnowledge()    ← Retrieve single destination
├── getAllCachedDests()         ← Get all non-expired for injection
├── loadCacheFromDisk()         ← Called at startup
├── saveCacheToDisk()           ← Called after each cache write
└── initCache()                 ← Entry point (called from server.js)

prompts/system-prompt.js
├── Check hardcoded KB first (malaysia, diving)
├── Call getAllCachedDests()
├── Smart inject: only if mentioned + not hardcoded
└── Add age label (today/Xdays ago)
```

---

## Cache Entry Example

```json
{
  "日本": {
    "content": "# 日本旅游知识库\n## 签证政策\n...",
    "saved_at": 1775815481672
  },
  "法国巴黎": {
    "content": "# 巴黎旅行基础信息\n## 签证\n...",
    "saved_at": 1775813883898
  }
}
```

---

## Key Functions Map

| Function | Location | Called By | Purpose |
|----------|----------|-----------|---------|
| `execute()` | dest-knowledge.js | Tool system | Save destination to cache |
| `getAllCachedDests()` | dest-knowledge.js | system-prompt.js | Get all valid entries |
| `getCachedDestKnowledge()` | dest-knowledge.js | (Exported, not used currently) | Get single destination |
| `loadCacheFromDisk()` | dest-knowledge.js | initCache() | Load JSON from disk to memory |
| `saveCacheToDisk()` | dest-knowledge.js | execute() | Write memory Map to JSON |
| `initCache()` | dest-knowledge.js | server.js | Entry point at startup |
| `buildSystemPrompt()` | system-prompt.js | Each conversation | Assemble prompt with all KBs |

---

## Injection Logic (Pseudo-code)

```javascript
// From system-prompt.js lines 129-143
const cachedDests = getAllCachedDests();  // Array of valid entries

for (const entry of cachedDests) {
  // 1. Skip if already in hardcoded list
  if (['马来西亚'].includes(entry.destination)) continue;
  
  // 2. Smart inject: only if mentioned in conversation
  if (!conversationText.toLowerCase().includes(entry.destination.toLowerCase())) {
    continue;  // Don't inject unmentioned destinations (save tokens!)
  }
  
  // 3. Calculate age for display
  const daysAgo = Math.floor((now - entry.saved_at) / MS_PER_DAY);
  const label = daysAgo === 0 ? '今日缓存' : `${daysAgo}天前缓存`;
  
  // 4. Add to system prompt
  addToPrompt(`# 目的地知识库：${entry.destination}（${label}）\n${entry.content}`);
}
```

---

## Typical User Journey

```
User says: "I want to visit France and South Korea"
     ↓
System checks hardcoded KB for "france" or "korea"
     ├─ "France" → NOT in hardcoded (malaysia/diving only)
     └─ "Korea" → NOT in hardcoded
     ↓
System calls getAllCachedDests()
     ├─ Found: "法国巴黎" (cached 1 day ago) ✓
     ├─ Found: "法国、意大利" (cached 5 days ago) ✓
     └─ "Korea" not cached ❌
     ↓
System injects France caches into prompt
     ├─ "法国巴黎（1天前缓存）"
     └─ "法国、意大利（5天前缓存）"
     ↓
AI sees Korea not in any KB
     ├─ Calls web_search 2-3 times
     └─ Structures into Markdown
     ↓
AI calls cache_destination_knowledge
     ├─ destination: "韩国"
     └─ content: "# 韩国旅行知识库\n..."
     ↓
Tool execute() → destCache.set() → saveCacheToDisk()
     ↓
data/dest-cache.json updated with "韩国" entry
     ↓
Next mention of "Korea" in any session:
     ├─ loadCacheFromDisk() restored it to memory
     └─ getAllCachedDests() returns it
     ↓
No web_search needed! Use cached knowledge
```

---

## Memory vs. Disk

### Memory (JavaScript Map)
```javascript
const destCache = new Map([
  ['日本', { content: '# 日本旅游...\n', saved_at: 1775815481672 }],
  ['法国巴黎', { content: '# 巴黎旅行...\n', saved_at: 1775813883898 }],
  // ... more
]);
```
- **Loaded:** Once at server startup (blocking, ~5ms)
- **Lifetime:** Until server restart
- **Speed:** O(1) lookup via Map

### Disk (JSON File)
```json
{
  "日本": { "content": "# 日本旅游...\n", "saved_at": 1775815481672 },
  "法国巴黎": { "content": "# 巴黎旅行...\n", "saved_at": 1775813883898 }
}
```
- **Persisted:** On every cache_destination_knowledge call (blocking, ~10ms)
- **Lifetime:** 30 days (checked at load/inject)
- **Format:** Pretty-printed JSON (human readable)
- **Path:** `data/dest-cache.json` (~20KB for 7 destinations currently)

---

## TTL & Expiration

```javascript
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;  // 30 days in ms

// Checked at two points:
// 1. loadCacheFromDisk() on startup
//    → Skip loading entries older than 30 days
//
// 2. getAllCachedDests() on each prompt build
//    → Filter out & delete expired entries
//
// Result: After 30 days, entry is no longer available
//         No automatic background cleanup job
```

**Current cache status (April 11, 2026):**
- "西欧法国意大利": 1 day old ✓
- "法国、意大利": 1 day old ✓
- "法国意大利西欧": 0 days old ✓ (today)
- "日本": 1 day old ✓
- "土耳其": 8 days old ✓
- "泰国": 13 days old ✓
- ALL entries > 30 days: deleted on next load

---

## Error Handling

### Disk I/O Failures
```javascript
// No crash on failure - graceful degradation
try {
  fs.readFileSync(CACHE_FILE);
} catch (err) {
  console.warn('  ⚠️ 加载目的地知识缓存失败:', err.message);
  // Continue without cache - it's optional!
}
```

### JSON Corruption
```javascript
// If JSON file is corrupted:
// 1. catch block catches JSON.parse() error
// 2. Console warns user
// 3. Application continues (no cache this session)
// 4. Cache file not overwritten until next save
```

### File System Errors
```javascript
// Missing data/ directory? Create it
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// No write permission? Just warn, continue
try {
  fs.writeFileSync(CACHE_FILE, ...);
} catch (err) {
  console.warn('  ⚠️ 保存目的地知识缓存失败:', err.message);
}
```

---

## Performance Impact

### Token Cost
- **Hardcoded Malaysia KB:** ~2-3K tokens always (if "马来西亚" mentioned)
- **Each cached destination:** ~500-2K tokens (only if mentioned + not hardcoded)
- **Current:** 7 cached destinations could add 3.5-14K tokens if all mentioned

### I/O Cost
- **Startup load:** ~5ms (one-time, blocking)
- **Per cache write:** ~10ms (blocking, during tool execution)
- **Per injection:** O(n) filter over 7 entries (~1ms)

### Memory Cost
- **Per destination:** ~200-500 bytes
- **Current (7):** ~25-50 KB in RAM
- **Negligible** for modern systems

---

## Hardcoded vs. Dynamic: When to Use

### Use Hardcoded Knowledge When:
✓ Destination is popular & frequently requested (Malaysia, Japan)
✓ Knowledge is stable & rarely needs updates (geography, visa policy)
✓ Knowledge is large & can be reviewed before deployment
✓ Knowledge is specific to your business (your favorite PADI sites)

### Use Dynamic Caching When:
✓ Destination is new or less frequently requested
✓ Need to update knowledge without deployment
✓ Knowledge comes from recent web searches
✓ Want to avoid storing everything in source code
✓ Want to handle any destination the user mentions

**Current Setup:**
- Hardcoded: Malaysia, Diving, Holidays (strategic, stable)
- Dynamic: France, Italy, Japan, Turkey, Thailand, etc. (discovered at runtime)

---

## Debugging Tips

### Check What's Currently Cached
```bash
cat data/dest-cache.json | jq 'keys'
# Output: ["西欧法国意大利", "法国、意大利", "日本", "泰国", ...]
```

### Clear Cache
```bash
rm data/dest-cache.json
# Cache will be recreated as new destinations are encountered
```

### See Cache Age
```javascript
// In system-prompt.js injection code
const daysAgo = Math.floor((Date.now() - entry.saved_at) / (24 * 60 * 60 * 1000));
// Shows "X天前缓存" or "今日缓存"
```

### Monitor Cache Hits
```javascript
// Add logging to getAllCachedDests()
console.log(`Injecting ${cachedDests.length} cached destinations`);
// Shows cache effectiveness over time
```

---

## Future Improvements

1. **Manual cache invalidation:** `clear_destination_cache` tool
2. **Cache statistics:** Track hit rate, age distribution
3. **Smart TTL:** Different TTL for different destination types
4. **Compression:** gzip dest-cache.json for large caches
5. **Distributed cache:** Share cache across multiple server instances
6. **Cache versioning:** Handle schema changes gracefully
7. **Search index:** Fast lookup by partial destination name

