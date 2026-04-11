# SSE Streaming Event Handling Analysis - AI Travel Planner Chat Frontend

## Overview
This document traces how the frontend (`public/js/chat.js`) handles Server-Sent Events (SSE) during AI responses, including message bubble creation, tool call rendering, and visual feedback.

---

## 1. SSE Event Handling Architecture

### Entry Point: `streamChat()` Function (Lines 120-219)

The main SSE streaming function that:
1. Creates the assistant message bubble
2. Opens an EventSource-like connection using `fetch` with `getReader()`
3. Processes SSE events in real-time
4. Updates the UI based on event types

```javascript
// Lines 120-219: Core streaming function
async function streamChat(settings) {
  isStreaming = true;
  document.getElementById('send-btn').disabled = true;

  // 1. CREATE ASSISTANT BUBBLE (Line 125)
  const { bubble, toolContainer } = appendAssistantMessage();
  let fullText = '';

  try {
    // ... headers setup ...

    // 2. FETCH WITH STREAMING (Lines 152-156)
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload)
    });

    // 3. PROCESS STREAMING RESPONSE (Lines 163-190)
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      // Parse SSE format: "event: TYPE\ndata: JSON\n"
      let eventType = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            // 4. HANDLE EACH EVENT TYPE (Line 182)
            handleSSEEvent(eventType, data, bubble, toolContainer, () => fullText);
            if (eventType === 'token') {
              fullText += data.text;
            }
          } catch {}
          eventType = null;
        }
      }
    }

    // 5. SAVE MESSAGE TO HISTORY (Lines 193-195)
    if (fullText) {
      chatHistory.push({ role: 'assistant', content: fullText });
    }

  } catch (err) {
    bubble.innerHTML = `<span style="color:red">❌ ${escapeHtml(err.message)}</span>`;
  } finally {
    // 6. CLEANUP & FINALIZE (Lines 199-218)
    isStreaming = false;
    userScrolledUp = false;
    hideScrollHint();
    document.getElementById('send-btn').disabled = false;
    // Force-complete any remaining running spinners
    toolContainer.querySelectorAll('.tool-status.running').forEach(el => {
      el.className = 'tool-status done';
      if (el.dataset.group) {
        const total = parseInt(el.dataset.total);
        el.innerHTML = `<span>${groupLabel(el.dataset.group, total, total)}</span>`;
      } else {
        const originalLabel = el.dataset.label || el.querySelector('span')?.textContent || '工具';
        el.innerHTML = `<span>✅ ${originalLabel}</span>`;
      }
    });
    scrollToBottom();
    saveTripSnapshot();
  }
}
```

---

## 2. Message Bubble Creation & Initial Typing Indicator

### Function: `appendAssistantMessage()` (Lines 794-827)

Creates the DOM structure for an AI response message:

```javascript
function appendAssistantMessage() {
  const chatArea = document.getElementById('chat-area');

  // Message container
  const div = document.createElement('div');
  div.className = 'message assistant';

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'avatar ai-avatar';
  avatar.textContent = '🌍';
  div.appendChild(avatar);

  // Message body: tool container + text bubble
  const body = document.createElement('div');
  body.className = 'message-body';

  // Tool status container (above bubble)
  const toolContainer = document.createElement('div');
  toolContainer.className = 'tool-container';
  body.appendChild(toolContainer);

  // Text bubble with TYPING INDICATOR
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  // ← TYPING DOTS SHOWN INITIALLY
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  body.appendChild(bubble);

  div.appendChild(body);
  chatArea.appendChild(div);
  scrollToBottom();

  return { bubble, toolContainer };
}
```

**Initial State Visual:**
- Message bubble contains **3 animated dots** (typing indicator)
- Location: `CSS` lines 754-764
- Animation: `typingBounce` keyframe (952-955)

```css
/* Lines 754-764: Typing dots styling */
.typing-dots { 
  display: flex; 
  align-items: center; 
  gap: 4px; 
  padding: 2px 2px; 
  height: 22px; 
}
.typing-dots span {
  width: 7px; 
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
  display: inline-block;
  animation: typingBounce 1.2s ease-in-out infinite;
}
.typing-dots span:nth-child(1) { animation-delay: 0s; }
.typing-dots span:nth-child(2) { animation-delay: .2s; }
.typing-dots span:nth-child(3) { animation-delay: .4s; }

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: .4; }
  30% { transform: translateY(-6px); opacity: 1; }
}
```

---

## 3. SSE Event Types & Handling

### Event Handler Function: `handleSSEEvent()` (Lines 224-344)

Central dispatcher that routes all SSE events:

```javascript
function handleSSEEvent(type, data, bubble, toolContainer, getFullText) {
  switch (type) {
    case 'token':      // ... (covered in section 4)
    case 'tool_start': // ... (covered in section 5)
    case 'tool_result': // ... (covered in section 5)
    case 'rate_cached': // ... (cached exchange rate)
    case 'weather_cached': // ... (cached weather)
    case 'itinerary_update': // ... (trip panel update)
    case 'tripbook_update': // ... (structured trip data)
    case 'quick_replies': // ... (interactive chips)
    case 'error': // ... (error message)
    case 'done': // ... (streaming complete)
  }
}
```

---

## 4. Token Streaming: Text Rendering During Streaming

### Event: `token` (Lines 226-230)

Each token (text chunk) from the AI is rendered in real-time:

```javascript
case 'token':
  // Build full text so far
  const currentText = getFullText() + data.text;
  
  // RENDER MARKDOWN IN REAL-TIME (replaces typing dots)
  bubble.innerHTML = renderMarkdown(currentText);
  
  // AUTO-SCROLL (unless user scrolled up)
  scrollToBottom();
  break;
```

**What happens:**
1. **First token** arrives → triggers `renderMarkdown()` → **removes typing dots**, shows actual text
2. **Each subsequent token** → appends to `fullText`, re-renders markdown
3. **Markdown rendering** happens on every token (lines 892-964)

#### Markdown Renderer: `renderMarkdown()` (Lines 892-964)

Converts markdown text to HTML with support for:
- `<think>` blocks (collapsible reasoning)
- Code blocks (`` ``` ``)
- Headers (`# ## ###`)
- Bold/italic (`**bold**`, `*italic*`)
- Links (`[text](url)`)
- Tables, lists, blockquotes, etc.

Key feature: **Re-runs on every token arrival**, so streaming text is progressively formatted.

**Token Event Data:**
```javascript
{
  "text": "string chunk (might be partial word, space, etc.)"
}
```

---

## 5. Tool Calls: Interleaving with Text

### Event: `tool_start` (Lines 232-263)

When a tool call begins, a status element is added **above** the text bubble.

```javascript
case 'tool_start': {
  // GROUPED TOOLS: search_flights, search_hotels
  if (GROUPED_TOOLS.includes(data.name)) {
    const groupKey = `group_${data.name}`;
    let groupEl = toolContainer.querySelector(`[data-group="${data.name}"]`);
    
    if (!groupEl) {
      // CREATE NEW GROUP ELEMENT
      groupEl = document.createElement('div');
      groupEl.className = 'tool-status running';
      groupEl.dataset.group = data.name;
      groupEl.dataset.total = '0';
      groupEl.dataset.done = '0';
      toolContainer.appendChild(groupEl);
    }
    
    // TRACK PROGRESS
    const total = parseInt(groupEl.dataset.total) + 1;
    groupEl.dataset.total = total;
    toolContainer.dataset[data.id || data.name] = data.name;
    
    // RENDER WITH SPINNER
    groupEl.innerHTML = `<div class="spinner"></div><span>${groupLabel(data.name, total, 0)}</span>`;
    scrollToBottom();
    break;
  }
  
  // OTHER TOOLS: single display
  const toolEl = document.createElement('div');
  toolEl.className = 'tool-status running';
  toolEl.dataset.toolId = data.id || data.name;
  const label = toolLabel(data.name, data.arguments);
  toolEl.dataset.label = label;
  toolEl.innerHTML = `<div class="spinner"></div><span>${label}</span>`;
  toolContainer.appendChild(toolEl);
  scrollToBottom();
  break;
}
```

**Grouped Tools:** `GROUPED_TOOLS = ['search_flights', 'search_hotels']` (Line 347)

When multiple flight/hotel searches happen:
- Multiple `tool_start` for same tool → **one group element** with progress counter
- Shows: "✈️ 正在查询机票… (2/5)" → "✈️ 正在查询机票… (5/5)" → "✅ ✈️ 已查询 5 条航线"

#### Grouped Tool Label Rendering: `groupLabel()` (Lines 520-532)

```javascript
function groupLabel(name, total, done) {
  const icons = { search_flights: '✈️', search_hotels: '🏨' };
  const nouns = { search_flights: '条航线', search_hotels: '家酒店' };
  const icon = icons[name] || '🔍';
  const noun = nouns[name] || '条结果';
  
  if (done >= total) {
    return `✅ ${icon} 已查询 ${total} ${noun}`;
  }
  if (done === 0) {
    return `${icon} 正在查询机票…`;
  }
  return `${icon} 正在查询机票… (${done}/${total})`;
}
```

#### Non-Grouped Tool Label: `toolLabel()` (Lines 534-570)

```javascript
function toolLabel(name, args) {
  if (!args) {
    const nameMap = {
      web_search: '🔍 网页搜索',
      get_weather: '🌤️ 天气查询',
      get_exchange_rate: '💱 汇率查询',
      search_poi: '📍 地点搜索',
      search_flights: '✈️ 机票搜索',
      search_hotels: '🏨 酒店搜索',
      cache_destination_knowledge: '📚 缓存目的地知识',
      update_trip_info: '📋 更新行程参考书'
    };
    return nameMap[name] || name;
  }
  
  // With args: show specific search details
  switch (name) {
    case 'web_search':
      return `🔍 搜索「${args.query || ''}」`;
    case 'get_weather':
      return `🌤️ 查询 ${args.city || ''} 天气`;
    case 'get_exchange_rate':
      return `💱 查询 ${args.from || ''}→${args.to || 'CNY'} 汇率`;
    case 'search_poi':
      return `📍 搜索地点「${args.keyword || args.query || ''}」${args.city ? ' · ' + args.city : ''}`;
    case 'search_flights':
      return `✈️ 查询 ${args.origin || ''}→${args.destination || ''} ${args.date || ''} 机票`;
    case 'search_hotels':
      return `🏨 搜索 ${args.city || ''} ${args.check_in || ''} 酒店`;
    // ...
  }
}
```

**Tool Status Styling** (CSS Lines 720-751):

```css
/* Tool Container */
.tool-container { 
  display: flex; 
  flex-direction: column; 
  gap: 4px; 
}

/* Running state */
.tool-status.running {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #2563eb;
}

/* Done state */
.tool-status.done {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: var(--success); /* #16a34a */
}

/* Spinner animation */
.tool-status .spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin .8s linear infinite;
  flex-shrink: 0;
}

@keyframes spin { 
  to { transform: rotate(360deg); } 
}
```

### Event: `tool_result` (Lines 265-293)

Tool execution completes, transitions from "running" to "done":

```javascript
case 'tool_result': {
  const key = data.id || data.name;
  
  // Check if part of grouped tools
  const groupName = toolContainer.dataset[key];
  if (groupName) {
    const groupEl = toolContainer.querySelector(`[data-group="${groupName}"]`);
    if (groupEl) {
      const total = parseInt(groupEl.dataset.total);
      const done = parseInt(groupEl.dataset.done) + 1;
      groupEl.dataset.done = done;
      
      if (done >= total) {
        // ALL TOOLS IN GROUP DONE
        groupEl.className = 'tool-status done';
        groupEl.innerHTML = `<span>${groupLabel(groupName, total, total)}</span>`;
      } else {
        // PARTIAL: still waiting for more
        groupEl.innerHTML = `<div class="spinner"></div><span>${groupLabel(groupName, total, done)}</span>`;
      }
    }
    break;
  }
  
  // Non-grouped tool: single transition
  const runningEl = toolContainer.querySelector(`[data-tool-id="${key}"]`);
  if (runningEl) {
    runningEl.className = 'tool-status done';
    const fallbackLabel = runningEl.dataset.label || toolLabel(data.name, null);
    // Include server-provided result summary
    const displayLabel = data.resultLabel 
      ? `${fallbackLabel} — ${data.resultLabel}` 
      : fallbackLabel;
    runningEl.innerHTML = `<span>✅ ${displayLabel}</span>`;
  }
  break;
}
```

**Tool Result Data:**
```javascript
{
  "id": "tool_call_12345",
  "name": "search_flights",
  "resultLabel": "找到5条航线"  // optional summary
}
```

---

## 6. UI Interleaving: Tool Calls + Text Content

### DOM Structure During Streaming

```
<div class="message assistant">
  <div class="avatar ai-avatar">🌍</div>
  
  <div class="message-body">
    <!-- TOOL CALLS APPEAR HERE (above bubble) -->
    <div class="tool-container">
      <div class="tool-status running">
        <div class="spinner"></div>
        <span>✈️ 正在查询机票…</span>
      </div>
      <div class="tool-status done">
        <span>✅ ✈️ 已查询 3 条航线</span>
      </div>
    </div>
    
    <!-- TEXT CONTENT BELOW -->
    <div class="bubble">
      <p>我为你找到了...</p>
      <p>这些航线的特点是:</p>
      <!-- more markdown content -->
    </div>
  </div>
</div>
```

**CSS Layout** (Line 667):
```css
.message-body { 
  display: flex; 
  flex-direction: column;  /* Tools ABOVE bubble */
  gap: 6px; 
  min-width: 0; 
}
```

---

## 7. Other SSE Events

### `rate_cached` (Lines 295-298)
Caches exchange rate data for reuse:
```javascript
case 'rate_cached':
  if (data.rate && !data.error) saveRateToCache(data);
  break;
```

### `weather_cached` (Lines 300-307)
Caches weather data and syncs trip panel:
```javascript
case 'weather_cached':
  if (!data.error) saveWeatherToCache(data);
  if (typeof updateItinerary === 'function' && data.current) {
    updateItinerary({ weather: { city: data.city, temp_c: data.current.temp_c, description: data.current.description } });
  }
  break;
```

### `itinerary_update` (Lines 309-311)
Updates the trip panel on the right:
```javascript
case 'itinerary_update':
  if (typeof updateItinerary === 'function') updateItinerary(data);
  break;
```

### `tripbook_update` (Lines 313-318)
Stores structured trip data:
```javascript
case 'tripbook_update':
  if (typeof updateFromTripBook === 'function') updateFromTripBook(data);
  try { 
    sessionStorage.setItem('tp_tripbook', JSON.stringify(data)); 
  } catch {}
  break;
```

### `quick_replies` (Lines 320-322)
Renders interactive suggestion chips:
```javascript
case 'quick_replies':
  renderQuickReplies(data, bubble);
  break;
```

### `error` (Lines 326-328)
Appends error message to bubble:
```javascript
case 'error':
  bubble.innerHTML += `<br><span style="color:red">❌ ${escapeHtml(data.message)}</span>`;
  break;
```

### `done` (Lines 330-342)
**Final event**: Marks all running tools as complete:
```javascript
case 'done':
  // Mark all running spinners as done (safety cleanup)
  toolContainer.querySelectorAll('.tool-status.running').forEach(el => {
    el.className = 'tool-status done';
    if (el.dataset.group) {
      const total = parseInt(el.dataset.total);
      el.innerHTML = `<span>${groupLabel(el.dataset.group, total, total)}</span>`;
    } else {
      const originalLabel = el.dataset.label || el.querySelector('span')?.textContent || '工具';
      el.innerHTML = `<span>✅ ${originalLabel}</span>`;
    }
  });
  break;
```

---

## 8. Visual State Transitions

### During Streaming

```
INITIAL STATE
├─ Bubble contains: [typing dots animation]
│
└─ Tool Container: empty

FIRST TOOL STARTS (tool_start)
├─ Bubble: [typing dots animation]
└─ Tool Container:
   └─ [✈️ 正在查询机票…] (spinner rotating)

TEXT ARRIVES (token events)
├─ Bubble: [first words of response]
└─ Tool Container:
   └─ [✈️ 正在查询机票…] (spinner still rotating)

FIRST TOOL COMPLETES (tool_result)
├─ Bubble: [more text arriving]
└─ Tool Container:
   └─ [✅ ✈️ 已查询 3 条航线] (no spinner)

MORE TOOLS START (tool_start)
├─ Bubble: [continuing text]
└─ Tool Container:
   ├─ [✅ ✈️ 已查询 3 条航线]
   └─ [🏨 正在查询酒店…] (new spinner)

STREAMING COMPLETE (done event)
├─ Bubble: [complete response with markdown]
└─ Tool Container:
   ├─ [✅ ✈️ 已查询 3 条航线]
   └─ [✅ 🏨 已查询 5 家酒店]
```

### CSS Animations During States

**Running spinner:**
```css
.tool-status.running .spinner {
  animation: spin .8s linear infinite; /* continuous rotation */
}
```

**Typing dots (before first token):**
```css
.typing-dots span {
  animation: typingBounce 1.2s ease-in-out infinite;
  /* bounces vertically */
}
```

**Fade-in animation for new elements:**
```css
.tool-status {
  animation: fadeIn .25s;
}

@keyframes fadeIn { 
  from { opacity: 0; transform: translateY(3px); } 
  to { opacity: 1; transform: translateY(0); } 
}
```

---

## 9. Cleanup & Finalization

### In `finally` block (Lines 199-218)

After streaming completes (whether success or error):

```javascript
finally {
  isStreaming = false;
  userScrolledUp = false;
  hideScrollHint();
  document.getElementById('send-btn').disabled = false;
  
  // SAFETY: Force-complete any lingering spinners
  toolContainer.querySelectorAll('.tool-status.running').forEach(el => {
    el.className = 'tool-status done';
    if (el.dataset.group) {
      const total = parseInt(el.dataset.total);
      el.innerHTML = `<span>${groupLabel(el.dataset.group, total, total)}</span>`;
    } else {
      const originalLabel = el.dataset.label || el.querySelector('span')?.textContent || '工具';
      el.innerHTML = `<span>✅ ${originalLabel}</span>`;
    }
  });
  
  scrollToBottom();
  saveTripSnapshot(); // Auto-save to localStorage
}
```

This ensures:
- All spinners are stopped (prevents visual glitches if `done` event is missed)
- UI is re-enabled for next message
- Auto-save to trip history

---

## 10. Scroll Management During Streaming

### Auto-Scroll: `scrollToBottom()` (Lines 883-887)

```javascript
function scrollToBottom() {
  if (userScrolledUp) return; // Don't force-scroll if user scrolled up
  const chatArea = document.getElementById('chat-area');
  chatArea.scrollTop = chatArea.scrollHeight;
}
```

### User Scroll Detection (Lines 873-881)

```javascript
(function initScrollWatcher() {
  const chatArea = document.getElementById('chat-area');
  chatArea.addEventListener('scroll', () => {
    if (!isStreaming) { 
      userScrolledUp = false; 
      hideScrollHint(); 
      return; 
    }
    
    const distFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
    userScrolledUp = distFromBottom > 20;
    if (userScrolledUp) showScrollHint(); else hideScrollHint();
  });
})();
```

When user scrolls up during streaming:
- "↓ 跳到最新" button appears (Lines 851-866)
- Clicking it re-enables auto-scroll
- Button disappears after stream ends

---

## 11. Event Data Structures (Server → Client)

### SSE Format
```
event: token
data: {"text":"Hello"}

event: tool_start
data: {"id":"call_123","name":"search_flights","arguments":{"origin":"NYC"}}

event: tool_result
data: {"id":"call_123","name":"search_flights","resultLabel":"Found 5 flights"}

event: done
data: {}
```

### Complete Example Flow

```
1. User: "Find flights to Paris"
   → sendMessage() → streamChat()

2. Server response stream:
   
   event: tool_start
   data: {"id":"call_1","name":"search_flights","arguments":{"origin":"NYC","destination":"Paris"}}
   
   event: token
   data: {"text":"I'll help"}
   
   event: token
   data: {"text":" you find"}
   
   event: tool_result
   data: {"id":"call_1","name":"search_flights","resultLabel":"Found 5 flights"}
   
   event: token
   data: {"text":" flights"}
   
   event: done
   data: {}

3. Final UI State:
   - Tool: ✅ ✈️ 已查询 5 条航线
   - Bubble: "I'll help you find flights..."
```

---

## Summary Table

| Event Type | Handler Lines | Visual Effect | When Fired |
|---|---|---|---|
| `token` | 226-230 | Replaces typing dots with text, re-renders markdown | Each text chunk arrives |
| `tool_start` | 232-263 | Adds running spinner above bubble | Tool execution begins |
| `tool_result` | 265-293 | Transitions spinner to checkmark + summary | Tool execution completes |
| `rate_cached` | 295-298 | Caches exchange rate (no visible change) | Exchange rate fetched |
| `weather_cached` | 300-307 | Updates trip panel weather display | Weather data fetched |
| `itinerary_update` | 309-311 | Updates right panel trip info | Trip info changes |
| `tripbook_update` | 313-318 | Syncs structured trip data | Trip structure changes |
| `quick_replies` | 320-322 | Renders interactive suggestion chips below bubble | AI suggests follow-ups |
| `error` | 326-328 | Appends red error message to bubble | Backend error occurs |
| `done` | 330-342 | Force-completes all running spinners | Stream ends |

---

## Key Implementation Details

### 1. **Real-time Markdown Rendering**
   - `renderMarkdown()` (892-964) is called on EVERY token
   - Supports `<think>` blocks, code, tables, lists, etc.
   - Handles Unicode escaping and link generation

### 2. **Grouped vs. Individual Tools**
   - Grouped: `search_flights`, `search_hotels` → single progress counter
   - Individual: other tools → separate status badges
   - Mapping via `toolContainer.dataset[toolId] = groupName`

### 3. **Message Bubble DOM**
   - Starts empty with typing dots
   - First `token` event replaces entire `bubble.innerHTML`
   - Subsequent tokens update only the `bubble` (not tool container)
   - Structure: `<message> → <message-body> → <tool-container> + <bubble>`

### 4. **Stream Interruption Safety**
   - `finally` block clears all running spinners
   - Handles cases where `done` event is missed
   - Manually transitions `.running` → `.done` with checkmarks

### 5. **Auto-Scroll During Streaming**
   - Tracks user scroll position
   - Shows "jump to latest" button if user scrolls up
   - Resumes auto-scroll when user scrolls back down

