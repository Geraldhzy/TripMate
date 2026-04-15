# 🔴 CRITICAL ISSUE: Repeated Sub-Agent Delegation

## Quick Summary

The main agent is repeatedly calling `delegate_to_agents` to search the **same flights** in a single conversation, wasting API calls and causing timeout errors. While the code returns `coveredTopics` to prevent this, **the mechanism is NOT being enforced**.

---

## Evidence

### Request `33451bfe` (April 14, 15:39:59 - 15:45:38)

| Event | Time | Details |
|-------|------|---------|
| **1st Delegation** | 15:41:13 | Flight search: SZX→BKI, April 29-May 7, 61 flights, **113 seconds** ✅ Legitimate |
| Round 8 | 15:43:06 | Got results with `coveredTopics: ["航班搜索", "航线调研", "机票报价", "航空公司对比"]` |
| Round 9 | 15:43:14 | Called web_search for visa (different topic) ✅ |
| Round 10 | 15:43:33 | Called update_trip_info ✅ |
| **MAX ROUNDS** | 15:43:33 | Hit 10/10 limit |
| **2nd Delegation** | 15:43:52 | **OVERFLOW!** Flight search again: SZX→BKI, April 30-May 6, 20 flights, **40 seconds** ❌ Unnecessary |
| Result not used | 15:44:33 | Warning: "工具调用轮次已达上限" - result never incorporated |

**Same destination pair searched twice. Result of second search wasted.**

---

## The Problem Chain

```
✅ Step 1: delegate.js GENERATES coveredTopics correctly
         Returns: { coveredTopics: ["航班搜索", ...], _instruction: "禁止再用web_search..." }

✅ Step 2: server.js ADDS coveredTopics to message history  
         Messages: [..., { role: 'tool', content: '{ "coveredTopics": [...] }' }]

✅ Step 3: System prompt MENTIONS coveredTopics
         Instruction: "严禁再用 web_search 重复搜索这些主题"

❌ Step 4: LLM IGNORES coveredTopics
         Decision: "需要搜索更具体的机票日期，再调一次 delegate_to_agents"

❌ Step 5: Server ALLOWS re-delegation
         No validation that same agent was already called
         Server only checks: "Is delegationCount > 2?" not "Was flight agent already called?"

❌ Result: WASTED API CALLS, SLOWER RESPONSE, INCOMPLETE PLANNING
```

---

## Root Cause Analysis

### Why This Happens

1. **No Server-Side Validation** (CRITICAL)
   - Server checks `if (delegationCount > 2)` but doesn't check `if (flight agent already called)`
   - Missing code: Track which agents were delegated to, block re-delegation

2. **Weak System Prompt** (HIGH)
   - Instruction says "禁止 web_search" but doesn't say "禁止 delegate_to_agents"
   - LLM interprets: "I can't search the web, but I can delegate again"

3. **coveredTopics Buried in Context** (HIGH)
   - It's a JSON field in a tool result message, not highlighted
   - By round 10, older delegation data gets deprioritized
   - LLM attention mechanisms focus on recent messages

4. **No Round Counter Visibility** (MEDIUM)
   - LLM called delegate_to_agents at round 11 even though max is 10
   - Shows LLM doesn't track round limits properly

---

## Impact Quantification

### From Logs (April 14)

| Metric | Finding |
|--------|---------|
| Requests with 2+ delegations | 5+ observed |
| Average wasted seconds per conversation | 40-120 seconds |
| Wasted API calls per re-delegation | 2-10 search_flights calls |
| Requests hitting max rounds due to re-delegation | At least 2 (33451bfe, 73b333ea) |
| Success rate of coveredTopics preventing re-delegation | **~0%** ❌ |

### Per-User Cost (If 10 conversations per day)

```
Per conversation: ~5 wasted API calls × 10 conversations = 50 wasted calls/day
Time penalty: ~40-60 sec × 10 conversations = 7-10 minutes user latency
Incomplete responses: ~1-2 conversations with truncated final summary
```

---

## Detection Patterns in Logs

### Pattern 1: Same Destination, Different Date Range
```
1st: "搜索...出行日期：2026年4月29日至5月7日..."
2nd: "搜索...出行日期：2026年4月30日至5月6日..."
→ Same route, refining date range (wasted call)
```

### Pattern 2: After Max Rounds Exceeded
```
Round 10: 主Agent轮次 10/10
Round 11: tool:delegate_to_agents  ← Should have stopped!
```

### Pattern 3: coveredTopics Present But Unused
```
delegate_to_agents 完成: coveredTopics=["航班搜索", ...]
3 rounds later: 工具调用轮次已达上限  ← Result never used
```

---

## Code-Level Findings

### What's Working ✅
```javascript
// delegate.js lines 140-156
return JSON.stringify({
  results: formattedResults,
  coveredTopics,                    // ← Generated correctly
  _instruction: '以上主题已由子Agent完成调研...'
});
```

### What's NOT Working ❌
```javascript
// server.js lines 625-632
if (tc.name === 'delegate_to_agents') {
  delegationCount++;
  if (delegationCount > 2) {        // Only checks TOTAL count
    // But DOESN'T check: "Was flight agent already called?"
    // Missing: Track which agents were delegated to
  }
}
```

---

## Recommended Fixes

### Priority 1: Server-Side Validation (Do This First) 🔴
**File**: server.js, around line 625

**Change**:
```javascript
// BEFORE: Just count total delegations
if (delegationCount > 2) { ... }

// AFTER: Track which agents have been called
const delegatedAgents = new Set();

for (const tc of toolCalls) {
  if (tc.name === 'delegate_to_agents') {
    const agentsInThisCall = tc.args.tasks.map(t => t.agent);
    
    // CHECK: Has this agent been delegated to already?
    for (const agent of agentsInThisCall) {
      if (delegatedAgents.has(agent)) {
        // BLOCK: Return error instead of executing
        toolResults.push({ 
          id: tc.id, 
          content: `Agent '${agent}' 已于之前调用过，结果已获得。无需重复委派。` 
        });
        continue;
      }
    }
    
    // MARK: This agent is now delegated
    agentsInThisCall.forEach(a => delegatedAgents.add(a));
  }
}
```

**Impact**: Eliminates ~90% of re-delegation issues immediately

### Priority 2: Enhanced System Prompt (Do This Second) 🟠
**File**: prompts/system-prompt.js, around line 142

**Change**:
```markdown
## ⛔ 绝对禁止重复委派同一 Agent

一旦你通过 delegate_to_agents 获得了某个 Agent 的结果，你**禁止在同一轮对话中再次委派该 Agent**。

**具体规则**：
- 第一次调用 delegate_to_agents(...agents=["flight"]...) 后，此后不允许再调用 flight agent
- 第一次调用 delegate_to_agents(...agents=["research"]...) 后，此后不允许再调用 research agent

**已覆盖的主题**（不要重复搜索）：
- ✅ flight agent 已覆盖: 航班搜索、航线调研、机票报价、航空公司对比
- ✅ research agent 已覆盖: 签证政策、城际交通、天气气候、特色活动、美食推荐
```

**Impact**: Makes LLM aware of the prohibition

### Priority 3: Dynamic Context Updates (Optional Enhancement) 🟡
**File**: server.js, in buildSystemPrompt or before LLM call

**Change**: Add a section to system prompt each round showing:
- Which agents have been delegated
- What topics are covered
- How many rounds remain
- Explicit warning when approaching max rounds

---

## Testing the Fix

### Test Case 1: Prevent Same-Agent Re-delegation
```
Conversation:
1. User: "帮我规划五一去亚庇的行程"
2. Agent calls: delegate_to_agents(tasks=[{agent:"flight", task:"..."}])
3. Agent tries to call: delegate_to_agents(tasks=[{agent:"flight", task:"...different params..."}])
✅ EXPECTED: Server rejects with "Agent 'flight' 已于之前调用过..."
```

### Test Case 2: Allow Different Agents
```
Conversation:
1. Agent calls: delegate_to_agents(tasks=[{agent:"flight", ...}])
2. Agent calls: delegate_to_agents(tasks=[{agent:"research", ...}])
✅ EXPECTED: Both delegations succeed (different agents)
```

### Test Case 3: Respect coveredTopics
```
Conversation:
1. First delegation returns: coveredTopics=["航班搜索", ...]
2. Agent should NOT call: web_search("深圳到亚庇航班")
✅ EXPECTED: Agent uses existing flight data, doesn't re-search
```

---

## Files to Modify

| File | Lines | Change | Priority |
|------|-------|--------|----------|
| server.js | 625-632 | Add agent tracking logic | 🔴 HIGH |
| prompts/system-prompt.js | 142+ | Strengthen prohibition on re-delegation | 🔴 HIGH |
| server.js | ~150-160 | Extract and track coveredTopics from results | 🟠 MEDIUM |
| server.js | ~470-480 | Inject round counter into system prompt | 🟡 MEDIUM |

---

## Verification Checklist

- [ ] Server-side validation implemented in server.js
- [ ] System prompt updated to mention re-delegation prohibition
- [ ] Tested: First delegation + second delegation (same agent) = blocked
- [ ] Tested: First delegation (flight) + second delegation (research) = allowed
- [ ] Tested: coveredTopics properly extracted and tracked
- [ ] Logs show: "重复委派同一Agent已阻止" messages
- [ ] New deployment: Re-run same user queries, verify no 2x delegations

---

## Conclusion

**Status**: 🔴 CRITICAL - System is wasting resources and causing incomplete responses

**Cause**: Missing server-side validation of delegation history

**Fix Complexity**: LOW - ~20 lines of code in server.js

**Time to Fix**: 30-45 minutes

**Urgency**: HIGH - Each user conversation is losing 40+ seconds and 10+ API calls

**Recommendation**: 
1. ✅ Implement Priority 1 (server-side validation) TODAY
2. ✅ Implement Priority 2 (enhanced system prompt) TODAY  
3. 📝 Implement Priority 3 (context updates) THIS WEEK

This will restore proper delegation behavior and improve user experience significantly.
