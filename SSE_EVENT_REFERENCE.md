# SSE Event Reference — Complete Guide

## All Possible SSE Events

| Event | When | Data Structure | Line(s) | Round |
|-------|------|-----------------|---------|-------|
| `token` | LLM streaming text | `{ text: string }` | 478, 534 | During LLM call |
| `tool_start` | Tool execution begins | `{ id, name, arguments }` | 259, 277 | Between LLM calls |
| `tool_result` | Tool execution completes | `{ id, name, resultLabel }` | 288, 390 | Between LLM calls |
| `rate_cached` | Exchange rate tool done | `{ from, to, rate, last_updated, fetched_at, ttl }` | 300 | Between LLM calls |
| `weather_cached` | Weather tool done | `{ city, current, forecast, fetched_at, ttl }` | 310 | Between LLM calls |
| `tripbook_update` | Trip info updated | `{ constraints, itinerary, phase, _snapshot }` | 373 | Between LLM calls |
| `quick_replies` | Response complete (optional) | `{ questions: [{ label, value }, ...] }` | 185 | After final LLM call |
| `done` | Request finished | `{}` | 188 | End of request |
| `error` | Exception thrown | `{ message: string }` | 198 | On error |

## Typical Event Sequences

### Scenario 1: LLM Responds Without Tools
```
token → token → token → ... → token
                                ↓
                         quick_replies (optional)
                                ↓
                              done
```

### Scenario 2: LLM Makes One Tool Call
```
token → token → token
           ↓
    tool_start
           ↓
    tool_result (or rate_cached / weather_cached)
           ↓
    token → token → token → ... → token
                                  ↓
                          quick_replies (optional)
                                  ↓
                                done
```

### Scenario 3: LLM Makes Multiple Tool Calls in One Round
```
token → token
    ↓
tool_start (tool1)
    ↓
tool_result (tool1)
    ↓
tool_start (tool2)
    ↓
weather_cached + tool_result (tool2)
    ↓
tool_start (tool3)
    ↓
rate_cached + tool_result (tool3)
    ↓
token → token → ... → token
                      ↓
                   done
```

### Scenario 4: Multi-Round (2 Rounds)
```
[ROUND 1]
token → token
    ↓
tool_start (search_flights)
    ↓
tool_result
    ↓
[ROUND 2 - LLM called again with tool results]
token → token → token
    ↓
tool_start (get_weather)
    ↓
weather_cached + tool_result
    ↓
[ROUND 3 - LLM called again]
token → token → token → ... → token
                              ↓
                          done
```

## Key Insights

### 1. No Explicit "Round Start" Event
- **There is NO event like `round_start` or `llm_call_start`**
- The client must infer rounds from the event stream
- Implicit signals:
  - `token` events → LLM is responding
  - `tool_start` → LLM decided to call tools
  - Back to `token` → LLM continuing with tool results

### 2. Specialized Tool Events
- **Only certain tools emit special events:**
  - `get_exchange_rate` → `rate_cached`
  - `get_weather` → `weather_cached`
  - `update_trip_info` → `tripbook_update`
- **Other tools** emit only `tool_start` → `tool_result`
- **Why?** Client needs to update its cache/state for rates/weather/tripbook

### 3. Tool Result Labels
- `tool_result` includes optional `resultLabel` field
- Can be `null` (tool execution failed or label couldn't be extracted)
- Examples:
  - `search_flights`: "找到 3 个航班"
  - `search_poi`: "找到 5 个地点"
  - `web_search`: "找到 42 条结果：「Beijing food…」"
  - `get_weather`: "Beijing 2024-04-14 ~ 2024-04-20 平均高温 18°C"

### 4. TripBook Sync Behavior
```
Tool Result      Special Event?    Also sends?        Purpose
─────────────────────────────────────────────────────────────
rate_cached      YES (rate_cached)  tool_result       Client caches rate
weather_cached   YES (weather_cached) tool_result     Client caches weather
update_trip_info YES (tripbook_update) tool_result    Client restores full snapshot
search_flights   NO                  tool_result      TripBook internal only
search_hotels    NO                  tool_result      TripBook internal only
web_search       NO                  tool_result      TripBook internal only
search_poi       NO                  tool_result      TripBook internal only
```

## When Does Server Stop Emitting Events?

### 1. Normal Completion
- LLM returns response with **no tool calls**
- Server returns `fullText` at line 579
- Emits `quick_replies` (if applicable) + `done`
- Closes response

### 2. Max Rounds Reached
- Loop reaches `MAX_TOOL_ROUNDS = 10`
- Executes final LLM call **without tools** (line 626-627)
- Forces response completion
- Emits `done`

### 3. Error
- Exception caught (line 190)
- Emits `error` event with message
- Closes response

## Line-by-Line Event Emission

| Event | Line(s) | Condition |
|-------|---------|-----------|
| `token` | 478 | OpenAI: delta.content exists |
| `token` | 534 | Anthropic: stream.on('text') fires |
| `tool_start` | 259 | Special case: delegate_to_agents |
| `tool_start` | 277 | General tools: before execution |
| `tool_result` | 288 | After successful tool execution |
| `tool_result` | 390 | After tool execution error |
| `rate_cached` | 300 | get_exchange_rate succeeds + has rate |
| `weather_cached` | 310 | get_weather succeeds + no error |
| `tripbook_update` | 373 | update_trip_info succeeds + has updates |
| `quick_replies` | 185 | Final response contains numbered list |
| `done` | 188 | After quick_replies check (always sent) |
| `error` | 198 | Exception in try block |

## Implementation: How to Listen (Client Side)

```javascript
const eventSource = new EventSource('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ messages, provider, model })
});

eventSource.addEventListener('token', (e) => {
  const { text } = JSON.parse(e.data);
  // Append text to display
});

eventSource.addEventListener('tool_start', (e) => {
  const { id, name, arguments } = JSON.parse(e.data);
  // Show "🔧 Searching..." indicator
});

eventSource.addEventListener('tool_result', (e) => {
  const { id, name, resultLabel } = JSON.parse(e.data);
  // Show result label or default message
});

eventSource.addEventListener('rate_cached', (e) => {
  const { from, to, rate } = JSON.parse(e.data);
  // Cache rate in localStorage
});

eventSource.addEventListener('weather_cached', (e) => {
  const { city, forecast } = JSON.parse(e.data);
  // Cache weather in localStorage
});

eventSource.addEventListener('tripbook_update', (e) => {
  const { _snapshot } = JSON.parse(e.data);
  // Save full TripBook snapshot for next request
});

eventSource.addEventListener('quick_replies', (e) => {
  const { questions } = JSON.parse(e.data);
  // Show clickable buttons
});

eventSource.addEventListener('done', (e) => {
  // Close event source, show completion
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  const { message } = JSON.parse(e.data);
  // Show error message
  eventSource.close();
});
```

## State Tracking from Events

A client-side state machine could look like:

```
STATE: "streaming"
  - Receiving token events
  - Count tokens, display incrementally
  
EVENT: tool_start → STATE: "tool_running"
  - Show loading indicator with tool name
  
EVENT: tool_result → STATE: "streaming" (or continue_tools)
  - Show tool result label
  - If more tools: stay in tool phase
  - If back to tokens: return to streaming
  
EVENT: done → STATE: "done"
  - Close stream
  - Allow new input
```

---

## Common Pitfalls for Clients

### ❌ Waiting for "round_start" event
- **There is none.** Infer from `token` + `tool_start` sequence.

### ❌ Expecting all tool results to have special events
- **Only rate_cached, weather_cached, tripbook_update have special events.**
- Other tools only emit `tool_start` + `tool_result`.

### ❌ Assuming quick_replies always present
- **Optional.** Only if final response matches numbered list pattern.
- Don't fail if missing; just don't show buttons.

### ❌ Not storing `_snapshot` from tripbook_update
- **You need this to pass back in next request.**
- Without it, server won't have state from previous rounds.

---

## Server-Side Constants

```javascript
const MAX_TOOL_ROUNDS = 10;        // Line 564: max rounds per request
const LLM_TIMEOUT_MS = 120000;     // Line 444: 120 seconds
const TOOL_TIMEOUT_MS = 30000;     // Line 445: 30 seconds
```

If you see these timeout values in logs, request exceeded limits.

