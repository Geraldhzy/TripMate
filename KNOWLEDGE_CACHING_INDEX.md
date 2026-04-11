# Destination Knowledge Caching System - Documentation Index

This project uses a **hybrid knowledge management system** combining hardcoded files with a dynamic runtime cache. This index guides you through the documentation.

## 📚 Documentation Files

### 1. **DESTINATION_KNOWLEDGE_SYSTEM.md** (Main Document - 28 KB)
**Start here for comprehensive understanding**

Complete architectural overview including:
- Detailed explanation of both hardcoded and dynamic systems
- Full file structure and content examples
- Core functions: `execute()`, `getAllCachedDests()`, `loadCacheFromDisk()`, etc.
- Real-world cache entry examples (from actual `data/dest-cache.json`)
- Data flow diagrams and sequences
- TTL & expiration logic
- Performance characteristics
- Decision trees for AI workflow

**Best for:** Understanding the complete system, implementation details, and how everything works together.

---

### 2. **CACHE_QUICK_REFERENCE.md** (Cheat Sheet - 9.7 KB)
**Quick lookup for common questions**

Condensed reference including:
- Two systems at a glance (comparison table)
- File structure tree
- Cache entry format examples
- Functions map (what calls what)
- Injection logic pseudo-code
- Typical user journey
- Memory vs disk structure
- TTL expiration status
- Error handling patterns
- Performance metrics
- When to use hardcoded vs dynamic
- Debugging tips

**Best for:** Quick answers, comparisons, and debugging specific issues.

---

### 3. **CACHE_ARCHITECTURE.txt** (Visual Diagrams - 23 KB)
**ASCII diagrams and flow charts**

Visual representations including:
- System prompt assembly flowchart
- Write path (cache creation)
- Read path (cache loading)
- In-memory structure
- Disk storage structure
- TTL & expiration logic
- Comparison: hardcoded vs dynamic
- Injection deduplication
- Error handling flows
- Performance metrics

**Best for:** Visual learners, understanding data flows, and architecture overview.

---

## 🎯 Quick Navigation

### "I want to understand..."

| Topic | Document | Section |
|-------|----------|---------|
| **The whole system** | DESTINATION_KNOWLEDGE_SYSTEM.md | Overview + System Integration |
| **How caching works** | CACHE_QUICK_REFERENCE.md | Memory vs Disk |
| **Data flow** | CACHE_ARCHITECTURE.txt | WRITE PATH / READ PATH |
| **System prompt injection** | DESTINATION_KNOWLEDGE_SYSTEM.md | Injection Logic / System Integration |
| **Tool definition** | DESTINATION_KNOWLEDGE_SYSTEM.md | System 3: Tool Definition & Integration |
| **Hardcoded vs dynamic** | CACHE_QUICK_REFERENCE.md | Hardcoded vs Dynamic: When to Use |
| **Error handling** | CACHE_QUICK_REFERENCE.md | Error Handling |
| **Performance impact** | CACHE_QUICK_REFERENCE.md | Performance Impact |
| **Real example** | DESTINATION_KNOWLEDGE_SYSTEM.md | Real-World Example: France Cache Entry |
| **TTL expiration** | CACHE_QUICK_REFERENCE.md | TTL & Expiration |
| **Debugging** | CACHE_QUICK_REFERENCE.md | Debugging Tips |

---

## 🔍 Key Files in Project

### Source Files
- **`tools/dest-knowledge.js`** (119 lines)
  - Tool definition: `cache_destination_knowledge`
  - Core functions: `execute()`, `getAllCachedDests()`, `getCachedDestKnowledge()`
  - I/O functions: `loadCacheFromDisk()`, `saveCacheToDisk()`, `initCache()`
  - TTL constant: `CACHE_TTL = 30 days`

- **`prompts/system-prompt.js`** (~157 lines)
  - `buildSystemPrompt()` - Main assembler
  - Hardcoded KB injection logic (lines 117-127)
  - Cached KB injection logic (lines 129-143)
  - Deduplication logic
  - Age labeling for cached entries

- **`prompts/knowledge/`**
  - `malaysia.js` - Hardcoded Malaysia KB (~2.6 KB)
  - `diving.js` - Hardcoded Diving KB (~2.6 KB)
  - `holidays.js` - Dynamic yearly holidays (~3.7 KB)
  - `methodology.js` - Planning methodology (~11.8 KB)

- **`tools/index.js`**
  - Tool registry (line 11-13)
  - Exports `getAllCachedDests` for system-prompt.js

- **`server.js`**
  - Calls `initDestCache()` on startup

### Data Files
- **`data/dest-cache.json`** (~20 KB)
  - Runtime persistent cache
  - Contains: 7 destinations (as of April 11, 2026)
  - Format: JSON with destination name → {content, saved_at}
  - Created at runtime, gitignored

---

## 💡 System Overview

```
TWO PARALLEL SYSTEMS:

🔧 HARDCODED KNOWLEDGE
├─ Files: prompts/knowledge/*.js
├─ Storage: Source code (git tracked)
├─ TTL: ∞ (permanent)
├─ Examples: Malaysia, Diving, Holidays, Methodology
└─ Update Method: Code deployment

💾 DYNAMIC CACHE
├─ Files: data/dest-cache.json
├─ Storage: JSON on disk
├─ TTL: 30 days
├─ Examples: France, Italy, Japan, Turkey, Thailand
└─ Update Method: cache_destination_knowledge tool (immediate)

INTEGRATION:
- Smart injection: only relevant cached entries
- Deduplication: hardcoded takes priority
- Graceful degradation: continues if cache unavailable
- Persistence: survives server restarts
```

---

## 🚀 Getting Started

### To Add a New Hardcoded Destination:
1. Create `prompts/knowledge/destination-name.js`
2. Export Markdown content (see `malaysia.js` for format)
3. Add keyword triggers in `system-prompt.js` (lines 117-127)
4. Deploy code

### To View Currently Cached Destinations:
```bash
cat data/dest-cache.json | jq 'keys'
```

### To Clear Cache:
```bash
rm data/dest-cache.json
```

### To Add Debug Logging:
Edit `tools/dest-knowledge.js` or `prompts/system-prompt.js` and add `console.log()` statements

---

## 📊 Current Cache Status (April 11, 2026)

7 destinations cached:
- 西欧法国意大利 (1 day old) ✓
- 法国、意大利 (1 day old) ✓
- 法国意大利西欧 (0 days old - today) ✓
- 法国巴黎 (1 day old) ✓
- 意大利罗马 (1 day old) ✓
- 日本 (1 day old) ✓
- 土耳其 (8 days old) ✓
- 泰国 (13 days old) ✓

Total size: ~20 KB on disk, ~25-50 KB in memory

---

## 🧪 Testing & Verification

### Manual Testing:
```javascript
// In tools/dest-knowledge.js
console.log('Cache contents:', destCache);

// In system-prompt.js
console.log('Injecting cached:', cachedDests.length, 'destinations');
```

### Monitoring:
- Watch `data/dest-cache.json` for changes
- Check server logs for cache load messages
- Verify Age labels in system prompt sections

---

## ⚠️ Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Cache not persisting | `data/` directory missing | Automatically created on first write |
| Corrupted cache file | File I/O error or manual edit | Delete and recreate via tool |
| Destination not injected | Keyword not mentioned in conversation | Check conversation text matching |
| Duplicate knowledge | Both hardcoded and cached loaded | Hardcoded takes priority (no duplication) |
| Expired not removed | 30 day TTL not checked | Removed on next load/inject |
| Cache not loaded | First server startup | Cache file created empty, built over time |

---

## 📈 Performance at a Glance

| Metric | Value |
|--------|-------|
| Memory per destination | ~200-500 bytes |
| Disk per destination | ~2-3 KB |
| Startup load time | ~5 ms |
| Per cache write | ~10 ms |
| Token cost per cached dest | ~500-2K tokens (if mentioned) |
| Tokens saved per reuse | ~500 tokens (skip web_search) |

---

## 🔗 Related Documentation

- **System Prompt Architecture:** See `prompts/system-prompt.js` comments
- **Tool System:** See `tools/index.js` for tool registration
- **Web Search Integration:** See `tools/web-search.js` for how AI discovers new destinations
- **Trip Planning:** See `prompts/knowledge/methodology.js` for planning stages

---

## 📝 Last Updated

- **Date:** April 11, 2026
- **Cache Entries:** 7
- **Total Cache Size:** ~20 KB
- **System Status:** Active with 7 cached destinations
- **Documentation Version:** 1.0

---

## ❓ FAQ

**Q: Where does the cache live?**
A: In-memory as a JavaScript Map (loaded at startup), persisted to `data/dest-cache.json`

**Q: How long does cache last?**
A: 30 days from creation. Checked at startup (load) and each prompt build (inject).

**Q: What happens if cache file is missing?**
A: Application continues normally. Cache is rebuilt as new destinations are encountered.

**Q: Can I edit cache manually?**
A: Yes, `data/dest-cache.json` is human-readable JSON. Be careful with format.

**Q: Why isn't my destination showing up?**
A: Check if mentioned in conversation text + not expired (30 days) + not in hardcoded exclusion list.

**Q: How do I force a cache refresh?**
A: Delete `data/dest-cache.json` and the cache will be rebuilt on next use.

**Q: Can I extend the TTL?**
A: Yes, modify `CACHE_TTL` in `tools/dest-knowledge.js` (currently 30 days).

---

## 🎓 Learning Path

1. **Beginner:** Read CACHE_QUICK_REFERENCE.md (5 min)
2. **Intermediate:** Read CACHE_ARCHITECTURE.txt (10 min)
3. **Advanced:** Read DESTINATION_KNOWLEDGE_SYSTEM.md (20 min)
4. **Expert:** Read source code in `tools/dest-knowledge.js` + `prompts/system-prompt.js`

