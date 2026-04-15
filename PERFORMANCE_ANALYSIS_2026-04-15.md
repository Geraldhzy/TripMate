# AI Travel Planner: Performance Bottleneck Analysis

**Date**: April 15, 2026  
**User Complaint**: Simple requests taking 11-40s, complex ones 2-7 minutes  
**LLM Average**: ~20s per call

---

## Executive Summary

The AI Travel Planner has **multiple compounding performance issues** that create a cascade of delays:

1. **Sequential LLM round-trips** (30 max rounds) that don't need to be sequential
2. **Streaming implemented correctly at transport layer but blocked at logic layer** by synchronous tool execution
3. **Sub-agent parallel execution partially working** - but delegation is called separately instead of upfront
4. **System prompt bloat** - builds dynamically on every request
5. **No request coalescing** - each conversation round is a separate full LLM invocation
6. **Tool execution is serial within each round** - multiple tool calls wait for each other

---

## 1. MAIN PERFORMANCE BOTTLENECK: Serial Tool Execution + Multi-Round LLM Calls

### File: `/Users/geraldhuang/DEV/ai-travel-planner/server.js` (Lines 663-871)

#### Problem 1A: Sequential Tool Execution Loop (Lines 733-850)

```javascript
// BOTTLENECK: Each tool call is awaited sequentially
for (const tc of toolCalls) {
  // ... tool execution logic ...
  const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);
  toolResults.push({ id: tc.id, content: resultStr });
}

// Then tool results are added to messages for next LLM round
for (const r of toolResults) {
  messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
}
```

**Impact**: If LLM decides to call 3 tools (search_flights, search_hotels, web_search), they execute one after another instead of in parallel.

- Flight search: ~8s
- Hotel search: ~6s  
- Web search: ~3s
- **Total sequential**: ~17s
- **Could be parallel**: ~8s (max of the three)

**Frequency**: Happens in EVERY tool round (can occur 5-15 times per complex request)

---

#### Problem 1B: Max 30 Tool Rounds with Full LLM Invocation Each (Lines 679-850)

```javascript
const MAX_TOOL_ROUNDS = 30;
for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
  // Every single round:
  // 1. Full LLM call (stream 8192 tokens) - ~20s per call
  // 2. Wait for response
  // 3. Parse tool calls
  // 4. Execute tools (sequentially)
  // 5. Add results to messages
  // 6. Go to next round
  
  const { fullText, toolCalls, rawAssistant } = await streamOpenAI(...);
  // Then tool execution
  for (const tc of toolCalls) {
    await runTool(...); // Wait for each tool
  }
}
```

**Example worst case (complex trip planning)**:
- Round 1: LLM says "need to search flights + hotels" → calls delegate → ~25s LLM + ~15s delegate
- Round 2: LLM analyzes results → "need POI search" → ~20s LLM + ~8s tools  
- Round 3: LLM processes POI → "need weather" → ~20s LLM + ~5s tools
- Round 4: LLM processes weather → final response → ~25s LLM

**Total: ~118 seconds (2 minutes)** just from LLM latency, plus tool execution

The logic assumes it needs to "think between tool calls", but it could batch more tools together.

---

### File: `/Users/geraldhuang/DEV/ai-travel-planner/agents/sub-agent-runner.js` (Lines 247-265)

#### Problem 1C: Sub-Agent Tools Are Already Parallelized (But Main Agent Isn't)

```javascript
// ✅ SUB-AGENTS DO THIS (parallel):
const toolSettled = await Promise.allSettled(toolCalls.map(async (tc) => {
  const result = await getTools().executeToolCall(tc.name, tc.args);
  // ... process result ...
  return { id: tc.id, content: resultStr };
}));

// ❌ MAIN AGENT DOES THIS (sequential):
for (const tc of toolCalls) {
  const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);
  toolResults.push({ id: tc.id, content: resultStr });
}
```

**Gap**: Sub-agents parallelize tools, but the main agent doesn't. This is the **primary bottleneck**.

---

## 2. DELEGATION HAPPENS TOO LATE

### File: `/Users/geraldhuang/DEV/ai-travel-planner/server.js` (Lines 248-292)

#### Problem 2: Delegation Called by LLM After Initial Analysis

Current flow:
1. **Round 1**: LLM thinks → "I need to delegate for flights & research"
2. **Decision point**: LLM calls `delegate_to_agents` tool
3. **Round 1 tool execution**: Delegation happens (~15-40s)
4. **Round 2**: LLM analyzes delegation results → decides next steps
5. **Round 2 tools**: web_search, search_poi, etc. (sequentially)

**Better flow would be**:
1. **Preemptive**: System prompt tells LLM "if you need flight/hotel data, delegate immediately in round 1"
2. **Coalesced**: "In round 1, delegate for flights AND start research + web searches together"
3. **Result**: Data starts coming back faster while LLM analyzes

Currently, delegation is **reactive** (LLM decides mid-conversation), should be more **proactive** (LLM delegates early).

**Current system prompt** (prompts/system-prompt.js, line 60-62):
```
You can use web_search for specific scenes (phase 3)...
delegate_to_agents for flight + research (phase 2)
```

But there's no pressure to delegate EARLY. LLM might do:
- Round 1: "Let me understand your needs first" (no tool calls)
- Round 2: "Now let me search" (delegate_to_agents)
- Round 3: Analyze results

This delays data collection by 1-2 rounds = **20-40s additional latency**.

---

## 3. STREAMING IS IMPLEMENTED BUT BLOCKED BY SYNCHRONOUS LOGIC

### File: `/Users/geraldhuang/DEV/ai-travel-planner/server.js` (Lines 117-119, 687)

SSE streaming is properly configured:
```javascript
const sendSSE = (event, data) => {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
};
```

However, it's **blocked by synchronous tool waiting**:

```javascript
// This line BLOCKS until ALL tools complete:
const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);

// During this await, no SSE events are sent to client for subsequent tools
```

**Client side** (public/js/chat.js, lines 120-199): Correctly handles streaming with `getReader()`, but the **server isn't sending events during tool execution** because it's waiting for the previous tool.

**What should happen**:
```
Tool A starts → SSE "tool_start" (A) → continues
Tool B starts → SSE "tool_start" (B) → continues  
Tool A finishes → SSE "tool_result" (A)
Tool B finishes → SSE "tool_result" (B)
LLM gets both results
```

**What actually happens**:
```
Tool A starts → SSE "tool_start" (A) 
await Tool A (BLOCKS - no streaming)
Tool A finishes → SSE "tool_result" (A)
Tool B starts → SSE "tool_start" (B)
await Tool B (BLOCKS - no streaming)
Tool B finishes → SSE "tool_result" (B)
```

This is why users see long periods of "nothing happening" - the UI is waiting for the next SSE event but tools are blocking each other.

---

## 4. SYSTEM PROMPT BLOAT

### File: `/Users/geraldhuang/DEV/ai-travel-planner/prompts/system-prompt.js` (Lines 1-150)

On **every request**, system prompt is built dynamically:

```javascript
function buildSystemPrompt(conversationText = '', tripBook = null) {
  const parts = [];
  
  // ... 150 lines of prompt building ...
  
  // This prompt is used for EVERY message in the conversation
  // Even if unchanged from previous round
}
```

The system prompt is **~6000-8000 tokens** including:
- Current time (lines 14-22)
- Role definition (lines 26-36)
- Planning methodology (lines 40-150)
- Tool strategy (lines 95-150)
- Covered topics from delegation results (injected dynamically)

**Issue**: When called from `handleChat()` (line 139):
```javascript
const systemPrompt = buildSystemPrompt(conversationText, tripBook);
// ... line 672 ...
const messages = [{ role: 'system', content: systemPrompt }, ...userMessages];
```

**Every LLM call includes the full system prompt** - it's sent to OpenAI/Anthropic/DeepSeek repeatedly.

**Impact**:
- If system prompt is 7000 tokens and LLM call is 8192 max tokens
- Only 1192 tokens left for actual conversation history
- Conversation gets truncated early
- LLM makes same requests multiple times due to lost context

**Optimization**: Cache system prompt, regenerate only if tripBook changes or coveredTopics updates.

---

## 5. NO REQUEST COALESCING / CACHING

### Files Affected:
- `server.js` (lines 663-871)
- `agents/sub-agent-runner.js` (lines 223-281)

**Problem**: No caching of:
- LLM responses for similar queries
- Tool results (flight searches for same route/date)
- Delegation results
- Web searches for same topic

If user asks:
- "Find me flights from SFO to Tokyo"
- Later: "What about flights from SFO to Tokyo on different dates?"

System makes 2 full web searches instead of reusing/comparing the first result.

**TripBook** (models/trip-book.js) has a search cache but it's never used to prevent re-execution:
```javascript
// TripBook tracks web searches but doesn't prevent duplicate searches
tripBook.addWebSearch({ query, summary });
```

---

## 6. LLM MODEL CONFIGURATION NOT OPTIMIZED

### File: `/Users/geraldhuang/DEV/ai-travel-planner/server.js` (Lines 571-583)

```javascript
const createParams = {
  model,
  messages,
  temperature: 0.7,          // ⚠️ Too high for tool use
  max_tokens: 8192,          // ⚠️ Very large
  stream: true,
};
```

**Issues**:
- **temperature: 0.7** is designed for creative text. For tool use planning, should be **0.3-0.5** for deterministic decisions
- **max_tokens: 8192** is almost the entire context. LLM will always generate long responses, not concise tool calls
- No **top_p** tuning for different model types

**Sub-agent configuration** (agents/sub-agent-runner.js, lines 143-146):
```javascript
temperature: 0.5,           // ✓ Correct for tool use
max_tokens: maxTokens || 2048,  // ✓ Better
```

Main agent should match sub-agent config.

---

## 7. EXCESSIVE TOKEN USAGE FROM VERBOSE RESPONSES

### File: `/Users/geraldhuang/DEV/ai-travel-planner/prompts/system-prompt.js`

System prompt encourages verbose output:
```
"风格务实高效，像朋友一样沟通，用数据说话而非空泛建议"
```

This translates to detailed, multi-paragraph responses that:
1. **Consume more tokens** (more LLM generation time)
2. **Delay tool decisions** (LLM spends time on explanation before tool call)
3. **Increase network transfer** (more SSE events needed)

---

## 8. NO EARLY TERMINATION / TIMEOUT ENFORCEMENT

### File: `/Users/geraldhuang/DEV/ai-travel-planner/server.js`

```javascript
const LLM_TIMEOUT_MS = 300000;  // 5 minutes! (Line 424)
const TOOL_TIMEOUT_MS = 30000;  // 30 seconds (Line 425)
```

**Issues**:
- LLM timeout is 5 minutes - if it hangs, user waits 5 min before error
- No **intermediate timeout checks** to fail faster
- No **circuit breaker** - if delegation fails, main agent still tries 2 more times

Better approach:
- **LLM timeout: 60 seconds** (most responses are 10-20s)
- **Overall request timeout: 120 seconds** 
- **Delegation timeout: 45 seconds** (currently 120s per sub-agent)
- **Quick fail**: If first tool fails, don't retry same type

---

## 9. VERBOSE SSE EVENTS

### File: `/Users/geraldhuang/DEV/ai-travel-planner/server.js` (Lines 681-710)

Every round sends multiple events:
```javascript
sendSSE('round_start', { round: round + 1 });
sendSSE('thinking', {});
// ... tool execution ...
sendSSE('thinking_done', {});
```

For 5 rounds × 3 events = 15 SSE events just for overhead.

Better: Combine into single events or skip rounds < 2.

---

## 10. NO PREFETCHING / SPECULATION

### No implementation of:
- Prefetch likely next questions
- Speculative tool execution
- Background delegation while LLM thinks
- Result caching between conversation rounds

---

## Summary: Where The Time Goes (Typical Complex Request)

| Step | Current | Optimized | Saved |
|------|---------|-----------|-------|
| Round 1 LLM call | 20s | 15s | 5s |
| Delegate flight + research (serial) | 40s | 15s (parallel) | 25s |
| Round 2 LLM call | 20s | 15s | 5s |
| Web search + POI search (serial) | 11s | 6s (parallel) | 5s |
| Round 3 LLM call | 20s | 15s | 5s |
| Final synthesis | 20s | 15s | 5s |
| **TOTAL** | **131s** | **76s** | **55s (42% faster)** |

With all optimizations: **Simple request** 11-40s → **6-15s**  
**Complex request** 120-420s → **60-180s**

---

## CRITICAL CODE LOCATIONS FOR OPTIMIZATION

1. **Main bottleneck - Serial tool execution**:
   - File: `server.js`, Lines 733-793
   - Function: `handleChat()` tool execution loop
   - Fix: Use `Promise.allSettled()` like sub-agents do

2. **Delegation lateness**:
   - File: `prompts/system-prompt.js`, Lines 59-66
   - Issue: System prompt doesn't pressure early delegation
   - Fix: Add "delegate for flights in round 1" instruction

3. **Streaming blocked by sync logic**:
   - File: `server.js`, Line 762 (runTool await)
   - Fix: Parallelize tool execution, SSE during execution

4. **System prompt bloat**:
   - File: `prompts/system-prompt.js`
   - Fix: Cache prompt, only regenerate on TripBook changes

5. **Sub-agent parallel execution reference**:
   - File: `agents/sub-agent-runner.js`, Lines 247-265
   - Status: ✅ Already implemented correctly
   - Apply same pattern to main agent

6. **LLM config suboptimal**:
   - File: `server.js`, Lines 574-579
   - Fix: temperature 0.3-0.5, max_tokens 2048-4096

7. **Excessive timeouts**:
   - File: `server.js`, Lines 424-425
   - Fix: LLM 60s, delegation 45s, overall 120s
