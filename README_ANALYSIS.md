# Server.js Multi-LLM Round Analysis — Complete Package

## 📦 What You've Got

Five comprehensive documents analyzing how your AI Travel Planner handles multiple LLM call rounds:

| Document | Purpose | Time | Best For |
|----------|---------|------|----------|
| **INDEX.md** | Navigation hub | 2 min | Start here for orientation |
| **QUICK_SUMMARY.md** ⭐ | Direct answers | 5 min | Understanding the basics |
| **LOOP_STRUCTURE.txt** | Visual flowchart | 10 min | Visual learners |
| **SERVER_FLOW_ANALYSIS.md** | Deep dive | 25 min | Complete technical details |
| **SSE_EVENT_REFERENCE.md** | Event catalog | 15 min | Client implementation |

---

## 🎯 Your 3 Questions Answered

### 1. How does the main chat loop work?

**Main Loop: Lines 567-618 in `handleChat()`**

```
for (round = 0; round < 10; round++) {
  
  1. Call LLM with messages[] array
     ↓ emit token events in real-time
  
  2. Does LLM have tool_calls?
     ↙ NO                    ↘ YES
    Return                   Continue
    
  3. Push assistant message to messages[]
  
  4. For each tool:
     - Execute it
     - Emit tool_start → tool_result
     - Push result to messages[]
  
  5. Loop back (messages[] grew)
}
```

**Key:** Messages array is the state machine. Grows each round. LLM sees full history.

### 2. What SSE events signal round progression?

**Answer: There is NO explicit "round start" event.**

The client **infers** rounds from the event stream:

```
token: "I'll search"  ─┐
token: "flights"      │ LLM response
token: " for..."      ┤
                      ┤
tool_start: search    │ ← NEW ROUND! Tools being called
tool_result: found 3  │
                      ┤
token: "Based on..."  ─┘ ← NEW ROUND! LLM called again with tool results
token: "I recommend"
token: "..."
done: {}
```

**Why?** Simpler protocol, minimal SSE overhead.

**All events:**
- `token` — LLM streaming (real-time)
- `tool_start` / `tool_result` — Tool execution
- `rate_cached` / `weather_cached` / `tripbook_update` — State sync
- `done` — Request complete

### 3. Full request handling flow?

**Endpoint:** `POST /api/chat` (line 115)

**Phase 1: Setup (lines 115-180)**
```
Extract: {messages, provider, model, tripBookSnapshot}
    ↓
Configure SSE headers
    ↓
Create TripBook from snapshot
    ↓
Build system prompt
    ↓
Call handleChat() → main loop
```

**Phase 2: Main Loop (lines 549-634 in handleChat)**
```
Initialize messages[] array
    ↓
For up to 10 rounds:
  1. Call LLM (stream tokens)
  2. If no tool calls → exit loop
  3. Push assistant message
  4. Execute tools (stream tool_start/tool_result)
  5. Push results
  6. Loop back
    ↓
Return fullText
```

**Phase 3: Wrap-up (lines 182-189)**
```
Extract quick replies from response
    ↓
Send quick_replies event [optional]
    ↓
Send done event
    ↓
Close response
```

---

## 🔑 Critical Insights

### The Messages Array is Everything
```
Initial:   [system prompt, user message]
Round 1:   [system, user, assistant (with tool_calls), tool results]
Round 2:   [system, user, asst, results, assistant (with NEW tool_calls), new results]
Round N:   [grows indefinitely, LLM sees ALL history]
```

→ **Single source of truth.** No external state needed.

### SSE Events Are Implicit Signals
```
No:  "round_start", "llm_response_complete", "new_round_beginning"
Yes: Token flow → tool events → token flow (client infers state)

Why: Simpler protocol, less overhead
```

### Only Special Tools Get Special Events
```
✅ rate_cached     ← Exchange rate (client caches)
✅ weather_cached  ← Weather (client caches)  
✅ tripbook_update ← Trip info (client snapshots)
❌ search_flights  ← Just tool_start/tool_result
❌ search_poi      ← Just tool_start/tool_result
❌ web_search      ← Just tool_start/tool_result
```

---

## 📍 Key Line Numbers

| What | Lines | Doc |
|------|-------|-----|
| `/api/chat` endpoint | 115 | See: QUICK_SUMMARY.md |
| **Main loop** | **567-618** | See: LOOP_STRUCTURE.txt |
| LLM call | 572-574 | See: SERVER_FLOW_ANALYSIS.md |
| Tool execution | 590-604 | See: SERVER_FLOW_ANALYSIS.md |
| `token` event | 478, 534 | See: SSE_EVENT_REFERENCE.md |
| `tool_start` | 259, 277 | See: SSE_EVENT_REFERENCE.md |
| `tool_result` | 288, 390 | See: SSE_EVENT_REFERENCE.md |

---

## 🚀 Where to Start

**I want to understand quickly** → Read QUICK_SUMMARY.md (5 min)

**I want the visual overview** → Review LOOP_STRUCTURE.txt (10 min)

**I need to implement a client** → Check SSE_EVENT_REFERENCE.md (15 min)

**I need deep technical details** → Read SERVER_FLOW_ANALYSIS.md (25 min)

**I'm not sure** → Start with INDEX.md (2 min) then choose path A/B/C

---

## 💾 File Locations

```
/Users/geraldhuang/DEV/ai-travel-planner/
├── INDEX.md                    ← Navigation hub
├── QUICK_SUMMARY.md            ← Start here! ⭐
├── LOOP_STRUCTURE.txt          ← Visual diagram
├── SERVER_FLOW_ANALYSIS.md     ← Complete reference
├── SSE_EVENT_REFERENCE.md      ← Event catalog
├── README_ANALYSIS.md          ← This file
└── server.js                   ← Original source (679 lines)
```

---

## ✅ What You Now Know

1. ✓ Main loop structure and flow
2. ✓ How SSE events signal rounds (implicitly)
3. ✓ Complete request lifecycle
4. ✓ How messages[] array grows
5. ✓ Provider abstraction (OpenAI/Anthropic/DeepSeek)
6. ✓ Tool execution pipeline
7. ✓ When each SSE event is emitted
8. ✓ Timeouts and limits (10 rounds, 120s LLM, 30s tools)
9. ✓ TripBook state sync mechanism
10. ✓ Client-side event interpretation

---

## 🎓 Next Steps

**To debug:** Look up line numbers, cross-reference documents

**To build a client:** Focus on SSE_EVENT_REFERENCE.md

**To extend the server:** Reference SERVER_FLOW_ANALYSIS.md

**For presentations:** Use LOOP_STRUCTURE.txt visuals

---

**Generated:** 2024-04-14
**Based on:** `/Users/geraldhuang/DEV/ai-travel-planner/server.js` (679 lines)

