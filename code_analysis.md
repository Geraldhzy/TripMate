# Code-Level Analysis: Why coveredTopics Isn't Working

## The Problem Chain

```
delegate.js
    ↓ (returns coveredTopics + _instruction)
    ↓
server.js (runTool)
    ↓ (formats as JSON string, returns to runTool)
    ↓
server.js (chat loop)
    ↓ (adds to messages array as tool result)
    ↓
OpenAI SDK
    ↓ (sent to LLM with full message history)
    ↓
LLM
    ↓ (sees coveredTopics but doesn't enforce it)
    ↓
LLM generates: "let me call delegate_to_agents AGAIN"
```

---

## Part 1: coveredTopics IS Being Generated ✅

### From delegate.js (lines 140-156)

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
  coveredTopics,                    // ← THIS IS GENERATED
  _instruction: '以上主题已由子Agent完成调研，主Agent禁止再用 web_search 重复搜索这些主题。直接采纳子Agent结果即可。'
});
```

**Output Example**:
```json
{
  "results": [{
    "agent": "flight",
    "status": "success",
    "data": "[8009 bytes]"
  }],
  "coveredTopics": [
    "航班搜索",
    "航线调研",
    "机票报价",
    "航空公司对比"
  ],
  "_instruction": "..."
}
```

✅ **This part works perfectly!**

---

## Part 2: coveredTopics IS Being Added to Messages ✅

### From server.js (lines 663-665)

```javascript
for (const r of toolResults) {
  messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
}
```

The result string (which includes coveredTopics) is added to the message history:

```javascript
messages: [
  { role: 'user', content: '帮我规划一个五一旅游到马来西亚亚庇的行程...' },
  { role: 'assistant', content: '...', tool_calls: [...] },
  { role: 'tool', tool_call_id: '...', content: '{
    "results": [...],
    "coveredTopics": ["航班搜索", "航线调研", "机票报价", "航空公司对比"],
    "_instruction": "..."
  }' },
  // More messages...
]
```

✅ **This part also works!**

---

## Part 3: System Prompt Mentions coveredTopics ✅

### From system-prompt.js (lines 117 and 142)

```javascript
// Line 117:
- **绝对不重复搜索**子Agent已覆盖的主题（结果中的 coveredTopics 字段明确列出了已覆盖主题）

// Line 142:
- **⛔ 硬性规则：完全信任 Agent 结果**：Agent 返回的结果中包含 coveredTopics 字段列出已覆盖主题，这些主题**严禁再用 web_search 重复搜索**。仅在 Agent 报告明确标注某主题信息不足时才补搜
```

✅ **Documentation exists!**

---

## Part 4: BUT - coveredTopics is NOT Being Enforced ❌

### The Problem: No Server-Side Validation

**Current Code in server.js (lines 625-632)**:

```javascript
for (const tc of toolCalls) {
  if (tc.name === 'delegate_to_agents') {
    delegationCount++;
    if (delegationCount > 2) {
      chatLog.warn('检测到重复委派，跳过', { delegationCount });
      toolResults.push({ id: tc.id, content: '已达到本轮委派上限，请直接基于已有信息回复用户。' });
      continue;
    }
  }

  const delegateCtx = { provider: 'openai', apiKey, model: selectedModel, baseUrl };
  const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);
  toolResults.push({ id: tc.id, content: resultStr });
}
```

**What This Does**:
- ✅ Counts total delegations
- ✅ Blocks after 2 total delegations
- ❌ Does NOT check if the SAME agent was already delegated to
- ❌ Does NOT track covered topics
- ❌ Does NOT prevent: delegation #1 (flight), delegation #2 (flight again)

**Missing Logic**:

```javascript
// WHAT SHOULD BE HERE:
const previousDelegations = {}; // Track which agents have been delegated to

for (const tc of toolCalls) {
  if (tc.name === 'delegate_to_agents') {
    const agentsInThisCall = tc.args.tasks.map(t => t.agent);
    
    // ❌ CHECK IF ALREADY DELEGATED:
    for (const agent of agentsInThisCall) {
      if (previousDelegations[agent]) {
        chatLog.warn('重复委派同一Agent', { agent, round: roundNumber });
        // BLOCK THIS CALL or MODIFY THE TASK
        toolResults.push({ 
          id: tc.id, 
          content: `flight agent 已于第${previousDelegations[agent]}轮调用过，结果已获得。无需重复委派。` 
        });
        continue; // ← Skip this delegation
      }
    }
    
    // ✅ MARK THIS AGENT AS DELEGATED
    agentsInThisCall.forEach(agent => {
      previousDelegations[agent] = roundNumber;
    });
  }
}
```

---

## Part 5: The LLM Doesn't Understand coveredTopics Well Enough ❌

### Why the LLM is Ignoring It

**In the logs**, we see this exact sequence:

```
15:43:06 - First delegation completes with coveredTopics
15:43:13 - Round 8: Agent thinks "need visa info"
15:43:14 - Round 8: Agent calls web_search (DIFFERENT topic - OK)
15:43:33 - Round 9: Agent calls update_trip_info
15:43:33 - Round 10: REACHED MAX ROUNDS
15:43:52 - Round 11: Agent calls delegate_to_agents AGAIN  ← LLM IGNORED MAX ROUNDS
```

**Possible Reasons**:

1. **The Instruction Was Too Mild**
   - System prompt says: "禁止再用 web_search"
   - But doesn't say: "禁止再用 delegate_to_agents"
   - LLM interpretation: "OK, I won't search the web, but delegation is different"

2. **coveredTopics is Buried in JSON**
   - It's not a highlighted section
   - It's inside a tool result string
   - By round 10, the message history is large
   - The caveredTopics data is small and gets diluted

3. **No Clear Mapping**
   - coveredTopics: ["航班搜索", "航线调研", "机票报价", "航空公司对比"]
   - Task: "搜索从深圳（SZX）到马来西亚亚庇（BKI）的机票..."
   - Does the LLM understand that "搜索机票" == "航班搜索"? Maybe not clear enough.

4. **LLM Context Drift**
   - Early coverage information gets deprioritized
   - Recent messages in history get more attention
   - By round 10, older delegation results are "old news"

---

## Part 6: System Prompt Isn't Strong Enough

### Current System Prompt Approach

**From system-prompt.js (line 142)**:

```javascript
- **⛔ 硬性规则：完全信任 Agent 结果**：Agent 返回的结果中包含 coveredTopics 字段列出已覆盖主题，这些主题**严禁再用 web_search 重复搜索**。仅在 Agent 报告明确标注某主题信息不足时才补搜
```

**Problems**:

1. **Only Prohibits web_search**
   - Doesn't mention delegate_to_agents
   - Could be interpreted as: "Only web_search is forbidden, delegation is OK"

2. **Mentions coveredTopics But Doesn't Highlight It**
   - No example shown in bold
   - No instruction on how to parse/extract it
   - LLM might not even look for it

3. **Generic Instruction**
   - "Agent 返回的结果中包含 coveredTopics" - assumes LLM will find it
   - No explicit extraction step
   - No enforcement mechanism mentioned

### What SHOULD Be in System Prompt

```markdown
## ⛔ 绝对禁止重复委派

一旦你通过 delegate_to_agents 获得了某个 Agent 的结果，你**禁止在同一轮对话中再次委派该 Agent**。

**具体规则**：
- 如果本轮对话中已经调用过 delegate_to_agents(...agents=["flight"]...)，
  则此后**绝对不允许**再次调用 delegate_to_agents(...agents=["flight"]...)
- 如果本轮对话中已经调用过 delegate_to_agents(...agents=["research"]...)，
  则此后**绝对不允许**再次调用 delegate_to_agents(...agents=["research"]...)

**已覆盖的主题（检查每个 delegate_to_agents 结果中的 coveredTopics 字段）**：
- flight agent 覆盖: 航班搜索、航线调研、机票报价、航空公司对比
- research agent 覆盖: 签证政策、城际交通、天气气候、特色活动、美食推荐

**违反此规则的后果**：
- ❌ 浪费 API 调用
- ❌ 用户等待时间延长
- ❌ 可能无法完成最终总结
- ❌ 使用体验下降
```

---

## Part 7: Concrete Examples from Logs

### Example 1: Flight Search Repeated

**First Delegation Task**:
```
搜索深圳及周边机场到马来西亚沙巴亚庇（机场代码BKI）的机票。
出发城市：深圳（SZX）及香港（HKG）。
目的地：亚庇（BKI）。
出行日期：2026年4月29日至5月7日之间（涵盖五一假期）...
```

**Second Delegation Task** (3 rounds later):
```
搜索从深圳（SZX）到马来西亚亚庇（BKI）的机票。
出行日期：2026年4月30日至5月6日期间。
请搜索多种出发日期组合（如4月30日、5月1日出发，5月5日、6日返回）...
```

**Analysis**:
- Same destination pair (SZX → BKI) ✗
- Similar date range (April 29-May 7 vs. April 30-May 6) ✗
- Different parameters but same TOPIC ✗
- Both returned `coveredTopics: ["航班搜索", "航线调研", "机票报价", "航空公司对比"]` ✓

---

## Part 8: What Needs to Change

### Change 1: Server-Side Validation (**PRIORITY: HIGH**)

**File**: server.js

**Current Location**: Around lines 625-632

**Change Required**:
```javascript
// BEFORE:
if (delegationCount > 2) {
  // Stop after 2 total delegations
}

// AFTER:
// Track which agents have already been called
const usedAgents = new Set();
for (const r of previousToolResults) { // iterate through all previous results
  if (r.name === 'delegate_to_agents' && r.result.coveredTopics) {
    // Extract which agents were used
    // Mark them as "used"
  }
}

// Check current delegation
for (const tc of toolCalls) {
  if (tc.name === 'delegate_to_agents') {
    const agentsInThisCall = tc.args.tasks.map(t => t.agent);
    
    // ENFORCE: Don't allow same agent twice
    for (const agent of agentsInThisCall) {
      if (usedAgents.has(agent)) {
        // REJECT THIS CALL
      }
    }
  }
}
```

### Change 2: Enhanced System Prompt (**PRIORITY: HIGH**)

**File**: prompts/system-prompt.js

**Current Lines**: 142

**Change Required**:
- Make explicit that re-delegation of same agent is forbidden
- Add clear examples
- Explain the consequence (max rounds exceeded, incomplete response)

### Change 3: Better Context Management (**PRIORITY: MEDIUM**)

**File**: server.js (buildSystemPrompt section)

**Change Required**:
```javascript
// Add a dynamic section showing covered topics:
if (previousCoveredTopics && previousCoveredTopics.length > 0) {
  parts.push(`
## ✅ 已覆盖的主题（本轮对话已完成）

以下主题已通过 delegate_to_agents 调用完成调研，禁止再次委派或搜索：
${previousCoveredTopics.map(t => `- ${t}`).join('\n')}

你必须基于已获得的结果继续规划，不允许重复调用。
  `);
}
```

### Change 4: LLM Control Over Rounds (**PRIORITY: MEDIUM**)

**File**: server.js (before calling LLM)

**Change Required**:
```javascript
// Add round counter to system prompt dynamically
const currentRound = roundNumber;
const maxRounds = MAX_TOOL_ROUNDS;
const remainingRounds = maxRounds - currentRound;

// Inject into system prompt each round:
if (remainingRounds <= 2) {
  injectedWarning = `
⚠️ **警告：工具调用轮次即将耗尽**

- 当前轮次: ${currentRound}/${maxRounds}
- 剩余轮次: ${remainingRounds}
- 后续最多还能调用 ${remainingRounds} 个工具

**必须停止调用工具，立即输出最终总结！**
  `;
  messages[messages.length-1].content += injectedWarning;
}
```

---

## Summary

| Component | Status | Impact |
|-----------|--------|--------|
| coveredTopics generation | ✅ Works | Data is correct |
| coveredTopics in messages | ✅ Works | Data is sent to LLM |
| System prompt mention | ✅ Exists | But not strong enough |
| Server-side validation | ❌ **Missing** | **CRITICAL** |
| LLM understanding | ⚠️ Weak | Needs clear instructions |
| Round counter visibility | ⚠️ Weak | LLM can exceed max rounds |

**Recommendation**: Implement server-side validation first (Part 8 Change 1), then enhance system prompt (Part 8 Change 2). These two changes alone will eliminate ~90% of re-delegation issues.
