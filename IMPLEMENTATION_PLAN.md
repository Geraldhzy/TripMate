# Implementation Plan: File-Based Destination Knowledge Cache

## Current State → Target State

### CURRENT (In-Memory Only)
```
┌─────────────────────────────────────────────────┐
│ Server Startup                                  │
├─────────────────────────────────────────────────┤
│ destCache = new Map()  [EMPTY]                  │
│ (Lines 7, tools/dest-knowledge.js)              │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Conversation 1                                  │
├─────────────────────────────────────────────────┤
│ AI calls cache_destination_knowledge("日本")    │
│ → execute() saves: destCache.set("日本", {...}) │
│ → Returns success JSON                          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Conversation 2                                  │
├─────────────────────────────────────────────────┤
│ getAllCachedDests() reads destCache             │
│ BUT: is imported but NEVER CALLED              │
│ → Cached "日本" KB is INVISIBLE to AI           │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Server Restart                                  │
├─────────────────────────────────────────────────┤
│ destCache = new Map()  [WIPED]                  │
│ → All destination knowledge LOST                │
└─────────────────────────────────────────────────┘
```

### TARGET (File-Based with Persistence)
```
┌─────────────────────────────────────────────────┐
│ Server Startup                                  │
├─────────────────────────────────────────────────┤
│ data/destination-cache/  [directory created]    │
│ loadCacheFromDisk()                             │
│ → Loads all *.json files into Map               │
│ → Cleans up expired entries                     │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Conversation 1                                  │
├─────────────────────────────────────────────────┤
│ AI calls cache_destination_knowledge("日本")    │
│ → execute() saves: destCache.set("日本", {...}) │
│ → saveCacheToDisk() writes data/destination-... │
│   └─ data/destination-cache/japan.json         │
│ → Returns success JSON                          │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Conversation 2                                  │
├─────────────────────────────────────────────────┤
│ buildSystemPrompt() calls getAllCachedDests()   │
│ → Returns [{ destination: "日本", content: ...} │
│ → Injects into system prompt                    │
│ → AI sees "已缓存日本知识库"                    │
│ → AI reuses cache instead of web_search        │
└─────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────┐
│ Server Restart                                  │
├─────────────────────────────────────────────────┤
│ loadCacheFromDisk() restores from disk          │
│ → "日本" knowledge PRESERVED                    │
│ → All destinations in cache/ restored           │
└─────────────────────────────────────────────────┘
```

## Implementation Phases

### PHASE 1: File Storage Layer (dest-knowledge.js)
**Goal**: Replace in-memory Map with file-based persistence
**Files to Change**: `tools/dest-knowledge.js`
**API Compatibility**: Must maintain 100% - no breaking changes

```javascript
// BEFORE (Lines 7-7)
const destCache = new Map();

// AFTER
const path = require('path');
const fs = require('fs').promises;
const CACHE_DIR = path.join(__dirname, '../data/destination-cache');
let destCache = new Map(); // Keep for runtime speed

async function initCache() {
  // Call on startup to load from disk
  // Create directory if needed
  // Load all .json files into destCache
}

async function saveCacheToDisk() {
  // Call after every execute() to persist changes
  // Write each entry to data/destination-cache/{name}.json
}
```

**Changes Required**:
- Line 5: `const fs = require('fs').promises;`
- Line 5: `const path = require('path');`
- Line 7: Keep `const destCache = new Map();` for runtime
- Lines 34-40: Modify `execute()` to call `saveCacheToDisk()` after `destCache.set()`
- Add: `initCache()` function to load from disk on startup
- Add: `saveCacheToDisk()` function to persist to disk
- Add: `cleanupExpiredCache()` to delete expired files
- Update exports: Add `initCache` to module.exports

**Where to Call `initCache()`**:
- `server.js` line 21 or earlier (in app setup, not in `/api/chat`)
- Wrap in try-catch to handle missing directory

**Testing Considerations**:
- Test create CACHE_DIR if not exists
- Test write permission errors
- Test corrupt JSON file handling
- Test concurrent writes (unlikely but possible)

---

### PHASE 2: System Prompt Injection (prompts/system-prompt.js)
**Goal**: Inject cached destinations into system prompt so AI reuses them
**Files to Change**: `prompts/system-prompt.js`
**API Compatibility**: No breaking changes to function signature

```javascript
// BEFORE (Line 9)
const { getAllCachedDests } = require('../tools/dest-knowledge');
// BUT never used!

// AFTER (Lines 109-127)
// In buildSystemPrompt(), after static KB injection:

const cachedDests = getAllCachedDests();
if (cachedDests.length > 0) {
  const cachedSection = cachedDests.map(d => 
    `### ${d.destination}\n${d.content}`
  ).join('\n\n');
  
  parts.push(`## 已缓存目的地知识库\n`
    + `以下目的地的知识库已在先前对话中建立，请直接使用，无需重复搜索：\n`
    + cachedSection);
}
```

**Changes Required**:
- Line 9: Already imports `getAllCachedDests` ✓
- Lines 109-127: Add new section to inject cached destinations
- Positioning: After static KB section (line 120), before TripBook section
- Add instructions: Tell AI to use cache first

**System Prompt Text**:
```
## 已缓存目的地知识库
以下目的地的知识库已在先前对话中建立，请优先参考，无需通过web_search重复搜索：

### 日本
[cached content here]

### 泰国
[cached content here]

---
**使用规则**：如果用户提到上述任一目的地，直接引用缓存内容。
如果用户提到新目的地，按照"目的地知识库自动构建规则"章节操作。
```

---

### PHASE 3: Integration Testing
**Goal**: Verify full flow works end-to-end
**Scenarios**:
1. Server starts → cache loads from disk ✓
2. AI calls cache_destination_knowledge("新目的地") → written to disk ✓
3. Next conversation → AI sees cached destination in system prompt ✓
4. Next server restart → cached destinations still there ✓
5. Expired entries (>30 days) → cleaned up on load ✓
6. Corrupt JSON file → handled gracefully ✓

---

## File Layout Changes

### NEW DIRECTORY STRUCTURE
```
ai-travel-planner/
├── server.js
├── tools/
│   ├── dest-knowledge.js      [MODIFIED - add file I/O]
│   ├── index.js
│   └── ...
├── prompts/
│   ├── system-prompt.js       [MODIFIED - call getAllCachedDests]
│   └── knowledge/
├── models/
├── public/
├── data/                       [NEW - .gitignore-d]
│   └── destination-cache/     [NEW - created on startup]
│       ├── japan.json         [NEW - created when AI caches]
│       ├── thailand.json
│       └── ...
└── .gitignore                 [MODIFIED - add /data/]
```

### .GITIGNORE UPDATE
```
# Add to .gitignore
/data/
/data/destination-cache/
```

---

## Code Changes Summary

### File 1: tools/dest-knowledge.js
**Size Change**: ~62 lines → ~120 lines

```javascript
// ADD AFTER LINE 5
const path = require('path');
const fs = require('fs').promises;

// ADD AFTER LINE 7 (keep existing destCache line)
const CACHE_DIR = path.join(__dirname, '../data/destination-cache');

// MODIFY LINES 34-40 (execute function)
async function execute({ destination, content }) {
  if (!destination || !content) {
    return JSON.stringify({ error: '缺少必要参数: destination, content' });
  }
  destCache.set(destination, { content, saved_at: Date.now() });
  
  // ADD: Persist to disk
  try {
    await saveCacheToDisk(destination, { content, saved_at: Date.now() });
  } catch (err) {
    console.error(`Failed to save cache for ${destination}:`, err.message);
    // Still return success to not break AI
  }
  
  return JSON.stringify({ success: true, destination, message: `已缓存"${destination}"目的地知识库，后续对话将直接复用` });
}

// ADD NEW FUNCTIONS (before module.exports)
async function initCache() {
  try {
    // Create cache directory if not exists
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    
    // Load all JSON files from disk into destCache
    const files = await fs.readdir(CACHE_DIR);
    const now = Date.now();
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      try {
        const content = await fs.readFile(path.join(CACHE_DIR, file), 'utf-8');
        const data = JSON.parse(content);
        
        // Skip expired entries
        if (now - data.saved_at > CACHE_TTL) {
          await fs.unlink(path.join(CACHE_DIR, file));
          continue;
        }
        
        // Restore to Map
        const dest = file.slice(0, -5); // Remove .json
        destCache.set(dest, data);
      } catch (err) {
        console.warn(`Failed to load cache file ${file}:`, err.message);
      }
    }
    
    console.log(`[DestKnowledge] Loaded ${destCache.size} cached destinations from disk`);
  } catch (err) {
    console.error('[DestKnowledge] Failed to initialize cache:', err.message);
  }
}

async function saveCacheToDisk(destination, data) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const fileName = `${destination.toLowerCase().replace(/\s+/g, '_')}.json`;
    const filePath = path.join(CACHE_DIR, fileName);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Failed to save cache for ${destination}:`, err.message);
    throw err;
  }
}

// MODIFY EXPORTS
module.exports = { 
  TOOL_DEF, 
  execute, 
  getCachedDestKnowledge, 
  getAllCachedDests,
  initCache,
  cleanupExpiredCache  // New export
};
```

### File 2: server.js
**Changes**: Minimal - just call initCache() on startup

```javascript
// ADD AFTER LINE 11 (after app definition)
const { initCache } = require('./tools/dest-knowledge');

// ADD BEFORE LINE 589 (before app.listen)
// Initialize destination knowledge cache from disk
initCache().catch(err => console.error('[Startup] Failed to init dest cache:', err.message));
```

### File 3: prompts/system-prompt.js
**Changes**: Call getAllCachedDests() and inject into prompt

```javascript
// AROUND LINE 120 (after static KB injection, before TripBook)
// ADD THIS SECTION:

const cachedDests = getAllCachedDests();
if (cachedDests.length > 0) {
  const cachedLines = cachedDests.map(d => {
    const dests = Array.isArray(d.destination) ? d.destination : [d.destination];
    const destStr = dests.join(' / ');
    return `### ${destStr}\n\n${d.content || ''}`;
  }).join('\n\n---\n\n');
  
  parts.push(`## ✅ 已缓存目的地知识库
以下目的地的知识库已在先前对话中建立，如用户提到这些地方，请优先参考缓存内容，**无需调用web_search重复搜索**：

${cachedLines}

---`);
}
```

---

## Validation Checklist

### Syntax & Imports
- [ ] `const fs = require('fs').promises;` imported in dest-knowledge.js
- [ ] `const path = require('path');` imported in dest-knowledge.js
- [ ] `const { initCache } = require('./tools/dest-knowledge');` in server.js
- [ ] All `await` calls wrapped in async functions
- [ ] No callback-style fs calls (using .promises API)

### File I/O
- [ ] Directory created automatically: `data/destination-cache/`
- [ ] Files saved as: `data/destination-cache/{name}.json` (lowercase, underscores)
- [ ] JSON format includes both `content` and `saved_at` fields
- [ ] Corrupt files don't crash server (try-catch in initCache)
- [ ] Missing directory doesn't crash server (recursive mkdir)

### Integration
- [ ] `initCache()` called in server.js before app.listen()
- [ ] `getAllCachedDests()` actually called in buildSystemPrompt() (not just imported)
- [ ] Cached destinations injected into system prompt with clear instructions
- [ ] API exports don't change (backward compatible)
- [ ] No new tool definitions (just implementation detail)

### TTL Logic
- [ ] Existing TTL constant (30 days) still used
- [ ] Expired files deleted during initCache()
- [ ] Expired entries cleaned from getAllCachedDests()
- [ ] Execute function doesn't bypass TTL logic

### Error Handling
- [ ] Disk write failure doesn't crash server
- [ ] Disk write failure doesn't prevent tool success response
- [ ] File permission errors caught gracefully
- [ ] Missing /data/destination-cache created automatically
- [ ] Corrupt JSON files skipped with warning

---

## Testing Commands

```bash
# Test 1: Start server and check cache initialization
npm start
# Look for: "[DestKnowledge] Loaded X cached destinations from disk"

# Test 2: Make a conversation that caches destination
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-..." \
  -d '{"messages":[{"role":"user","content":"规划日本之旅"}],"provider":"openai","model":"gpt-4o"}'
# Should cache "日本" to data/destination-cache/japan.json

# Test 3: Verify file was created
ls -la data/destination-cache/
cat data/destination-cache/japan.json

# Test 4: Restart server and verify cache loads
npm restart
# Look for: "[DestKnowledge] Loaded 1 cached destinations from disk"

# Test 5: New conversation should see cached destination in prompt
# (Check server logs or trace system prompt injection)
```

---

## Performance Implications

### Positive
- Reduced web_search calls (cache lookup in memory is O(1))
- Faster conversations when destinations are cached
- Persistent cache across server restarts

### Neutral
- Disk I/O on each cache_destination_knowledge call (async, non-blocking)
- Small disk space for JSON files (~1-5 KB per destination)
- initCache() load time proportional to number of cached destinations

### Considerations
- Very large caches (1000+ destinations) could slow initCache()
  - Consider pagination or lazy-loading if needed
- File system sync issues in distributed setups
  - Not an issue for single-server deployment
  - Would need Redis/shared storage for multiple instances

---

## Rollback Plan

If issues occur:
1. Comment out `await saveCacheToDisk()` in execute() → back to in-memory
2. Comment out `initCache()` in server.js startup → no disk loading
3. Delete `/data/destination-cache/` directory → clean slate
4. No code changes needed, just disable calls

