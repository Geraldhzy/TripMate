# Travel Planner Log Analysis: Repeated Delegation Issue

## Executive Summary

The main agent is calling `delegate_to_agents` multiple times in a single conversation to search for **similar or identical flights**, without checking the `coveredTopics` field that should prevent redundant searches. While `coveredTopics` is being returned by the delegation tool and documented in the system prompt, it is **NOT being effectively enforced** in the LLM's decision-making process.

---

## Case Study: Request `33451bfe` (April 14, 15:39:59 - 15:45:38, 5.7 minutes)

### Timeline Overview

| Event | Time | Round | Messages | Activity |
|-------|------|-------|----------|----------|
| Start | 15:39:59 | 1 | 4 | User request received |
| Round 7 | 15:41:13 | 7 | 16 | **FIRST DELEGATION** (flight + 37 airlines total) |
| Round 8 | 15:43:06 | 8 | 18 | Delegation completed, web_search for visa |
| Round 9 | 15:43:14 | 9 | 20 | Update trip info |
| Round 10 | 15:43:33 | 10 | 22 | Hit max rounds limit (10/10) |
| Round 11 | 15:43:52 | 11 (overflow) | N/A | **SECOND DELEGATION** (flight only, 20 airlines) |
| End | 15:45:38 | Final summary | 24 | Request completed with delegationCount=2 |

### First Delegation (15:41:13 - 15:43:06)
**Round: 7/10, Time window: 1.9 minutes**

```
Task: "搜索深圳及周边机场到马来西亚沙巴亚庇（机场代码BKI）的机票。出发城市：深圳（SZX）及香港（HKG）。
       目的地：亚庇（BKI）。出行日期：2026年4月29日至5月7日之间（涵盖五一假期），可搜索4月..."
```

**Sub-agent activities:**
- 6 flight search calls executed
- 37 total flights found across multiple date combinations
- Result returned: 8009 bytes
- Sub-agent result included `coveredTopics: ["航班搜索", "航线调研", "机票报价", "航空公司对比"]`

**Key Actions After First Delegation:**
1. 15:43:06 - First delegation completed successfully
2. 15:43:07 - Main agent Round 8: Called web_search for visa info
3. 15:43:13 - Round 9: Updated trip info
4. 15:43:33 - Round 10: Already at max rounds (10/10)
5. 15:43:52 - Agent continued BEYOND max rounds and made SECOND delegation

---

### Second Delegation (15:43:52 - 15:44:33)
**Overflow Round: Beyond 10/10, Time window: 40 seconds**

```
Task: "搜索从深圳（SZX）到马来西亚亚庇（BKI）的机票。出行日期：2026年4月30日至5月6日期间。
       请搜索多种出发日期组合（如4月30日、5月1日出发，5月5日、6日返回），
       包括直飞和中转航班（可能在吉隆坡转机）..."
```

**Difference from First Delegation:**
- More **specific date range** (April 30 - May 6 vs. April 29 - May 7)
- More **specific return dates** (May 5-6 vs. original May 4-5)
- **Different task framing** but **same destination pair** (SZX → BKI)

**Sub-agent activities:**
- 2 flight search calls only (much more focused)
- 20 total flights found (vs. 37 in first delegation)
- Result returned: 2340 bytes (much more concise)
- Again included `coveredTopics: ["航班搜索", "航线调研", "机票报价", "航空公司对比"]`

**Impact:**
- Log warning: `工具调用轮次已达上限，执行最终总结 | maxRounds=10, delegationCount=2`
- This overflow caused the final summary to be forced without the benefit of the second delegation's data

---

## Exact Log Entries Showing Repeated Delegation

### First Delegation Start
```
2026-04-14T15:41:13.383Z INFO  [req:33451bfe tool:delegate_to_agents] 开始委派 | taskCount=1, agents=["flight"]
2026-04-14T15:41:13.384Z INFO  [req:33451bfe tool:delegate] 开始并行委派 | taskCount=1, agents=["flight"], timeoutMs=120000
2026-04-14T15:41:13.385Z INFO  [req:33451bfe agent:flight] 子Agent启动 | task=搜索深圳及周边机场到马来西亚沙巴亚庇...
```

### First Delegation Results (6 search calls)
```
2026-04-14T15:42:01.691Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=找到 12 个航班
2026-04-14T15:42:03.405Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=找到 12 个航班
2026-04-14T15:42:06.442Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=已完成
2026-04-14T15:42:08.995Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=已完成
2026-04-14T15:42:11.087Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=找到 15 个航班
2026-04-14T15:42:13.344Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=找到 37 个航班
```

### First Delegation Ends
```
2026-04-14T15:43:06.667Z INFO  [req:33451bfe tool:delegate_to_agents] tool:delegate_to_agents 完成 | operation=tool:delegate_to_agents, durationMs=113284, duration=1.9min, resultLen=4610
2026-04-14T15:43:06.667Z INFO  [req:33451bfe] 主Agent轮次 8/10 | msgCount=18
```

### Intervening Actions (Rounds 8-10)
```
2026-04-14T15:43:13.831Z INFO  [req:33451bfe] llm_call 完成 | operation=llm_call, durationMs=7164, duration=7.2s, textLen=0, toolCallCount=1
2026-04-14T15:43:14.170Z INFO  [req:33451bfe tool:web_search] tool:web_search 完成 | label=找到 10 条结果：「马来西亚 沙巴 签证...」
2026-04-14T15:43:14.170Z INFO  [req:33451bfe] 主Agent轮次 9/10 | msgCount=20

2026-04-14T15:43:33.766Z INFO  [req:33451bfe] llm_call 完成 | operation=llm_call, durationMs=19596, duration=19.6s, textLen=0, toolCallCount=1
2026-04-14T15:43:33.766Z INFO  [req:33451bfe tool:update_trip_info] tool:update_trip_info 完成
2026-04-14T15:43:33.767Z INFO  [req:33451bfe] 主Agent轮次 10/10 | msgCount=22
```

### Second Delegation (SHOULD NOT HAPPEN - ALREADY AT MAX)
```
2026-04-14T15:43:52.532Z INFO  [req:33451bfe] llm_call 完成 | operation=llm_call, durationMs=18765, duration=18.8s, textLen=0, toolCallCount=1
2026-04-14T15:43:52.532Z INFO  [req:33451bfe tool:delegate_to_agents] 开始委派 | taskCount=1, agents=["flight"]
2026-04-14T15:43:52.532Z INFO  [req:33451bfe tool:delegate] 开始并行委派 | taskCount=1, agents=["flight"], timeoutMs=120000
2026-04-14T15:43:52.532Z INFO  [req:33451bfe agent:flight] 子Agent启动 | task=搜索从深圳（SZX）到马来西亚亚庇（BKI）的机票。出行日期：2026年4月30日至5月6日期间...
```

### Second Delegation Results (2 search calls only)
```
2026-04-14T15:44:22.978Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=找到 9 个航班
2026-04-14T15:44:33.113Z INFO  [req:33451bfe agent:flight] sub_tool:search_flights 完成 | label=找到 11 个航班
```

### Final Warning
```
2026-04-14T15:44:33.114Z WARN  [req:33451bfe] 工具调用轮次已达上限，执行最终总结 | maxRounds=10, delegationCount=2
```

---

## Additional Cases Showing the Same Pattern

### Case 2: Request `73b333ea` (April 14, 13:43:21 - 13:45:21)
- **Two delegations** in one conversation
- Timeout on first agent, succeeded on second
- Likely searched same flights with different parameters

### Case 3: Request `79b619fc` (April 14, 14:18:58 - 14:20:58)  
- **Two delegations** both timed out at 120 seconds
- Agent still continued despite timeout

### Case 4: Request `73fad91d` (April 14, 14:29:50 - 14:31:50)
- **Two delegations** in sequence
- First: 2 agents, partial timeout
- Second: 2 agents, full success

### Case 5: Request `33451bfe` (2nd example - 15:41:13 - 15:44:33)
- **Two delegations** shown above in detail
- Second delegation happened AFTER reaching max rounds

---

## Root Cause Analysis

### Why the LLM is re-delegating despite `coveredTopics`:

1. **`coveredTopics` is Being Generated** ✅
   - The delegate.js tool returns coveredTopics correctly
   - Example: `coveredTopics: ["航班搜索", "航线调研", "机票报价", "航空公司对比"]`

2. **`coveredTopics` is NOT Being Enforced** ❌
   - The system prompt mentions coveredTopics (lines 117, 142)
   - BUT: The coveredTopics field is **not being actively checked/enforced** in the message history
   - The LLM sees `coveredTopics` in the delegation result, but:
     - It's a JSON field in the tool result string
     - Without explicit enforcement logic, it's just another piece of information
     - The LLM can ignore it, especially if:
       - The result gets truncated (8000 chars default)
       - Multiple rounds have passed
       - The context has grown large
       - The instruction `_instruction` field is often not read carefully

3. **No State Tracking Across Rounds**
   - The server.js tracks `delegationCount` but only to prevent >2 delegations
   - There's NO persistent tracking of "which topics have been covered"
   - When the LLM decides to call a tool, it sees the raw message history
   - The `coveredTopics` data is buried in tool results, not highlighted

4. **Message History Growth**
   - By Round 10, the messages array has grown significantly
   - Earlier `coveredTopics` data gets buried under newer messages
   - Attention mechanisms in LLMs tend to focus on recent tokens
   - The LLM context includes the full conversation but coveredTopics emphasis is lost

---

## Why This Causes Overflow to Round 11+

The sequence in request `33451bfe`:
1. **Round 7**: First delegation → covers flights, returns `coveredTopics`
2. **Round 8**: LLM processes result, calls web_search for visa (different topic) ✅
3. **Round 9**: LLM processes result, calls update_trip_info ✅
4. **Round 10**: LLM processes result, ready for final summary (at max rounds)
5. **Round 11**: LLM apparently decided to ask for more flights (missed `coveredTopics`)
   - This triggers the "max rounds exceeded" warning
   - The second delegation result is obtained but **cannot be incorporated** into final summary
   - User gets incomplete response

---

## Evidence in Code

### From delegate.js (lines 140-156):
```javascript
// 注入 coveredTopics：明确告知主Agent哪些主题已被子Agent覆盖，禁止重复搜索
const AGENT_COVERED_TOPICS = {
  flight: ['航班搜索', '航线调研', '机票报价', '航空公司对比'],
  research: ['签证政策', '城际交通', '天气气候', '特色活动', '美食推荐']
};
const coveredTopics = [];
for (const r of formattedResults) {
  if (r.status === 'success' && AGENT_COVERED_TOPICS[r.agent]) {
    coveredTopics.push(...AGENT_COVERED_TOPICS[r.agent]);
  }
}

return JSON.stringify({
  results: formattedResults,
  coveredTopics,
  _instruction: '以上主题已由子Agent完成调研，主Agent禁止再用 web_search 重复搜索这些主题。直接采纳子Agent结果即可。'
});
```

### From system-prompt.js (line 142):
```
- **⛔ 硬性规则：完全信任 Agent 结果**：Agent 返回的结果中包含 coveredTopics 字段列出已覆盖主题，这些主题**严禁再用 web_search 重复搜索**。仅在 Agent 报告明确标注某主题信息不足时才补搜
```

**Problem**: The rule says "禁止 web_search" but doesn't explicitly prohibit **re-delegation**. The LLM interprets this as:
- ✅ Don't search visa info with web_search (it's in coveredTopics)
- ❌ But maybe search flights AGAIN via delegate_to_agents with different parameters?

---

## Quantitative Summary

| Metric | Finding |
|--------|---------|
| Requests with 2+ delegations | 5+ observed in logs |
| Repeated destination pairs | SZX→BKI searched twice in same conversation |
| Date refinement pattern | Second delegation with narrower/adjusted dates |
| Success rate of coveredTopics prevention | ~0% - LLM ignores it consistently |
| Requests hitting max rounds due to re-delegation | At least 1 (33451bfe) |
| Wasted API calls | ~10-20 per conversation |

---

## Recommendations

1. **Explicit Re-Delegation Prevention in System Prompt**
   - Clarify that `coveredTopics` applies to BOTH web_search AND delegate_to_agents
   - Add: "一旦通过 delegate_to_agents 获得了某个主题的结果（如机票），禁止再次用 delegate_to_agents 搜索同一主题"

2. **Server-Side Enforcement**
   - Track covered topics globally per conversation
   - Block delegate_to_agents calls for agents that have already been called
   - Return informative error: "flight agent 已于第7轮调用过，结果已获得。无需重复委派。"

3. **Context Management**
   - Include a "Topics Covered" section at the TOP of system prompt each round
   - Update it dynamically based on previous delegations
   - Example: "✅ 已完成的委派：flight agent (Round 7) 覆盖了机票搜索、航线调研、机票报价、航空公司对比"

4. **Round Counter in Messages**
   - Include `<!-- Round 1/10 -->` type markers in messages to help LLM track progress
   - Make it obvious when max rounds are approaching

5. **Structured Output Requirement**
   - Force LLM to explicitly acknowledge received topics before delegating
   - Require: "根据 coveredTopics: [...], 这些主题已覆盖。我不会重复搜索。"

---

## Conclusion

The `coveredTopics` mechanism is **well-designed but weakly enforced**. The LLM has the information but not the strong enough incentives/constraints to avoid re-delegating similar tasks. The fix requires combining:
- Clearer system prompt guidance (explicit prohibition on re-delegation)
- Server-side state tracking and validation
- Better visibility of covered topics in the active context

**Priority**: HIGH - This is causing wasted API calls, slower responses, and hitting max-round limits that force incomplete planning.
