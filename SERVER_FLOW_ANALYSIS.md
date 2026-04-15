# AI Travel Planner — Server.js LLM Call Loop Analysis

## Overview
The `/api/chat` endpoint (line 115) implements a **unified agent chat loop** that handles multiple LLM call rounds with integrated tool execution. The flow supports OpenAI, Anthropic, and DeepSeek providers with **Server-Sent Events (SSE)** for real-time streaming.

---

## 1. Request Entry Point: `/api/chat` Endpoint

**Location:** Lines 115-202

### Setup Phase
```javascript
app.post('/api/chat', validateHeaders(), validate(chatRequestSchema), chatLimiter, toolLimiter, async (req, res) => {
```

**Key initialization steps (lines 115-180):**

1. **Extract request data** (line 116):
   - `messages` - conversation history
   - `provider` - "openai" | "anthropic" | "deepseek"
   - `model` - specific model name
   - `tripBookSnapshot` - client state for trip planning

2. **Configure SSE headers** (lines 127-131):
   ```javascript
   res.setHeader('Content-Type', 'text/event-stream');
   res.setHeader('Cache-Control', 'no-cache');
   res.setHeader('Connection', 'keep-alive');
   res.setHeader('X-Accel-Buffering', 'no');
   res.flushHeaders();
   ```

3. **Define SSE sender** (lines 133-135):
   ```javascript
   const sendSSE = (event, data) => {
     res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
   };
   ```

4. **Initialize TripBook** (line 139):
   - Restored from client snapshot if provided
   - Used to track trip state across LLM rounds

5. **Build system prompt** (line 175):
   ```javascript
   const systemPrompt = buildSystemPrompt(conversationText, tripBook);
   ```

6. **Call main chat handler** (line 180):
   ```javascript
   fullText = await handleChat(provider, apiKey, model, systemPrompt, messages, sendSSE, effectiveBaseUrl, tripBook, reqLog) || '';
   ```

### Wrap-up Phase (lines 182-189)
- Extract quick replies from final response
- Send `quick_replies` SSE event if found
- Send final `done` SSE event
- Log request metrics

### Error Handling (lines 190-201)
- Catch errors and send `error` SSE event
- Capture in Sentry if enabled
- Close response with `res.end()`

---

## 2. Main Chat Loop: `handleChat()` Function

**Location:** Lines 549-634

### Function Signature
```javascript
async function handleChat(provider, apiKey, model, systemPrompt, userMessages, sendSSE, baseUrl, tripBook, reqLog)
```

### The Multi-Round Loop

**Location:** Lines 567-618 (the main `for` loop)

```javascript
const MAX_TOOL_ROUNDS = 10;
let delegationCount = 0;

for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  // Line 568: Log round start
  chatLog.info(`主Agent轮次 ${round + 1}/${MAX_TOOL_ROUNDS}`, { msgCount: messages.length });
  
  // Line 569: Start timer
  const llmTimer = chatLog.startTimer('llm_call');

  // Lines 572-574: Call LLM (provider-specific)
  const { fullText, toolCalls, rawAssistant } = isAnthropic
    ? await streamAnthropic(client, selectedModel, systemPrompt, messages, tools, sendSSE)
    : await streamOpenAI(client, selectedModel, messages, tools, sendSSE);

  // Line 576: Log LLM call completion
  llmTimer.done({ textLen: fullText.length, toolCallCount: toolCalls.length });

  // Lines 578-580: IF NO TOOL CALLS → RETURN TEXT
  if (toolCalls.length === 0) {
    return fullText;
  }

  // Lines 583-587: ADD ASSISTANT MESSAGE TO CONVERSATION
  if (isAnthropic) {
    messages.push({ role: 'assistant', content: rawAssistant });
  } else {
    messages.push(rawAssistant);
  }

  // Lines 589-604: EXECUTE TOOLS
  const toolResults = [];
  for (const tc of toolCalls) {
    // ... delegation limit check ...
    const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);
    toolResults.push({ id: tc.id, content: resultStr });
  }

  // Lines 607-616: ADD TOOL RESULTS TO CONVERSATION
  if (isAnthropic) {
    messages.push({
      role: 'user',
      content: toolResults.map(r => ({ type: 'tool_result', tool_use_id: r.id, content: r.content }))
    });
  } else {
    for (const r of toolResults) {
      messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
    }
  }

  // LOOP CONTINUES: Next iteration calls LLM again with updated messages array
}
```

### Loop State Management

**The `messages` array** evolves through each round:

1. **Start of round 1:**
   - User's `userMessages` (from request)
   - Provider-specific: system prompt location varies

2. **After LLM calls tool:**
   - `messages.push(rawAssistant)` — Add LLM's response with `tool_calls`
   - `messages.push(toolResults)` — Add tool results
   - **Total messages grow with each round**

3. **Round 2+:**
   - LLM sees full conversation history + previous tool results
   - Can make new tool calls based on what it learned
   - Loop repeats until `toolCalls.length === 0`

### Early Exit Conditions

1. **No tool calls** (line 578-580):
   - `if (toolCalls.length === 0) return fullText;`
   - LLM decided the response is complete

2. **Max rounds reached** (lines 620-633):
   - Loop exhausts `MAX_TOOL_ROUNDS = 10`
   - Force final LLM call **without tools** to summarize
   - Prevents infinite loops

---

## 3. SSE Events: Detailed Breakdown

### During LLM Response (streaming tokens)

**Event:** `token`
- **When:** During LLM streaming (lines 478, 534)
- **Provider:** Both OpenAI and Anthropic
- **Data:**
  ```json
  { "text": "部分文本" }
  ```
- **Emitted once per token chunk**

### Between Rounds: Tool Execution

**Event:** `tool_start`
- **When:** Tool execution begins (line 259, 277)
- **Data:**
  ```json
  { "id": "tool-call-id", "name": "search_poi", "arguments": {...} }
  ```

**Event:** `tool_result`
- **When:** Tool execution completes (line 288, 390)
- **Data:**
  ```json
  { "id": "tool-call-id", "name": "search_poi", "resultLabel": "找到 5 个地点" }
  ```

**Event:** `rate_cached` (specialization)
- **When:** Exchange rate tool completes (line 300)
- **Data:**
  ```json
  { "from": "USD", "to": "CNY", "rate": 7.25, "last_updated": "2024-04-14", ... }
  ```

**Event:** `weather_cached` (specialization)
- **When:** Weather tool completes (line 310)
- **Data:**
  ```json
  { "city": "Beijing", "current": {...}, "forecast": [...], ... }
  ```

**Event:** `tripbook_update`
- **When:** `update_trip_info` tool result synced (line 373)
- **Data:**
  ```json
  {
    "constraints": {...},
    "itinerary": {...},
    "phase": "details",
    "_snapshot": {...}  // Full structured state
  }
  ```

### End of Request

**Event:** `quick_replies`
- **When:** Final LLM response complete (line 185)
- **Condition:** Detected numbered list format in response
- **Data:**
  ```json
  { "questions": [
      { "label": "选项1", "value": "选项1" },
      { "label": "选项2", "value": "选项2" }
    ]
  }
  ```

**Event:** `done`
- **When:** Request fully complete (line 188)
- **Data:** `{}`
- **Signals:** No more events will be sent

**Event:** `error` (on failure)
- **When:** Exception caught (line 198)
- **Data:** `{ "message": "error description" }`

---

## 4. Provider-Specific LLM Streaming

### OpenAI Stream Handler
**Location:** Lines 451-517

```javascript
async function streamOpenAI(client, model, messages, tools, sendSSE)
```

**Flow:**
1. Create streaming completion with `tools` parameter
2. Iterate through stream chunks:
   - Extract `delta.content` → send `token` SSE event (line 478)
   - Accumulate `delta.tool_calls` in `toolCallsMap` (lines 481-490)
3. Parse accumulated tool calls into standardized format
4. Return `{ fullText, toolCalls, rawAssistant }`

**Key:** `toolCalls` array is populated **only if** the LLM generated function calls.

### Anthropic Stream Handler
**Location:** Lines 523-547

```javascript
async function streamAnthropic(client, model, systemPrompt, messages, tools, sendSSE)
```

**Flow:**
1. Create streaming message with `tools` parameter
2. Hook `stream.on('text', ...)` → send `token` SSE events (line 534)
3. Wait for `stream.finalMessage()` to complete
4. Filter response content:
   - `type === 'tool_use'` → extract to `toolCalls`
   - `type === 'text'` → accumulate to `fullText`
5. Return `{ fullText, toolCalls, rawAssistant }`

---

## 5. Tool Execution: `runTool()` Function

**Location:** Lines 253-399

### Execution Flow

```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook, delegateCtx, reqLog)
```

**Steps:**

1. **Send tool_start event** (lines 259, 277):
   ```javascript
   sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
   ```

2. **Execute tool** (line 280-284):
   ```javascript
   const result = await withTimeout(
     executeToolCall(funcName, funcArgs),
     TOOL_TIMEOUT_MS,
     `工具 ${funcName}`
   );
   ```

3. **Send tool_result event** (lines 288-291):
   ```javascript
   sendSSE('tool_result', { id: toolId, name: funcName, resultLabel });
   ```

4. **Sync result to TripBook** (lines 294-383):
   - Exchange rates → `rate_cached` event
   - Weather → `weather_cached` event
   - Flights/hotels → internal tripBook state
   - Trip info → `tripbook_update` event
   - Web searches → internal tripBook state

5. **Return result string**

---

## 6. No "Round Start" Event — Why?

**IMPORTANT:** There is **NO explicit SSE event** that signals "starting a new LLM round" or "LLM response complete, about to call tools."

### Why not?
- The client receives continuous `token` events during LLM streaming
- After `token` stream ends, `tool_start` events begin immediately
- The implicit signal is: **token stream ends → tool execution begins**

### Client-side observation (implied timeline):
```
1. token event (LLM text chunk)
2. token event (LLM text chunk)
...
3. tool_start event  ← NEW ROUND beginning, assistant made tool calls
4. tool_result event
5. (potentially) token event ← LLM continuing after tool result
```

### Why SSE design is this way:
- **Simpler protocol** — Don't emit redundant events
- **State inference** — Client can infer state transitions from event flow
- **Streaming efficiency** — Minimize SSE overhead

---

## 7. Complete Event Sequence for Multi-Round Example

### Scenario: User asks for trip plan with flights

```
ROUND 1 - LLM decides to call search_flights
├─ token: "我帮你查找"
├─ token: "北京到"
├─ token: "上海的"
├─ token: "机票..."
├─ tool_start: { name: "search_flights", arguments: {...} }
├─ (tool execution on backend, no events)
├─ tool_result: { name: "search_flights", resultLabel: "找到 3 个航班" }
└─ (toolResults pushed to messages, loop continues)

ROUND 2 - LLM sees flight results, decides to get weather
├─ token: "现在查询目的地"
├─ token: "天气"
├─ tool_start: { name: "get_weather", arguments: {...} }
├─ (tool execution, result synced to tripBook)
├─ weather_cached: { city: "Shanghai", forecast: [...] }
├─ tool_result: { name: "get_weather", resultLabel: "Shanghai 天气已获取" }
└─ (loop continues)

ROUND 3 - LLM sees weather, decides final answer (no tool calls)
├─ token: "根据以上"
├─ token: "信息，我"
├─ token: "建议..."
├─ token: "选择"
├─ token: "东方航空"
├─ token: "...(更多文本)"
└─ [toolCalls.length === 0 → return fullText]

FINAL
├─ quick_replies: { questions: [...] }
└─ done: {}
```

---

## 8. Key Observations

### Messages Array Behavior
- **Grows with each round** — never cleared
- **Provider-specific format:**
  - Anthropic: `{ role: 'assistant', content: [tool_use blocks] }`
  - OpenAI: `{ role: 'assistant', tool_calls: [...] }`
- **Tool results pushed differently:**
  - Anthropic: Single message with array of `{ type: 'tool_result', ... }`
  - OpenAI: One message per tool result

### Streaming Continuity
- **Tokens streamed real-time** during LLM response
- **Tools executed sequentially** (not streamed)
- **Results fed back immediately** before next LLM call
- **No delay or polling** — synchronous round progression

### TripBook Sync
- Updated at two points:
  1. **Tool result sync** (lines 294-383) — state from tools
  2. **Request response** — full snapshot sent to client
- Client can restore TripBook in next request via `tripBookSnapshot`

### Error Resilience
- **Tool timeout:** 30 seconds (TOOL_TIMEOUT_MS)
- **LLM timeout:** 120 seconds (LLM_TIMEOUT_MS)
- **Max tool rounds:** 10 (prevents infinite loops)
- **Delegation limit:** Max 2 per request (line 594)

---

## 9. Exact Line References

| Concept | Line(s) | Description |
|---------|---------|-------------|
| Endpoint definition | 115 | `/api/chat` POST handler start |
| SSE setup | 127-131 | Headers configuration |
| sendSSE function | 133-135 | SSE event emitter |
| Main chat handler call | 180 | Entry to handleChat() |
| Messages array initialization | 560-562 | Provider-specific setup |
| Main loop start | 567 | `for (let round = 0; ...)` |
| LLM call | 572-574 | streamOpenAI/streamAnthropic |
| No tools exit | 578-580 | `if (toolCalls.length === 0) return fullText` |
| Assistant message push | 583-587 | Add LLM response to conversation |
| Tool execution loop | 590-604 | Execute each tool call |
| Tool results push | 607-616 | Add results back to conversation |
| Loop end | 618 | } (implicit loop back) |
| Max rounds exit | 620-633 | Final LLM call without tools |
| TripBook sync | 294-383 | Tool result → TripBook → SSE events |
| Quick replies | 183-185 | Extract and send quick replies |
| Done event | 188 | Signal request completion |

---

## 10. Summary: Multi-Round Flow Diagram

```
[Client HTTP POST /api/chat]
            ↓
[Setup: TripBook, systemPrompt, messages array]
            ↓
[Enter Main Loop: for (round = 0; round < MAX_TOOL_ROUNDS; round++)]
            ↓
    ┌───────────────────────────────────────────┐
    │ Round N:                                  │
    │                                           │
    │ 1. Call LLM (provider-specific)           │
    │    ├─ Stream tokens → sendSSE('token')    │
    │    └─ Collect tool_calls                  │
    │                                           │
    │ 2. Check tool_calls:                      │
    │    └─ if (length === 0) RETURN fullText   │
    │                                           │
    │ 3. Push assistant message to messages[]   │
    │                                           │
    │ 4. For each tool call:                    │
    │    ├─ sendSSE('tool_start')               │
    │    ├─ Execute tool                        │
    │    ├─ Sync to TripBook + SSE events       │
    │    ├─ sendSSE('tool_result')              │
    │    └─ Push result to toolResults[]        │
    │                                           │
    │ 5. Push tool results to messages[]        │
    │                                           │
    │ 6. LOOP BACK → Round N+1                  │
    └───────────────────────────────────────────┘
            ↓
[If MAX_TOOL_ROUNDS exhausted: Final LLM call without tools]
            ↓
[Extract quick_replies from final response]
            ↓
[sendSSE('done')]
            ↓
[res.end()]
```

---

## 11. Critical Design Patterns

### Pattern 1: Implicit Round Signaling
**No explicit "round start" event.** The event sequence itself signals progression:
- `token` stream = LLM thinking
- `tool_start` + `tool_result` = tool execution phase
- Back to `token` = LLM using tool results

### Pattern 2: Messages Array as State Machine
The conversation history is the **single source of truth** for multi-round state:
- Each round appends: `[assistant message, tool results]`
- LLM sees full history
- No external state management needed

### Pattern 3: Provider Abstraction
Both OpenAI and Anthropic use the same loop logic:
- Different `streamOpenAI()` vs `streamAnthropic()` implementations
- Same return signature: `{ fullText, toolCalls, rawAssistant }`
- Same tool result format transformation (lines 607-616)

### Pattern 4: TripBook Sync on Tool Result
Instead of SSE events for every tool result, selective events:
- `rate_cached` — only for exchange rates
- `weather_cached` — only for weather
- `tripbook_update` — only for `update_trip_info` tool
- Others logged but not SSE'd

---

## 12. Client Observable Behavior

From the client's perspective, the event stream looks like:

```
event: token
data: {"text":"..."}

event: token
data: {"text":"..."}

[tool execution happens, client can't observe]

event: tool_start
data: {"id":"...","name":"search_flights",...}

event: tool_result
data: {"id":"...","name":"search_flights","resultLabel":"..."}

[new LLM round begins]

event: token
data: {"text":"..."}

...repeat until no tool calls...

event: quick_replies
data: {"questions":[...]}

event: done
data: {}
```

**No explicit "round boundary" markers** — client infers from event stream.

