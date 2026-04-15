# AI Travel Planner - Quick Reference Guide

## 🎯 What This Project Does
A conversational AI travel planner where:
- Users chat to plan complete trips (flights, hotels, itineraries, budgets)
- Real-time AI streaming via SSE (Server-Sent Events)
- Multi-agent system: main agent + flight/research sub-agents
- TripBook state synced between frontend (sessionStorage) and backend (stateless)

---

## 📊 Core Architecture

### Request Flow
```
User Message → Frontend SSE Connect → Backend /api/chat 
  → System Prompt (dynamic) → Main Agent LLM Loop 
  → Tool Calls (if any) → Sub-agents (if delegation) 
  → Sync TripBook → SSE Events Streaming → Frontend Renders
```

### Three Key Layers
1. **Frontend:** Vanilla JS + SSE streaming, no frameworks
2. **Backend:** Express + Node.js, stateless (TripBook passed back-and-forth)
3. **LLM Agents:** Main agent + Flight/Research sub-agents (parallel delegation)

---

## 🔑 Key Files

| File | Purpose |
|------|---------|
| `server.js` | Main backend: /api/chat endpoint, agentic loop (30 rounds max), SSE streaming |
| `models/trip-book.js` | TripBook model (3 layers: dynamic/constraints/itinerary) |
| `tools/index.js` | Tool registry & executor |
| `agents/delegate.js` | Delegation orchestrator (parallel flight + research) |
| `prompts/system-prompt.js` | Dynamic system prompt generator |
| `public/js/chat.js` | Frontend SSE handler, message rendering |
| `public/js/itinerary.js` | Right-side trip panel UI |
| `middleware/security.js` | Helmet, CORS, security headers |
| `middleware/validation.js` | Input validation + sanitization |

---

## 🚀 AI Response Generation Flow

### Streaming vs Non-Streaming
- **ALL responses stream via SSE** (no polling or webhooks)
- User sees text appearing token-by-token in real-time
- 10+ SSE event types for different stages

### SSE Event Types
```
'thinking'              → AI is thinking (shows spinner)
'token'                 → Text token (stream content)
'thinking_done'         → Finished thinking
'tool_start'            → Tool execution starting
'tool_result'           → Tool completed
'tripbook_update'       → State changed (flights/hotels/itinerary)
'agents_batch_start'    → Sub-agent delegation starting
'agents_batch_done'     → Sub-agent delegation completed
'agent_error'           → Sub-agent failed
'quick_replies'         → AI-suggested follow-up questions
'done'                  → Response complete
'error'                 → Error occurred
```

### Agentic Loop (Max 30 Rounds)
```
Round 1: LLM generates response + tool_calls
  ├─ If NO tool_calls: return response, exit
  └─ If tool_calls exist: execute, add to history, loop...
Round 2: LLM continues with tool results
Round 3+: Repeat until LLM says done
```

---

## 🛠️ Tool System

### Available Tools
1. **web_search** - Search the web
2. **search_poi** - Find points of interest
3. **search_flights** - Search flights (sub-agent exclusive!)
4. **search_hotels** - Search hotels
5. **update_trip_info** - Write to TripBook
6. **delegate_to_agents** - Delegate to flight/research sub-agents

### Tool Access Control
- **Main Agent:** Can use all EXCEPT search_flights (must delegate)
- **Flight Agent:** Can use search_flights + web_search
- **Research Agent:** Can use web_search only

---

## 👥 Multi-Agent System

### Main Agent
- Role: Travel planning orchestrator
- Tools: All except search_flights
- Rounds: 30 max
- Can delegate to sub-agents

### Sub-Agents (Parallel Execution)
```
Flight Agent                    Research Agent
├─ search_flights             ├─ web_search only
├─ web_search                 ├─ Rounds: 2 max
├─ Rounds: 3 max              ├─ Tokens: 8192 max
├─ Tokens: 4096 max           └─ Topics: Visas, weather,
└─ Purpose: Flight search         attractions, food, transport
   and airline research
```

### Delegation Flow
```javascript
Main Agent → delegate_to_agents({
  tasks: [
    {agent: 'flight', task: '...'},
    {agent: 'research', task: '...'}
  ]
}) → Parallel execution → Merge results → Main Agent continues
```

---

## 📦 TripBook - Single Source of Truth

### Layer 1: Dynamic Data
```javascript
{
  flightQuotes: [{id, route, airline, price_usd, ...}],
  hotelQuotes: [{id, name, city, checkin, checkout, price_cny, ...}],
  webSearches: [{query, summary, fetched_at}]
}
```

### Layer 2: User Constraints
```javascript
{
  destination, departCity, dates, people, budget, preferences, specialRequests
}
```

### Layer 3: Structured Itinerary
```javascript
{
  phase: 0|1|2|3|4,      // Planning stage
  route: ["Tokyo", "Kyoto"],
  days: [{day, city, title, segments[]}],
  budgetSummary: {...},
  reminders: [...],
  practicalInfo: [...]
}
```

### Planning Phases
- **Phase 1:** Gather requirements + lock constraints
- **Phase 2:** Major transport + destination research (delegate!)
- **Phase 3:** Fill details (POIs, restaurants, hotels)
- **Phase 4:** Budget summary & final itinerary

---

## 🔄 Response Handling Patterns

### Text Streaming
```javascript
// Backend
for await (const chunk of llmStream) {
  sendSSE('token', {text: chunk.delta.content});
}

// Frontend
fullText += data.text;
bubble.innerHTML = renderMarkdown(fullText);
```

### Tool Execution
```javascript
// Backend
sendSSE('tool_start', {id, name, arguments});
result = await executeToolCall(name, args);
sendSSE('tool_result', {id, name, resultLabel});

// Frontend
Show spinner → wait for tool_result → show ✅
```

### Delegation
```javascript
// Backend
sendSSE('agents_batch_start', {agents: [...]});
results = await Promise.all([agent1, agent2]);
sendSSE('agents_batch_done', {success, failed});

// Frontend
Show "✈️ | 📋" running → wait for batch_done → show completion
```

---

## 🔐 Security & Rate Limiting

- **Rate Limits:** 100 req/hr general, 20 req/hr chat, 50 req/hr tools
- **Rate Limit Bypass:** `X-Skip-Rate-Limit: {secret_key}`
- **Headers:** Helmet.js for CSP, XSS protection, etc.
- **Validation:** Joi schemas for request body/headers
- **CORS:** Configurable allowed origins
- **Sentry:** Error monitoring + performance tracing (optional)

---

## 💾 Configuration

### Environment Variables (`.env`)
```
NODE_ENV=development
PORT=3002
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
RATE_LIMIT_BYPASS_KEY=secret
CORS_ORIGINS=http://localhost:3000,http://localhost:3002
SENTRY_DSN=
LOG_LEVEL=info
```

**Important:** API Keys come from **client via headers**, never stored on server!

### System Prompt (Dynamic)
- Generated per request with current context
- Injects: current date/time, planning methodology, tool strategies
- Length: ~4000 tokens
- Forbidden output: Technical terms (Agent, delegate, tool_calls, etc.)

---

## 🌐 Frontend State Management

### localStorage
```javascript
tp_provider  // 'openai' | 'anthropic' | 'deepseek'
tp_model     // Selected model name
tp_apiKey    // API Key (never sent to server)
tp_baseUrl   // Custom API endpoint (optional)
```

### sessionStorage
```javascript
tp_tripbook_snapshot  // TripBook JSON for cross-request context
tp_tripbook           // Backup TripBook state
```

---

## 📞 API Endpoints

### POST /api/chat (SSE Streaming)
**Request:**
```javascript
{
  messages: [{role, content}, ...],
  provider: 'openai' | 'anthropic' | 'deepseek',
  model: 'gpt-4o' | 'claude-sonnet-4' | 'deepseek-chat',
  tripBookSnapshot: {constraints, itinerary},
  knownRates: [{from, to, rate}],
  knownWeather: [{city, forecast}]
}

// Headers
X-Api-Key: sk-...
X-Base-Url: https://custom-api.com/v1 (optional)
```

**Response:** SSE stream (events: token, thinking, tool_*, tripbook_update, done, error)

---

## 📈 Frontend Rendering Flow

```
SSE 'token' → Append text → renderMarkdown() → Update DOM → scrollToBottom()
SSE 'tool_result' → Show ✅ label
SSE 'tripbook_update' → updateItinerary() → renderPanel() (right sidebar)
SSE 'quick_replies' → showQuickReplies()
SSE 'done' → Disable streaming state
```

---

## 🎨 UI Components

- **Left Panel:** Chat history + message input
- **Right Panel:** Live itinerary (flights, hotels, daily schedule, budget)
- **Settings Drawer:** Provider, model, API key, base URL
- **History Drawer:** Past trips (via localStorage/sessionStorage)

---

## ⏱️ Timeouts & Limits

| Setting | Value |
|---------|-------|
| Max agentic rounds | 30 |
| Tool execution timeout | ~30 seconds |
| Sub-agent timeout | 120 seconds (per agent) |
| Request timeout | LLM dependent |
| Main agent max tokens | 8192 |
| Flight agent max tokens | 4096 |
| Research agent max tokens | 8192 |

---

## 🚀 Performance Notes

1. **Stateless Backend:** TripBook restored from client per request
2. **Parallel Delegation:** Flight + research agents run simultaneously
3. **Covered Topics Tracking:** Prevents duplicate web_search calls
4. **Tool Result Truncation:** Long results capped to avoid context bloat
5. **Streaming:** Real-time token delivery (no buffering)

---

## 📚 Documentation Structure

- **Full Report:** `PROJECT_EXPLORATION_REPORT.md` (819 lines, comprehensive)
- **Quick Reference:** `EXPLORATION_QUICK_REFERENCE.md` (this file)
- **Code Comments:** Inline documentation in server.js, chat.js, itinerary.js

---

## 🔍 Key Concepts to Understand

1. **SSE Streaming:** All responses are stream-based, not request-response
2. **Agentic Loop:** LLM runs in a loop, making tool calls until it's done
3. **Tool Interception:** Main agent blocked from calling search_flights (must delegate)
4. **Covered Topics:** Sub-agent results include topics to prevent duplication
5. **TripBook Sync:** All state changes streamed to frontend via tripbook_update
6. **Dynamic Prompts:** System prompt changes per request (current date, trip context)
7. **Multi-Agent Parallelism:** Flight + research agents run simultaneously
8. **Client-Side Secrets:** API keys never touch the server
9. **Stateless Design:** Server doesn't persist session data (frontend maintains TripBook)
10. **Real-Time UI:** Right panel updates live as AI discovers flights/hotels/info

