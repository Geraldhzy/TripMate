# SSE Event Flow Analysis: Thinking Bubble Disappearance Issue

## Issue Summary
When sub-agents are working (via `delegate_to_agents` tool), the main agent's "thinking" bubble becomes empty/disappears on the frontend instead of remaining visible during delegation work.

## 1. SERVER-SIDE SSE EVENTS (server.js)

### Event Sequence for Main Agent Thinking

**Location: `server.js:584-682` (handleChat function)**

```
handleChat() {
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Line 602: START NEW THINKING PHASE
    sendSSE('thinking', {});
    
    // LLM processes and returns tool calls
    const { fullText, toolCalls, rawAssistant } = await streamOpenAI(...);
    
    // Line 611 or 619: END THINKING PHASE (regardless of whether tool calls exist)
    sendSSE('thinking_done', {});
    
    if (toolCalls.length === 0) {
      // Normal text response
      sendSSE('token', { text: safeText });
      return safeText;
    }
    
    // Has tool calls → execute them
    messages.push(rawAssistant);
    
    // Execute each tool (including delegate_to_agents)
    for (const tc of toolCalls) {
      if (tc.name === 'delegate_to_agents') {
        const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);
      }
    }
    
    // Continue loop for next round
  }
}
```

### Event Timeline When delegate_to_agents is Called

**server.js:210-228 (runTool handling for delegate_to_agents)**

```
runTool(funcName='delegate_to_agents', ...) {
  sendSSE('tool_start', { id: toolId, name: 'delegate_to_agents', arguments: funcArgs });
  
  try {
    const resultStr = await executeDelegation(
      funcArgs.tasks, 
      provider, 
      apiKey, 
      model, 
      sendSSE,  // ← PASSED TO DELEGATION
      baseUrl, 
      undefined, 
      reqLog
    );
    
    sendSSE('tool_result', { id: toolId, name: 'delegate_to_agents', resultLabel: '已找到飞行方案' });
    return resultStr;
  }
}
```

### Delegation SSE Events (agents/delegate.js:49-157)

**executeDelegation fires these events:**

1. **Line 71-79**: `agents_batch_start`
   - Count of sub-agents
   - Agent labels/icons
   - Task descriptions (truncated to 200 chars)

2. **For each sub-agent (via runSubAgent)**: `agent_start`
   - Agent type, label, icon
   - Task preview

3. **During sub-agent tool execution**: `agent_tool_done`
   - Tool name
   - Tool label (e.g., "找到 N 个航班")

4. **When sub-agent completes**: `agent_done`
   - Agent type, label
   - Summary

5. **When all sub-agents complete**: `agents_batch_done`
   - Total flights found, success/failure counts

## 2. FRONTEND SSE EVENT HANDLING (public/js/chat.js)

### Chat Flow and Message Structure

**Location: `chat.js:120-238` (streamChat function)**

```javascript
async function streamChat(settings) {
  isStreaming = true;
  
  // Line 125: Create initial assistant message bubble
  const msgCtx = appendAssistantMessage();
  let fullText = '';
  let roundText = '';
  
  // SSE event loop
  while (true) {
    // Parse SSE stream
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ') && eventType) {
        const data = JSON.parse(line.slice(6));
        
        // Line 195-197: Handle round_start
        if (eventType === 'round_start') {
          startNewRound(msgCtx);
          roundText = '';
        } else {
          handleSSEEvent(eventType, data, msgCtx, () => roundText);
        }
        
        // Line 201-204: Accumulate text
        if (eventType === 'token') {
          fullText += data.text;
          roundText += data.text;
        }
      }
    }
  }
}
```

### handleSSEEvent Implementation (chat.js:273-559)

#### 'thinking' Event (Line 277-294)
```javascript
case 'thinking':
  const dots = bubble.querySelector('.typing-dots');
  if (dots) dots.style.display = 'none';  // Hide dots
  
  if (!bubble.querySelector('.thinking-indicator')) {
    const indicator = document.createElement('div');
    indicator.className = 'thinking-indicator';
    indicator.innerHTML = '<div class="spinner"></div><span>正在思考……</span>';
    bubble.appendChild(indicator);  // Add thinking bubble
  } else {
    bubble.querySelector('.thinking-indicator').style.display = '';
  }
  scrollToBottom();
  break;
```

**CRITICAL ISSUE: 'thinking' indicator is NOT reset or preserved during delegation!**

#### 'thinking_done' Event (Line 296-304)
```javascript
case 'thinking_done':
  const indicator = bubble.querySelector('.thinking-indicator');
  if (indicator) indicator.remove();  // ← REMOVES THINKING BUBBLE
  const dots = bubble.querySelector('.typing-dots');
  if (dots) dots.style.display = 'none';
  break;
```

**PROBLEM #1**: The 'thinking_done' event removes the thinking indicator entirely.

#### 'tool_start' Event (Line 311-351)
```javascript
case 'tool_start': {
  hideBubbleTypingDots(bubble);  // Hide typing dots
  
  // delegate_to_agents special handling
  if (data.name === 'delegate_to_agents') {
    toolContainer.dataset['delegate_' + (data.id || '')] = 'delegate';
    break;  // ← EXIT EARLY, DON'T SHOW TOOL STATUS
  }
  
  // ... normal tool rendering
}
```

**KEY INSIGHT**: When delegate_to_agents starts, it:
1. Hides the typing dots
2. Breaks early without rendering anything to the bubble
3. Proceeds to sub-agent events in toolContainer

#### 'agents_batch_start' Event (Line 426-443)
```javascript
case 'agents_batch_start': {
  hideBubbleTypingDots(bubble);  // ← CALLED AGAIN
  
  const panel = document.createElement('div');
  panel.className = 'delegate-panel';
  // ... render delegate-panel to toolContainer
  toolContainer.appendChild(panel);
  break;
}
```

**PROBLEM #2**: The 'agents_batch_start' event calls `hideBubbleTypingDots()` again, but there's NO code to show a thinking indicator!

#### hideBubbleTypingDots Helper (Line 598-603)
```javascript
function hideBubbleTypingDots(bubble) {
  const dots = bubble.querySelector('.typing-dots');
  if (dots) dots.style.display = 'none';
  const thinking = bubble.querySelector('.thinking-indicator');
  if (thinking) thinking.style.display = 'none';  // ← HIDES, NOT REMOVES
}
```

**CRITICAL ISSUE**: This hides (display: none) both dots AND thinking indicator, but doesn't restore them!

#### showBubbleTypingDotsIfAllDone Helper (Line 606-630)
```javascript
function showBubbleTypingDotsIfAllDone(toolContainer, bubble) {
  // Check if any tools running
  if (toolContainer.querySelector('.tool-status.running')) return;
  if (toolContainer.querySelector('.delegate-route.running')) return;
  
  // Restore existing typing dots
  const dots = bubble.querySelector('.typing-dots');
  const thinking = bubble.querySelector('.thinking-indicator');
  if (dots) {
    dots.style.display = '';
    return;
  }
  if (thinking) {
    thinking.style.display = '';
    return;
  }
  
  // If no loading indicator exists, inject typing dots
  const hasVisibleText = bubble.textContent.trim().length > 0;
  if (!hasVisibleText) {
    bubble.innerHTML = TYPING_DOTS_HTML;
  }
}
```

**PROBLEM #3**: This tries to restore typing dots/thinking indicator, but after 'thinking_done' REMOVES the thinking indicator, it can't be restored!

## 3. ROOT CAUSE ANALYSIS

### The Event Sequence That Causes The Issue

1. **Round 1**: Main Agent thinking
   - `thinking` event → Creates thinking-indicator bubble
   - `thinking_done` event → **REMOVES thinking-indicator completely** ✗ BUG

2. **Tool Execution**: delegate_to_agents
   - `tool_start` event → Calls `hideBubbleTypingDots()` (hides dots)
   - `agents_batch_start` event → Creates delegate-panel in toolContainer
   
3. **Expected**: Bubble should show something (thinking or dots) while delegation happens
   - **Actual**: Bubble is EMPTY because:
     - typing dots were never created (hidden before showing)
     - thinking indicator was REMOVED in step 1
     - delegate-panel renders in toolContainer, NOT bubble

4. **After delegation**: 
   - `agents_batch_done` → Calls `showBubbleTypingDotsIfAllDone()`
   - This tries to restore `.thinking-indicator` but **it no longer exists** in DOM
   - Falls back to creating typing dots (only if bubble is empty of text)

### Why Main Agent "Thinking" Disappears

The thinking bubble disappears because:

1. **Initial 'thinking' event** creates `<div class="thinking-indicator">` with spinner
2. **'thinking_done' event** calls `.remove()` on the thinking-indicator
   - ✗ Wrong approach: Should hide it, not remove it
   - ✗ No way to restore it for next phase

3. **When 'agent_start' fires**, there's no thinking indicator to hide/restore
4. **Bubble sits empty** until actual LLM tokens arrive (from the next round's thinking completion)

### The Core Problem Statement

**Location: `chat.js:296-304`**

```javascript
case 'thinking_done':
  const indicator = bubble.querySelector('.thinking-indicator');
  if (indicator) indicator.remove();  // ← LINE 300: DESTROYS THE ELEMENT
  const dots = bubble.querySelector('.typing-dots');
  if (dots) dots.style.display = 'none';
  break;
```

The `.remove()` call permanently removes the thinking indicator from the DOM. Later, when `showBubbleTypingDotsIfAllDone()` is called, it cannot restore an element that has been deleted.

**Compare to 'thinking' event** which uses `style.display`:
```javascript
if (dots) dots.style.display = 'none';
if (!bubble.querySelector('.thinking-indicator')) {
  // Only create if not exists
```

**This is inconsistent!** The 'thinking_done' event REMOVES but the 'thinking' event only HIDES.

## 4. SSE EVENT REFERENCE TABLE

| Event | Source | Purpose | Frontend Impact |
|-------|--------|---------|-----------------|
| `thinking` | server.js:602 | Main agent started thinking | Shows thinking-indicator in bubble |
| `thinking_done` | server.js:611,619,670 | Main agent finished thinking (before/without tool calls) | **REMOVES thinking-indicator** ✗ BUG |
| `token` | server.js:614, OpenAI stream | LLM text token | Renders token to bubble |
| `tool_start` | server.js:204,230 | Tool execution starting | Shows tool status in toolContainer |
| `tool_result` | server.js:206,241,316 | Tool execution completed | Updates tool status to "done" |
| `round_start` | server.js:600 | Starting new LLM round | Creates new bubble + toolContainer |
| `agents_batch_start` | delegate.js:71 | Sub-agent delegation started | Shows delegate-panel in toolContainer |
| `agent_start` | sub-agent-runner.js:305 | Single sub-agent started | Adds route to delegate-panel |
| `agent_tool` | sub-agent-runner.js:249 | Sub-agent tool execution | (Currently unused on frontend) |
| `agent_tool_done` | sub-agent-runner.js:263,272 | Sub-agent tool completed | Updates route with flight count |
| `agent_done` | sub-agent-runner.js:322 | Sub-agent completed | Marks route done in delegate-panel |
| `agent_error` | sub-agent-runner.js:331, delegate.js:90 | Sub-agent error | Shows error in delegate-panel |
| `agents_batch_done` | delegate.js:120 | All sub-agents completed | Collapses delegate-panel, restores typing dots |
| `tripbook_update` | server.js:299 | Trip data updated | Updates itinerary panel |
| `quick_replies` | server.js:149 | Quick reply options | Renders chips in bubble |
| `done` | server.js:152 | Chat stream ended | Cleanup spinners |

## 5. EXACT CODE PATHS AND FILE LOCATIONS

### Problem Code Locations

1. **server.js Line 619** - Sends thinking_done prematurely
   ```
   if (toolCalls.length === 0) {
     sendSSE('thinking_done', {});
   ```

2. **server.js Line 670** - Sends thinking_done at max rounds
   ```
   chatLog.warn('工具调用轮次已达上限...');
   sendSSE('thinking_done', {});
   ```

3. **chat.js Line 300** - DESTROYS thinking indicator instead of hiding
   ```javascript
   case 'thinking_done':
     const indicator = bubble.querySelector('.thinking-indicator');
     if (indicator) indicator.remove();  // ← BUG: Should use display: none
   ```

4. **chat.js Line 313** - Hides bubble content but doesn't show delegation indicator
   ```javascript
   if (data.name === 'delegate_to_agents') {
     toolContainer.dataset['delegate_' + (data.id || '')] = 'delegate';
     break;  // ← No visual feedback in bubble while delegation runs
   ```

5. **chat.js Line 427** - Hides bubble indicators before showing delegate panel
   ```javascript
   case 'agents_batch_start': {
     hideBubbleTypingDots(bubble);  // ← Hides thinking, but nothing to replace it
   ```

6. **chat.js Line 598-603** - hideBubbleTypingDots hides but doesn't restore
   ```javascript
   function hideBubbleTypingDots(bubble) {
     // Hides, doesn't remove (good)
     // But later thinking_done REMOVES (bad)
   ```

## 6. VISUAL TIMELINE

```
Server                          Frontend (Bubble)
────────────────────────────────────────────────────────────────
Think LLM response
  │                             [Bubble: empty]
  ├─ 'thinking' ─────────────→  [Bubble: thinking-indicator ✓]
  │
  ├─ LLM returns tool calls
  │
  ├─ 'thinking_done' ────────→  [Bubble: EMPTY ✗ REMOVED]
  │
  ├─ 'tool_start'
  │  (delegate_to_agents) ────→  [Bubble: still EMPTY]
  │
  ├─ delegate_to_agents
  │
  ├─ 'agents_batch_start' ───→  [Bubble: EMPTY + Panel in toolContainer]
  │
  ├─ 'agent_start' ──────────→  [Panel: agent progress]
  │
  ├─ 'agent_tool_done' ──────→  [Panel: flight count]
  │
  └─ 'agents_batch_done' ────→  [Bubble: restores typing dots IF empty]
                                  [Panel: collapsed]
```

## 7. RECOMMENDATIONS FOR FIX

### Option A: Hide Instead of Remove (Preferred)
- Change `thinking_done` to hide the indicator: `indicator.style.display = 'none'`
- Keep the element in DOM for later restoration
- `showBubbleTypingDotsIfAllDone()` can then restore it with `display: ''`

### Option B: Recreate Indicator
- Track if thinking-indicator ever existed
- Recreate it in `showBubbleTypingDotsIfAllDone()` if needed
- More complex, requires state tracking

### Option C: Show Thinking During Delegation
- When `agents_batch_start` fires, check if bubble is empty
- If empty AND delegation is happening, show a "delegation in progress" indicator
- Prevents empty bubble appearance

### Option D: Don't Remove thinking_done Until Next Round
- Only remove thinking indicator when next `thinking` event arrives
- Prevents DOM thrashing
- Cleaner state transitions

