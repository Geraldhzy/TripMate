# AI Travel Planner — Server.js Multi-LLM Round Loop: Quick Summary

## TL;DR

The `/api/chat` endpoint (line 115) streams responses via SSE. It runs a **multi-round loop** (lines 567-618) where:

1. **Call LLM** (line 572-574) → streams `token` events in real-time
2. **If LLM made tool calls:** push assistant message to conversation (line 583-587)
3. **Execute tools** (line 590-604) → emit `tool_start` → `tool_result` events
4. **Push tool results** to conversation (line 607-616)
5. **Loop back to step 1** with updated conversation history
6. **Exit when:** LLM makes no tool calls OR max 10 rounds reached

**Key: There is NO explicit "round start" event.** The client infers rounds from the SSE event stream.

---

## The Main Loop (Lines 567-618)

```javascript
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  
  // 1. CALL LLM
  const { fullText, toolCalls, rawAssistant } = 
    isAnthropic 
      ? await streamAnthropic(...)  // Emits: token events
      : await streamOpenAI(...);     // Emits: token events
  
  // 2. CHECK IF DONE
  if (toolCalls.length === 0) {
    return fullText;  // Exit loop → send done event
  }
  
  // 3. ADD ASSISTANT MESSAGE
  messages.push(rawAssistant);  // Assistant response with tool calls
  
  // 4. EXECUTE TOOLS
  const toolResults = [];
  for (const tc of toolCalls) {
    const resultStr = await runTool(...);  // Emits: tool_start, tool_result
    toolResults.push({ id: tc.id, content: resultStr });
  }
  
  // 5. ADD TOOL RESULTS
  messages.push({
    role: 'user',                     // Or 'tool' for OpenAI
    content: toolResults.map(...)
  });
  
  // Loop continues → LLM called again with updated messages[]
}
```

---

## SSE Events at Each Stage

| Stage | Event | Data | When |
|-------|-------|------|------|
| **LLM Response** | `token` | `{text}` | During LLM streaming (real-time) |
| **Tool Execution** | `tool_start` | `{id, name, arguments}` | Before tool runs |
| **Tool Complete** | `tool_result` | `{id, name, resultLabel}` | After tool finishes |
| **Special (Rate)** | `rate_cached` | `{from, to, rate, ...}` | If rate tool succeeds |
| **Special (Weather)** | `weather_cached` | `{city, forecast, ...}` | If weather tool succeeds |
| **Special (Trip)** | `tripbook_update` | `{constraints, itinerary, ...}` | If update_trip_info succeeds |
| **End (Optional)** | `quick_replies` | `{questions}` | If response has numbered list |
| **Done** | `done` | `{}` | Always sent at end |

---

## Client Event Stream Timeline

### Example 1: No Tools (Quick Answer)
```
token: "帮你查找"
token: "北京机票"
done: {}
```

### Example 2: Single Round with Tools
```
token: "我来帮你..."
token: "搜索"
tool_start: {name: "search_flights"}
tool_result: {name: "search_flights", resultLabel: "找到 3 个航班"}
token: "根据搜索结果"
token: "..."
done: {}
```

### Example 3: Multi-Round (2 Rounds)
```
[ROUND 1]
token: "搜索机票"
tool_start: {name: "search_flights"}
tool_result: {name: "search_flights"}

[ROUND 2 - LLM CALLED AGAIN WITH TOOL RESULTS]
token: "现在查询天气"
tool_start: {name: "get_weather"}
weather_cached: {city: "Shanghai", ...}
tool_result: {name: "get_weather"}

[ROUND 3 - FINAL LLM RESPONSE]
token: "根据以上信息"
token: "建议选择..."
done: {}
```

**Note:** No explicit "round 2 started" event. Client infers new round from event pattern.

---

## answers to Your Specific Questions

### 1️⃣ How does the main chat loop work?

**Location:** Lines 567-618 in `handleChat()`

The loop:
1. Calls LLM with current `messages[]` array
2. LLM returns response (text + optional tool calls)
3. If no tool calls → return text (exit loop)
4. If tool calls → append assistant message to `messages[]`
5. Execute each tool → collect results
6. Append tool results to `messages[]` 
7. Loop back with expanded `messages[]` array

**The `messages[]` array is the state machine.** It grows with each round and the LLM sees all history.

### 2️⃣ What SSE events signal round progression?

**There is NO explicit "round start" or "round complete" event.**

The client must **infer** from event patterns:

```
token stream ending
  ↓ (implicit: end of LLM response)
tool_start event(s)
  ↓ (implicit: tools are running)
tool_result event(s)
  ↓ (implicit: new LLM round beginning)
token stream again
```

**Why not add explicit events?**
- Simpler protocol (less SSE overhead)
- State is implicit in event flow
- Clients can infer from existing events

### 3️⃣ Full request handling flow

**Endpoint:** `POST /api/chat` (line 115)

**Setup (lines 115-180):**
- Extract request: `{messages, provider, model, tripBookSnapshot}`
- Configure SSE headers
- Initialize TripBook
- Build system prompt
- Call `handleChat()` → returns `fullText`

**Main Loop (lines 549-634 in `handleChat()`):**
- Initialize `messages[]` array (line 560-562)
- For up to 10 rounds (line 567):
  - Call LLM with `messages[]` (line 572-574)
  - Stream `token` events to client
  - If no tool calls → exit loop (line 578-580)
  - Push assistant message (line 583-587)
  - Execute tools → emit `tool_start` + `tool_result` (line 590-604)
  - Push results to `messages[]` (line 607-616)
  - Loop back

**Wrap-up (lines 182-189):**
- Extract quick replies from response
- Send `quick_replies` event if applicable
- Send `done` event
- Close response

**Error Handling (lines 190-201):**
- Catch exception → send `error` event
- Close response

---

## Key Line References

| What | Lines |
|------|-------|
| `/api/chat` endpoint | 115 |
| SSE setup | 127-131 |
| sendSSE function | 133-135 |
| handleChat() entry | 180 |
| handleChat() signature | 549 |
| messages[] init | 560-562 |
| Main loop start | 567 |
| LLM call | 572-574 |
| No tools exit | 578-580 |
| Assistant message | 583-587 |
| Tool execution | 590-604 |
| Tool results | 607-616 |
| Max rounds fallback | 620-633 |
| runTool() | 253-399 |
| streamOpenAI() | 451-517 |
| streamAnthropic() | 523-547 |
| token event (OpenAI) | 478 |
| token event (Anthropic) | 534 |
| tool_start | 259, 277 |
| tool_result | 288, 390 |
| rate_cached | 300 |
| weather_cached | 310 |
| tripbook_update | 373 |
| quick_replies | 185 |
| done event | 188 |

---

## Critical Design Patterns

### 1. Single Source of Truth: `messages[]`
- Contains full conversation history
- Grows with each round
- LLM sees all context
- No external state needed

### 2. Implicit Round Signaling
- Events themselves indicate state transitions
- `token` = LLM thinking
- `tool_start/result` = tool phase
- Back to `token` = new round

### 3. Provider Abstraction
- OpenAI and Anthropic have different APIs
- Both wrapped into same interface: `{fullText, toolCalls, rawAssistant}`
- Same loop logic works for both

### 4. Selective SSE Events
- Only high-value data gets special events:
  - `rate_cached` — for exchange rates (client cache)
  - `weather_cached` — for weather (client cache)
  - `tripbook_update` — for trip state (client snapshot)
- Other tools just emit `tool_start` → `tool_result`

---

## Timeouts & Limits

```javascript
const MAX_TOOL_ROUNDS = 10;        // Max rounds per request
const LLM_TIMEOUT_MS = 120000;     // 120 seconds per LLM call
const TOOL_TIMEOUT_MS = 30000;     // 30 seconds per tool
const delegationCount <= 2;        // Max delegations per request
```

---

## What Clients Should Know

1. **No explicit round marker** → infer from event patterns
2. **Save `_snapshot` from `tripbook_update`** → pass back next request
3. **Not all tools emit special events** → only rate/weather/trip_info
4. **Tools execute sequentially** (not in parallel)
5. **Final `done` event always sent** → can reliably close stream
6. **Tokens stream real-time** → accumulate for live display
7. **Tool labels are optional** → `null` if tool failed

---

## Files to Review

- **SERVER_FLOW_ANALYSIS.md** — Detailed breakdown of every section
- **SSE_EVENT_REFERENCE.md** — Complete event catalog + client implementation
- **LOOP_STRUCTURE.txt** — Visual flowchart of entire request

