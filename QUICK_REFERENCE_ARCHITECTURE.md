# AI Travel Planner - Quick Reference Architecture Guide

## 🎯 What This Project Does

A **conversational AI travel planner** that helps users (Chinese travelers) plan international trips by:
- Understanding travel preferences through multi-turn chat
- Searching real-time flights, hotels, attractions
- Generating structured day-by-day itineraries
- Tracking budget and logistics

**Demo**: User says "Plan a 5-day trip to Bali, budget 10k CNY" → AI asks clarifying questions → searches flights/hotels → builds itinerary

---

## 🏗️ Architecture at a Glance

### Request → Response Flow
```
User Message
    ↓
Browser (public/js/chat.js)
    ↓ [POST /api/chat + TripBook snapshot + API Key]
Server (server.js)
    ├─ Validate request (middleware/)
    ├─ Restore TripBook from client snapshot
    ├─ Build dynamic system prompt
    ├─ Call LLM via OpenAI SDK
    ├─ Execute tools (web_search, update_trip_info, etc.)
    ├─ Sync results to TripBook
    └─ Stream response via SSE
    ↓ [SSE events: 'token', 'tool_result', 'tripbook_update', 'done']
Browser receives stream
    ├─ Appends tokens to chat bubble
    ├─ Shows tool execution labels
    ├─ Updates itinerary panel
    └─ Saves TripBook snapshot to sessionStorage
```

---

## 📦 Tech Stack

| What | How |
|------|-----|
| **Backend** | Node.js + Express |
| **LLM** | OpenAI SDK (supports OpenAI, Claude, DeepSeek) |
| **Frontend** | HTML5 + Vanilla JS |
| **Streaming** | Server-Sent Events (SSE) |
| **Auth** | API Key in header (X-Api-Key) |
| **Rate Limiting** | express-rate-limit (100/hr global, 20/hr chat) |
| **Security** | Helmet, CORS, sanitization |

---

## 🤖 Agent Architecture

### Main Agent (in server.js `handleChat`)
- Orchestrates conversation
- Calls LLM in a loop (max 30 iterations)
- Executes tools (web_search, flight_search, etc.)
- Decides when to delegate to Sub-Agents

### Sub-Agents (in agents/sub-agent-runner.js)
- **Flight Agent**: Specialized flight search with airline research
- **Research Agent**: Destination research (visa, weather, food, etc.)
- Accessed via `delegate_to_agents` tool
- Execute in parallel

### Key Files
- `server.js` - Main chat loop (~910 lines)
- `agents/delegate.js` - Delegation orchestrator
- `agents/sub-agent-runner.js` - Sub-agent execution
- `agents/prompts/` - Agent-specific system prompts

---

## 💾 Data Model: TripBook

**3-Layer persistent state:**

```javascript
TripBook {
  // Layer 1: Dynamic data (ephemeral)
  dynamic: {
    flightQuotes: [{airline, price_usd, duration, ...}],
    hotelQuotes: [{name, city, price_per_night, ...}],
    webSearches: [{query, summary, fetched_at}]
  },
  
  // Layer 2: User constraints (persistent)
  constraints: {
    destination: {value, cities[], confirmed},
    departCity: {value, airports[], confirmed},
    dates: {start, end, days, flexible, confirmed},
    people: {count, details, confirmed},
    budget: {value, per_person, currency, confirmed},
    preferences: {tags[], notes, confirmed}
  },
  
  // Layer 3: Structured itinerary (persistent)
  itinerary: {
    phase: 1-4,        // Planning stage
    theme: string,     // e.g., "海岛潜水·城市探索"
    route: [],         // ["Tokyo", "Kyoto", "Osaka"]
    days: [{           // Day-by-day breakdown
      day: 1,
      date: "2026-06-15",
      city: "Tokyo",
      segments: [{...}]
    }],
    budgetSummary: {flights, hotels, ...},
    reminders: [],
    practicalInfo: []
  }
}
```

**How it persists:**
- Sent by client as JSON snapshot with each request
- Server restores state → processes → syncs updates
- Client saves updated snapshot to sessionStorage
- No database needed (stateless + client-side persistence)

---

## 🛠️ Tools Available

| Tool | Used By | Function |
|------|---------|----------|
| `web_search` | Main Agent | Search internet (Bing HTTPS) |
| `search_flights` | Flight Sub-Agent only | Mock flight data |
| `search_hotels` | Main Agent | Mock hotel data |
| `search_poi` | Main Agent | Points of interest |
| `update_trip_info` | Main Agent | Persist constraints + itinerary to TripBook |
| `delegate_to_agents` | Main Agent | Offload to Flight + Research agents (parallel) |

---

## 🔄 Streaming (SSE) Events

What frontend receives in real-time:

| Event | Meaning |
|-------|---------|
| `thinking` | LLM is processing |
| `token` | Text chunk from LLM (`{text}`) |
| `thinking_done` | LLM finished |
| `tool_start` | Tool executing (`{id, name}`) |
| `tool_result` | Tool done (`{id, name, resultLabel}`) |
| `tripbook_update` | State changed (`{...panelData}`) |
| `agents_batch_start` | Sub-agents delegated (`{count, agents[]}`) |
| `quick_replies` | Suggested next questions (`{questions[]}`) |
| `done` | Response complete |
| `error` | Error occurred (`{message}`) |

---

## 📁 Key Files by Function

### Core LLM Logic
- **server.js** - Chat endpoint, agent loop, SSE streaming (910 lines)
- **prompts/system-prompt.js** - Dynamic prompt builder

### Data & State
- **models/trip-book.js** - TripBook class (300+ lines)

### Tools
- **tools/index.js** - Tool registry
- **tools/web-search.js** - Bing search (200+ lines)
- **tools/\*.js** - Other tool implementations

### Agents
- **agents/delegate.js** - Delegation to sub-agents
- **agents/sub-agent-runner.js** - Sub-agent loop
- **agents/config.js** - Agent definitions
- **agents/prompts/\*.js** - Agent-specific prompts

### Middleware
- **middleware/security.js** - Helmet, CORS, CSP
- **middleware/validation.js** - Joi schemas, sanitization

### Frontend
- **public/js/chat.js** - Chat UI + SSE receiver (1191 lines)
- **public/js/itinerary.js** - Itinerary panel (642 lines)
- **public/index.html** - HTML structure

### Configuration
- **.env** - API keys, ports
- **package.json** - Dependencies: openai, @anthropic-ai/sdk, express, helmet, joi, cors, uuid
- **jest.config.js** - Test runner

---

## 🔑 How AI Responses Work

### Step 1: Frontend sends request
```javascript
{
  messages: [{role: 'user', content: "Plan trip to Bali"}],
  provider: 'openai',    // or 'anthropic', 'deepseek'
  model: 'gpt-4o',       // or other models
  tripBookSnapshot: {...}
}
```

### Step 2: Server processes
1. Validates input (middleware)
2. Restores TripBook from snapshot
3. Builds system prompt (current time, role, rules, TripBook state)
4. Opens SSE connection (streaming)
5. Calls `streamOpenAI()` with LLM

### Step 3: LLM responds with text + tool calls
- Text streamed chunk-by-chunk via SSE 'token' events
- Tool calls accumulated and parsed

### Step 4: Server executes tools
- For each tool call:
  - Execute (e.g., search_flights)
  - Sync result to TripBook
  - Create tool message
- Send 'tool_result' SSE event

### Step 5: Loop decision
- If no more tools → send final response
- If tools returned → go to Step 3 (next iteration)
- If max iterations → force final response

### Step 6: Frontend receives stream
- Displays tokens as they arrive (typing effect)
- Updates itinerary when TripBook changes
- Saves snapshot on completion

---

## 🚀 Response Workflow Example

**User**: "Plan a Bali trip, 5 days, 2 people, 10k CNY"

**Timeline:**
```
0s   - Frontend sends message + SSE connects
1s   - Server calls LLM
2s   - LLM starts responding: "I'll help plan your Bali trip..."
3-8s - LLM outputs text tokens → frontend shows typing effect
8s   - LLM outputs tool call: update_trip_info (save constraints)
9s   - Server executes tool → updates TripBook → sends SSE event
9s   - Frontend receives tripbook_update → updates itinerary panel
10s  - LLM outputs next text...
12s  - LLM outputs tool call: delegate_to_agents (flight + research)
13s  - Server runs sub-agents in parallel
15s  - Sub-agents complete → merges results
16s  - LLM sees results → generates summary
18s  - LLM outputs final text
20s  - SSE 'done' event → frontend re-enables send button
```

**Total**: ~20 seconds for complex response with agent delegation

---

## 🔍 Key Concepts

### Streaming
- All responses use Server-Sent Events (SSE)
- Text arrives chunk-by-chunk (like ChatGPT)
- Reduces perceived latency
- Frontend updates UI in real-time

### Agent Delegation
- Main Agent can call `delegate_to_agents` tool
- Specifies tasks for Flight or Research agents
- Sub-agents execute in parallel
- Results merged and passed to main LLM next iteration

### TripBook Snapshot
- Client-side persistence mechanism
- No database needed
- Frontend saves to sessionStorage
- Sends with each request for context
- Server uses it to restore state

### Multi-Provider Support
- OpenAI SDK unified client
- Works with OpenAI (GPT-4o), Claude (Anthropic), DeepSeek
- Dynamic baseURL switching
- Special DSML parser for DeepSeek R1

---

## 🔐 Configuration

### Environment Variables
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
PORT=3000
CORS_ORIGINS=http://localhost:3000
SENTRY_DSN=https://...        # Optional error tracking
RATE_LIMIT_BYPASS_KEY=secret  # For testing
```

### Rate Limits
- General: 100 requests/hour
- Chat: 20 requests/hour
- Tools: 50 requests/hour
- Bypass with header: `X-Skip-Rate-Limit: <RATE_LIMIT_BYPASS_KEY>`

### LLM Parameters
- `temperature: 0.7` - Balanced creativity
- `max_tokens: 8192` - Max response length
- `tool_choice: 'auto'` - Let LLM decide
- `stream: true` - Always streaming
- Timeouts: 5min LLM, 30s tools

---

## 📊 Performance Metrics

### Response Times
- Text-only: 3-5s
- With 1-2 tools: 8-15s
- With agent delegation: 20-40s

### Code Size
- Backend: ~4,600 lines
- Frontend: ~1,830 lines
- Total: ~6,400 lines

### LLM Usage
- ~2-4 LLM calls per user interaction
- 0-5 tool executions
- 0-2 delegation batches

---

## 🐛 Known Issues

1. **TripBook Snapshot Bug** - Silent error on restore can cause re-asking
2. **Quick Replies Over-engineered** - 194 lines for what LLM should output
3. **Code Duplication** - Agent loops duplicated 4x (OpenAI/Anthropic × main/sub)
4. **Frontend Complexity** - itinerary.js is 50% over-engineered

---

## 🎓 Learning Resources

For more details, see:
- `PROJECT_EXPLORATION_REPORT.md` - Full technical deep dive (25KB)
- `server.js` - Main chat loop implementation
- `prompts/system-prompt.js` - Dynamic prompt builder
- `models/trip-book.js` - Data model
- `public/js/chat.js` - Frontend SSE receiver

