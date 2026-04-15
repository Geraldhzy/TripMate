# System Prompt Context Documentation Index

**Generated**: 2026-04-13  
**Repository**: `/Users/geraldhuang/DEV/ai-travel-planner`  
**Status**: Complete analysis of main agent system prompt architecture

---

## 📚 Documentation Files

### 1. **SYSTEM_PROMPT_CONTEXT_ANALYSIS.md** (PRIMARY - 17KB)
**Comprehensive technical reference with 10 sections**

- ✅ `toSystemPromptSection()` full structure & methods
- ✅ Agent configs (only flight agent available)
- ✅ Holiday knowledge block (3.3KB, currently UNUSED)
- ✅ Complete tool list (8 direct + 1 delegation tool)
- ✅ System prompt assembly flow
- ✅ TripBook three-layer architecture
- ✅ Unused/dead code analysis
- ✅ Constraints & limitations
- ✅ Tool invocation paths

**Best for**: Deep understanding, implementation details, copy-paste references

---

### 2. **SYSTEM_PROMPT_QUICK_REFERENCE.txt** (11KB)
**Fast lookup guide with 10 numbered sections**

- 1️⃣ toSystemPromptSection() output structure (tree diagram)
- 2️⃣ Available agents table
- 3️⃣ Holiday knowledge status
- 4️⃣ Available tools table
- 5️⃣ TripBook three-layer architecture (compact)
- 6️⃣ System prompt assembly flow
- 7️⃣ Segment types taxonomy
- 8️⃣ Cache TTL settings
- 9️⃣ Critical behaviors checklist
- 🔟 Tool invocation paths

**Best for**: Quick reference during development, decision making

---

### 3. **SYSTEM_PROMPT_FLOW_DIAGRAM.txt** (13KB)
**Step-by-step visual walkthrough with 7 major sections**

- **STEP 1**: Client request → Server (data structure)
- **STEP 2**: Server setup (TripBook creation & restoration)
- **STEP 3**: Build system prompt (buildSystemPrompt flow)
- **STEP 4**: TripBook section generation (three subsections)
- **STEP 5**: LLM call & tool definitions
- **STEP 6**: Tool execution & TripBook sync (examples)
- **STEP 7**: Client updates & persistence
- **Bonus**: System prompt size estimation
- **Bonus**: Key architectural decisions

**Best for**: Understanding end-to-end flow, debugging, architecture decisions

---

## 🎯 Quick Navigation

### **If you need to:**

| Task | File | Section |
|------|------|---------|
| Understand toSystemPromptSection() format | QUICK_REFERENCE | 1️⃣ |
| Find what agents are available | QUICK_REFERENCE | 2️⃣ |
| Check tool definitions | QUICK_REFERENCE | 4️⃣ |
| Understand TripBook structure | FLOW_DIAGRAM | STEP 4 or CONTEXT_ANALYSIS | Section 7 |
| See system prompt assembly | FLOW_DIAGRAM | STEP 3 |
| Debug state persistence | FLOW_DIAGRAM | STEP 1, 2, 7 |
| Understand cache behavior | CONTEXT_ANALYSIS | Section 9 |
| See full tool reference | CONTEXT_ANALYSIS | Section 4 |
| Check confirmed flag behavior | CONTEXT_ANALYSIS | Section 1 or Section 7 |

---

## 📊 Key Findings Summary

### What's Injected Into System Prompt

```
System Prompt Components:
├─ Current time (UTC+8)
├─ Role definition + 7 behavioral rules
├─ Progressive planning methodology (4 phases)
├─ Tool usage strategy (8 tools + delegation)
├─ Cached destination knowledge (if mentioned)
└─ TripBook section:
   ├─ Dynamic data (weather, rates, searches)
   ├─ Confirmed constraints (✅ no re-ask)
   ├─ Pending constraints (❓ need confirmation)
   └─ Current itinerary progress
```

### What's Available

| Category | Status | Count | Notes |
|----------|--------|-------|-------|
| Direct Tools | ✅ Available | 8 | web_search, weather, rates, poi, flights, hotels, cache_knowledge, update_trip |
| Agents | ⚠️ Limited | 1 | Only "flight" agent (no hotel/attraction) |
| Phase Labels | ✅ Full | 7 | 0=未开始, 1=锁定约束, ..., 5=行程总结 |
| Holiday Data | ❌ UNUSED | 2 | 2025 & 2026 tables exist but not injected |

### Critical Behaviors

| Behavior | Impact | Mechanism |
|----------|--------|-----------|
| confirmed flag defaults to TRUE | Prevents re-asking | Line 148 in trip-book.js |
| Weather/rates capped at 3-4 hrs | Reduces stale data | TTL-based cache expiry |
| Sub-agent results capped at 4,000 chars | Prevents context explosion | Line 128 in delegate.js |
| Only 'selected' quotes shown | Clean UI presentation | buildItineraryPromptSection() |
| Destinations re-injected per turn | Knowledge reuse | Line 156-157 in system-prompt.js |

---

## 🔍 Code References

### Main Files Analyzed

| File | Purpose | Key Methods |
|------|---------|-------------|
| `models/trip-book.js` | State management | toSystemPromptSection(), buildConstraintsPromptSection() |
| `agents/config.js` | Agent registry | AGENT_CONFIGS object |
| `prompts/knowledge/holidays.js` | Holiday data | getHolidayKnowledge() (unused) |
| `tools/index.js` | Tool registry | getToolDefinitionsForAnthropic() |
| `prompts/system-prompt.js` | Prompt builder | buildSystemPrompt() |
| `server.js` | Main orchestrator | Lines 140-178 (TripBook setup + prompt assembly) |
| `agents/delegate.js` | Delegation tool | TOOL_DEF + executeDelegation() |

### Line Number Quick Reference

| Task | File | Lines |
|------|------|-------|
| toSystemPromptSection() | trip-book.js | 410-432 |
| buildConstraintsPromptSection() | trip-book.js | 260-318 |
| buildDynamicDataPromptSection() | trip-book.js | 358-404 |
| buildSystemPrompt() | system-prompt.js | 8-178 |
| TripBook setup | server.js | 140-176 |
| System prompt build | server.js | 177-178 |
| Tool execution | server.js | 256-325 |
| Delegation config | agents/config.js | 16-24 |
| Delegation tool | agents/delegate.js | 9-37 |

---

## 💡 Important Insights

### 1. **Confirmed Flag is Critical**
```javascript
// Line 147-148 in trip-book.js
if (newVal.confirmed === undefined) {
  newVal.confirmed = true; // ← DEFAULTS TO TRUE
}
```
**Why it matters**: Prevents AI from re-asking confirmed questions. Must be explicit if you want pending (❓) state.

### 2. **Holiday Knowledge is Dead Code**
```bash
$ grep -r "getHolidayKnowledge" --include="*.js" | grep -v node_modules
# Result: Only 2 matches in holidays.js itself
```
**Action**: Must call `web_search` for holiday info; holidays.js not used.

### 3. **Only Flight Delegations Supported**
```javascript
// Line 22-23 in agents/delegate.js
enum: Object.keys(AGENT_CONFIGS), // = ["flight"]
```
**Why**: Hotel/POI searches use direct tools; only flight needs complex parallelization.

### 4. **Sub-Agent Output Capped**
```javascript
// Line 128 in agents/delegate.js
const MAX_RESULT_CHARS = 4000;
```
**Why**: Prevents any single sub-agent from inflating the main prompt context.

### 5. **Weather Cache NOT Auto-Synced to TripBook**
```javascript
// Line 154-156 in server.js
// 注意：不将缓存的天气自动注入 TripBook，避免旧行程天气污染新行程面板
// 天气仍通过 knownWeather 注入系统提示防止重复查询
```
**Why**: Prevents carryover from previous trips (e.g., old Chiang Mai weather polluting new Tokyo trip).

---

## 🚀 How to Use These Docs

### For Implementation
1. Start with **SYSTEM_PROMPT_FLOW_DIAGRAM** (understand end-to-end)
2. Reference **SYSTEM_PROMPT_QUICK_REFERENCE** for specific tool/agent details
3. Use **SYSTEM_PROMPT_CONTEXT_ANALYSIS** for deep dives into specific sections

### For Debugging
1. Reproduce the issue in FLOW_DIAGRAM (which step fails?)
2. Check QUICK_REFERENCE for the specific tool/agent/constraint
3. Look up detailed behavior in CONTEXT_ANALYSIS section

### For Adding Features
1. Check QUICK_REFERENCE section 4 (tools available)
2. Verify agent capability in section 2
3. Review TripBook section 7 to understand data structure
4. Check FLOW_DIAGRAM STEP 6 for how data flows

---

## 📈 Token Budget Summary

| Component | Tokens | Notes |
|-----------|--------|-------|
| Base system prompt | 4,700-8,300 | Without destinations |
| Per destination knowledge | 500-2,000 | Variable by detail |
| TripBook section | 300-1,500 | Depends on fullness |
| Holiday tables (unused) | ~900 | Not included anywhere |
| **Total typical session** | 6,000-12,000 | With 2-3 destinations |

---

## ⚠️ Known Limitations

1. ❌ **Holiday data unused** → holidays.js never injected
2. ❌ **Only 1 sub-agent** → flight only (no hotel/poi delegation)
3. ⚠️ **Sub-agent output capped** → 4,000 chars per result
4. ⚠️ **No cross-session persistence** → Destination knowledge resets per conversation
5. ⚠️ **Weather cache not synced** → Prevents session pollution but loses data

---

## 📝 Document Generation Metadata

- **Analysis Date**: 2026-04-13
- **Files Examined**: 10+ source files
- **Code Lines Analyzed**: 1,000+
- **Sections Covered**: 30+
- **Examples Included**: 20+
- **Cross-references**: 50+

---

**Last Updated**: 2026-04-13 22:50 UTC+8  
**Maintained By**: Code Analysis System  
**Status**: Complete ✅
