# AI Travel Planner - Thorough File Exploration Report

**Date**: April 10, 2026  
**Project**: AI Travel Planner  
**Purpose**: Understand current architecture before implementing file-based destination knowledge caching

---

## 📋 What You'll Find in These Documents

### 1. **EXPLORATION_SUMMARY.md** (17 KB)
Comprehensive deep-dive into the codebase:
- Complete breakdown of `dest-knowledge.js` (in-memory Map structure)
- `server.js` integration points (extractItineraryInfo, runTool, post-processing)
- `update_trip_info` tool handling in detail
- TripBook model architecture (4 layers)
- System prompt building and integration
- Existing file storage patterns (or lack thereof)
- Full tool execution flow
- Line-by-line references

**Start here for:** Understanding the current state

### 2. **IMPLEMENTATION_PLAN.md** (17 KB)
Step-by-step implementation guide:
- Current state → target state flow diagrams
- Three implementation phases with specific tasks
- File layout changes and directory structure
- Detailed code changes with examples
- Validation checklist (comprehensive)
- Testing commands and procedures
- Performance implications
- Rollback plan for recovery

**Start here for:** Actually implementing the changes

### 3. **QUICK_REFERENCE.txt** (24 KB)
Quick lookup guide organized by topic:
- Key files and line numbers at a glance
- Architecture diagrams in ASCII
- Implementation checklist (copy-paste ready)
- Key functions by purpose
- Common mistakes to avoid
- Data flow diagrams (before/after)
- File modification summary

**Start here for:** Quick lookups during coding

---

## 🎯 TL;DR - Key Findings

### Current Problem
- **dest-knowledge.js** uses an in-memory Map that's lost on server restart
- **getAllCachedDests()** is imported in system-prompt.js but **never called**
- Cached destinations are **invisible to AI** (not injected into prompts)
- Each conversation treats destinations as fresh (redundant web_search calls)

### Solution Structure
1. **Phase 1**: Add file I/O to dest-knowledge.js
   - `initCache()` - load from disk on startup
   - `saveCacheToDisk()` - persist after each cache operation

2. **Phase 2**: Wire system prompt injection
   - Call `getAllCachedDests()` in buildSystemPrompt()
   - Inject cached destinations as a prompt section

3. **Phase 3**: Server startup hook
   - Call `initCache()` before app.listen()

### Impact
- ✅ Destinations persist across server restarts
- ✅ AI sees cached destinations in system prompt
- ✅ AI reuses cache instead of web_search (faster, cheaper)
- ✅ TTL cleanup still works (30-day expiry)
- ✅ Zero breaking changes to existing API

---

## 📊 Files Modified

| File | Changes | Size | Complexity |
|------|---------|------|-----------|
| `tools/dest-knowledge.js` | +initCache(), +saveCacheToDisk(), modify execute() | 62→120L | Medium |
| `server.js` | Import initCache, call on startup | +2L | Low |
| `prompts/system-prompt.js` | Call getAllCachedDests(), inject into prompt | +10L | Low |
| `.gitignore` | Add /data/ | +2L | Trivial |
| **No changes**: tools/index.js, models/trip-book.js, tools/update-trip-info.js | | | |

---

## 🔍 Architecture at a Glance

```
REQUEST FLOW:
Frontend → /api/chat POST
    ↓
buildSystemPrompt() [includes getAllCachedDests()* - currently ignored]
    ↓
OpenAI/Anthropic handler loops
    ↓
For each tool call:
    → runTool()
    → executeToolCall()
    → Sync to TripBook
    → Send SSE events (tripbook_update critical)
    ↓
Post-processing (if no tool calls):
    → extractItineraryInfo() regex fallback
    → Update TripBook
    → Send tripbook_update SSE

*PROBLEM: getAllCachedDests() imported but never called - this is what we fix

DESTINATION KNOWLEDGE LIFECYCLE:
AI response → cache_destination_knowledge tool
    ↓
execute() called → destCache.set() → [NEW] saveCacheToDisk()
    ↓
Next conversation:
    → [NEW] initCache() loads from disk
    → getAllCachedDests() returns cached
    → Injected to system prompt
    → AI sees cache, reuses it
```

---

## 🚀 Quick Start Implementation

1. **Add imports to dest-knowledge.js:**
   ```javascript
   const fs = require('fs').promises;
   const path = require('path');
   const CACHE_DIR = path.join(__dirname, '../data/destination-cache');
   ```

2. **Add functions to dest-knowledge.js:**
   - `initCache()` - load JSON files on startup
   - `saveCacheToDisk()` - write JSON after execute()

3. **Update server.js:**
   ```javascript
   const { initCache } = require('./tools/dest-knowledge');
   // Before app.listen():
   initCache().catch(err => console.error('[Startup]', err.message));
   ```

4. **Update system-prompt.js:**
   ```javascript
   const cachedDests = getAllCachedDests();
   if (cachedDests.length > 0) {
     // Build "已缓存目的地知识库" section
     parts.push(...);
   }
   ```

5. **Update .gitignore:**
   ```
   /data/
   ```

---

## ⚠️ Critical Points

1. **TTL Logic** (30 days) - Stays the same, applied in:
   - `getAllCachedDests()` filtering
   - `initCache()` cleanup
   - No bypass in execute()

2. **File Naming** - Use lowercase with underscores:
   - "日本" → `japan.json`
   - "新加坡" → `singapore.json`

3. **Error Handling** - Must not crash server:
   - Disk write failures → logged, tool still succeeds
   - Missing /data/ → created automatically
   - Corrupt JSON files → skipped with warning

4. **Async Only** - Use fs.promises (not callbacks):
   - Avoids blocking AI streaming
   - Consistent with project style

5. **No Breaking Changes** - Export interface unchanged:
   - `execute()` signature same
   - `getCachedDestKnowledge()` same
   - `getAllCachedDests()` same
   - Just adds `initCache()` to exports

---

## 📍 Line Numbers Reference

| What | File | Lines |
|------|------|-------|
| In-memory cache setup | dest-knowledge.js | 6-7 |
| Tool definition | dest-knowledge.js | 9-32 |
| Execute function | dest-knowledge.js | 34-40 |
| TTL check logic | dest-knowledge.js | 42-48 |
| Get all cached dests | dest-knowledge.js | 50-59 |
| Post-processing extract | server.js | 282-392 |
| Tool execution hub | server.js | 187-277 |
| tripbook_update event | server.js | 266, 500, 577 |
| System prompt builder | prompts/system-prompt.js | 11 |
| Destination KB rules | prompts/system-prompt.js | 85-92 |
| Static KB injection | prompts/system-prompt.js | 109-127 |
| TripBook constraints | models/trip-book.js | 43-52 |

---

## ✅ Validation Checklist

See **QUICK_REFERENCE.txt** for the full checklist, but key items:
- [ ] fs.promises imported
- [ ] path imported
- [ ] CACHE_DIR defined
- [ ] initCache() function created
- [ ] saveCacheToDisk() function created
- [ ] execute() calls saveCacheToDisk()
- [ ] initCache() called in server startup
- [ ] getAllCachedDests() called in buildSystemPrompt()
- [ ] Cached destinations injected to system prompt
- [ ] /data/ added to .gitignore
- [ ] Try-catch around all file I/O
- [ ] TTL logic preserved

---

## 🧪 Testing Scenarios

1. **Persistence**: Server restart → cache still there ✓
2. **Visibility**: Next conversation → cached destination in prompt ✓
3. **Reuse**: AI uses cache instead of web_search ✓
4. **Cleanup**: Expired entries removed after 30 days ✓
5. **Resilience**: Corrupt files don't crash server ✓
6. **Fallback**: Directory created if missing ✓

---

## 📚 Document Usage Guide

- **Reading code?** → EXPLORATION_SUMMARY.md
- **Writing code?** → IMPLEMENTATION_PLAN.md
- **Need quick answer?** → QUICK_REFERENCE.txt

All three documents are complementary and cross-reference each other.

---

## 🎓 Learning Value

This exploration reveals:
- **SSE streaming patterns** in Express
- **Tool execution architecture** with async pipelines
- **TripBook as session state** (not persisted)
- **System prompt injection** for AI context
- **Regex-based information extraction** fallback
- **Map-based in-memory caching** pattern
- **File I/O best practices** (fs.promises, error handling)

Perfect for understanding how complex AI applications structure data flow and state management.

