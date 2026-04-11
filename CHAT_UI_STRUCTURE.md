# AI Travel Planner — Chat UI Structure Investigation

**Date**: 2026-04-10  
**Project**: /Users/geraldhuang/DEV/ai-travel-planner  
**Focus**: Understanding chat message bubble structure, SSE event handling, and preparation for clickable option chips

---

## 1. HTML Chat Container Structure

**File**: `public/index.html`

### Main Chat Area
```html
<!-- Line 88: Chat container -->
<main id="chat-area" class="chat-area">
  <div class="welcome-msg">
    <!-- Welcome card shown initially -->
  </div>
</main>
```

**Key attributes**:
- **ID**: `chat-area` — primary container for all messages
- **Class**: `chat-area` — flex column, overflow-y auto, smooth scrolling
- Container is flex-based, messages append dynamically

### Input Section
```html
<!-- Line 111-118: Input footer -->
<footer class="input-area">
  <div class="input-wrapper">
    <textarea id="msg-input" placeholder="描述你的旅行需求..." rows="1" onkeydown="handleKeyDown(event)"></textarea>
    <button id="send-btn" onclick="sendMessage()" class="send-btn" title="发送">
      <svg>...</svg>
    </button>
  </div>
</footer>
```

---

## 2. Message DOM Structure

### Generated in JS (appendUserMessage, appendAssistantMessage)

#### User Message (Lines 607-617 in chat.js)
```javascript
function appendUserMessage(text) {
  const chatArea = document.getElementById('chat-area');
  const div = document.createElement('div');
  div.className = 'message user';
  div.innerHTML = `
    <div class="avatar user-avatar">✈</div>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  chatArea.appendChild(div);
  scrollToBottom();
}
```

**Resulting HTML**:
```
<div class="message user">
  <div class="avatar user-avatar">✈</div>
  <div class="bubble">User text here</div>
</div>
```

#### Assistant Message (Lines 619-652 in chat.js)
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
  
  // Message body (tools + bubble in column)
  const body = document.createElement('div');
  body.className = 'message-body';
  
  // Tool status container (above bubble, same message)
  const toolContainer = document.createElement('div');
  toolContainer.className = 'tool-container';
  body.appendChild(toolContainer);
  
  // Text bubble
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  body.appendChild(bubble);
  
  div.appendChild(body);
  chatArea.appendChild(div);
  scrollToBottom();
  
  return { bubble, toolContainer };
}
```

**Resulting HTML**:
```
<div class="message assistant">
  <div class="avatar ai-avatar">🌍</div>
  <div class="message-body">
    <div class="tool-container">
      <!-- Tool status updates appear here -->
    </div>
    <div class="bubble">
      <!-- Rendered content appears here -->
    </div>
  </div>
</div>
```

---

## 3. CSS Styling for Chat Bubbles

**File**: `public/css/style.css`

### Message Layout (Lines 463-499)
```css
.message {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  max-width: 82%;
  animation: msgIn .3s cubic-bezier(.16,1,.3,1);
}
.message.user {
  margin-left: auto;
  flex-direction: row-reverse;  /* Avatar on right */
}

/* Avatar styling */
.message .avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.message.user .avatar {
  background: var(--user-bubble);  /* Cyan gradient */
  color: #fff;
}

.message.assistant .avatar {
  background: var(--user-bubble);
  color: #fff;
  align-self: flex-start;
  margin-top: 2px;
}

/* Message body with tools + bubble in column */
.message-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
```

### Bubble Styling (Lines 501-520)
```css
.message .bubble {
  padding: 11px 15px;
  font-size: 14px;
  line-height: 1.75;
  word-break: break-word;
  overflow: hidden;
}

.message.user .bubble {
  background: var(--user-bubble);  /* Cyan gradient */
  color: #fff;
  border-radius: 18px 4px 18px 18px;
  box-shadow: 0 2px 10px rgba(3,105,161,.25);
}

.message.assistant .bubble {
  background: var(--surface);  /* White */
  border-radius: 4px 18px 18px 18px;
  box-shadow: var(--shadow-md);
}

.message.assistant .bubble a {
  color: var(--primary);
  text-decoration: underline;
}
```

### Tool Status Styling (Lines 552-584)
```css
.tool-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tool-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 500;
  animation: fadeIn .25s;
  max-width: fit-content;
}

.tool-status.running {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #2563eb;
}

.tool-status.done {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: var(--success);
}

.tool-status .spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin .8s linear infinite;
  flex-shrink: 0;
}
```

### Animation Definitions (Lines 779-787)
```css
@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes msgIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: .4; }
  30% { transform: translateY(-6px); opacity: 1; }
}
```

---

## 4. Markdown Rendering Function

**File**: `public/js/chat.js` — Lines 717-768

```javascript
function renderMarkdown(text) {
  let html = escapeHtml(text);
  
  // code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
  
  // inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  
  // links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // blockquote
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  
  // hr
  html = html.replace(/^---$/gm, '<hr>');
  
  // unordered list
  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // ordered list
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // tables
  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split('|').filter(c => c.trim());
    if (cells.every(c => /^[-:]+$/.test(c.trim()))) return '';
    const tag = 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c.trim()}</${tag}>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>[\s]*)+/g, '<table>$&</table>');
  html = html.replace(/<table>([\s\S]*?)<\/table>/g, (_, inner) => 
    '<div class="table-wrapper"><table>' + inner.replace(/\n/g, '') + '</table></div>'
  );
  
  // paragraphs
  html = html.replace(/\n{3,}/g, '\n\n');
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  
  // cleanup: remove excess <br> around block elements
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<br>\s*)+<\/p>/g, '');
  html = html.replace(/(<\/h[1-3]>|<\/div>|<\/table>|<\/ul>|<\/ol>|<hr>)(<br>)+/g, '$1');
  html = html.replace(/(<br>)+(<h[1-3]>|<div class="table-wrapper">|<table>|<ul>|<ol>|<hr>)/g, '$2');
  
  return html;
}
```

**Key insights for option chips**:
- HTML is sanitized via `escapeHtml()` first
- Markdown patterns are converted to HTML
- This is a **perfect injection point** for custom chip syntax
- Could extend regex to parse `~[Option Text](chip:action)` or similar syntax

---

## 5. SSE Event Flow

**File**: `public/js/chat.js` — Lines 120-220

### Stream Chat Initiation (Lines 120-156)
```javascript
async function streamChat(settings) {
  isStreaming = true;
  document.getElementById('send-btn').disabled = true;
  
  // Create assistant bubble container
  const { bubble, toolContainer } = appendAssistantMessage();
  let fullText = '';
  
  try {
    const headers = {
      'Content-Type': 'application/json',
      'X-Api-Key': settings.apiKey
    };
    if (settings.baseUrl) {
      headers['X-Base-Url'] = settings.baseUrl;
    }
    
    const bodyPayload = {
      messages: chatHistory,
      provider: settings.provider,
      model: settings.model
    };
    // ... cache data attached ...
    
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyPayload)
    });
    
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || '请求失败');
    }
```

### SSE Data Reading Loop (Lines 163-190)
```javascript
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line
      
      let eventType = null;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            handleSSEEvent(eventType, data, bubble, toolContainer, () => fullText);
            if (eventType === 'token') {
              fullText += data.text;
            }
          } catch {}
          eventType = null;
        }
      }
    }
```

**SSE Format Expected**:
```
event: <EVENT_TYPE>
data: <JSON_PAYLOAD>

```

### Event Handler (Lines 224-340)

```javascript
function handleSSEEvent(type, data, bubble, toolContainer, getFullText) {
  switch (type) {
    case 'token':
      // Streaming text token
      const currentText = getFullText() + data.text;
      bubble.innerHTML = renderMarkdown(currentText);
      scrollToBottom();
      break;
    
    case 'tool_start': {
      // Tool execution started
      if (GROUPED_TOOLS.includes(data.name)) {
        // Grouped tools (flights, hotels)
        const groupKey = `group_${data.name}`;
        let groupEl = toolContainer.querySelector(`[data-group="${data.name}"]`);
        if (!groupEl) {
          groupEl = document.createElement('div');
          groupEl.className = 'tool-status running';
          groupEl.dataset.group = data.name;
          groupEl.dataset.total = '0';
          groupEl.dataset.done = '0';
          toolContainer.appendChild(groupEl);
        }
        const total = parseInt(groupEl.dataset.total) + 1;
        groupEl.dataset.total = total;
        toolContainer.dataset[data.id || data.name] = data.name;
        groupEl.innerHTML = `<div class="spinner"></div><span>${groupLabel(data.name, total, 0)}</span>`;
        scrollToBottom();
        break;
      }
      // Non-grouped tools
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
    
    case 'tool_result': {
      // Tool execution completed
      const key = data.id || data.name;
      const groupName = toolContainer.dataset[key];
      if (groupName) {
        // Update grouped tool
        const groupEl = toolContainer.querySelector(`[data-group="${groupName}"]`);
        if (groupEl) {
          const total = parseInt(groupEl.dataset.total);
          const done = parseInt(groupEl.dataset.done) + 1;
          groupEl.dataset.done = done;
          if (done >= total) {
            groupEl.className = 'tool-status done';
            groupEl.innerHTML = `<span>${groupLabel(groupName, total, total)}</span>`;
          } else {
            groupEl.innerHTML = `<div class="spinner"></div><span>${groupLabel(groupName, total, done)}</span>`;
          }
        }
        break;
      }
      // Non-grouped tool result
      const runningEl = toolContainer.querySelector(`[data-tool-id="${key}"]`);
      if (runningEl) {
        runningEl.className = 'tool-status done';
        const fallbackLabel = runningEl.dataset.label || toolLabel(data.name, null);
        const displayLabel = data.resultLabel ? `${fallbackLabel} — ${data.resultLabel}` : fallbackLabel;
        runningEl.innerHTML = `<span>✅ ${displayLabel}</span>`;
      }
      break;
    }
    
    case 'itinerary_update':
      // Update itinerary panel
      if (typeof updateItinerary === 'function') updateItinerary(data);
      break;
    
    case 'tripbook_update':
      // Update TripBook (structured data)
      if (typeof updateFromTripBook === 'function') updateFromTripBook(data);
      try { sessionStorage.setItem('tp_tripbook', JSON.stringify(data)); } catch {}
      break;
    
    case 'error':
      bubble.innerHTML += `<br><span style="color:red">❌ ${escapeHtml(data.message)}</span>`;
      break;
    
    case 'done':
      // All tools finished
      toolContainer.querySelectorAll('.tool-status.running').forEach(el => {
        el.className = 'tool-status done';
        // Mark remaining spinners as complete
      });
      break;
  }
}
```

---

## 6. Current Event Types and Data Structures

From the codebase, these SSE events flow from backend → client:

| Event Type | Data Structure | Purpose |
|------------|---|---|
| `token` | `{ text: string }` | Streaming response token |
| `tool_start` | `{ name: string, id?: string, arguments?: object }` | Tool execution started |
| `tool_result` | `{ name: string, id?: string, resultLabel?: string }` | Tool execution completed |
| `rate_cached` | `{ from: string, to: string, rate: number, ... }` | Exchange rate result |
| `weather_cached` | `{ city: string, current: {...}, error?: boolean }` | Weather result |
| `itinerary_update` | `{ [field]: value }` | Itinerary panel update |
| `tripbook_update` | `{ structured data }` | Trip book snapshot |
| `error` | `{ message: string }` | Error notification |
| `done` | `{}` | Stream completed |

---

## 7. Key Variables and Flow Control

### Message History
```javascript
let chatHistory = [];  // { role, content } array
let isStreaming = false;  // Prevents duplicate sends
let currentTripId = null;  // Track which trip being edited
let userScrolledUp = false;  // User scroll position during stream
```

### Trip Caching
- **localStorage**: `tp_trips` (array of trip objects)
- **sessionStorage**: `tp_tripbook` (current trip structured data)
- Each trip: `{ id, title, createdAt, updatedAt, messages: [] }`

---

## 8. Rendering Pipeline Summary

```
User Types → sendMessage()
  ↓
appendUserMessage() → Creates DOM: <div class="message user">
  ↓
streamChat() → Fetch /api/chat with SSE
  ↓
SSE Reader Loop → Parses event: data: format
  ↓
handleSSEEvent() → Route to handler
  ├─ 'token' → renderMarkdown(text) → bubble.innerHTML = HTML
  ├─ 'tool_start' → Create .tool-status.running element
  ├─ 'tool_result' → Update .tool-status → .done
  ├─ 'tripbook_update' → External handler (itinerary.js)
  └─ 'error' / 'done' → Cleanup
  ↓
bubble.innerHTML = renderMarkdown(accumulatedText)
  ↓
Scrolls to bottom (unless user scrolled up)
```

---

## 9. Recommendations for Clickable Option Chips

### Option 1: Markdown-Style Syntax
Extend `renderMarkdown()` to parse custom syntax:
```
~[Option Label](chip:action_id)
```

**Pros**: 
- Minimal server changes
- Uses existing markdown pipeline
- Natural syntax

**Implementation**:
```javascript
// In renderMarkdown(), before other replacements:
html = html.replace(/~\[([^\]]+)\]\(chip:([^)]+)\)/g, 
  '<div class="chip" data-action="$2">$1</div>');
```

### Option 2: SSE Event Type
Backend sends dedicated `option_chip` event:
```javascript
case 'option_chip': {
  const chipEl = document.createElement('div');
  chipEl.className = 'chip';
  chipEl.textContent = data.label;
  chipEl.dataset.action = data.action;
  chipEl.dataset.value = data.value;
  chipEl.onclick = () => handleChipClick(data);
  bubble.appendChild(chipEl);
  break;
}
```

**Pros**:
- Cleaner separation of concerns
- Backend sends exact chip data
- Easier to add metadata

**Cons**:
- More changes to backend SSE protocol

### Option 3: Hybrid - Markdown + Click Handler
Use markdown syntax but make `.chip` elements interactive in CSS/JS:
```css
.chip {
  display: inline-block;
  padding: 6px 12px;
  background: #e0f2fe;
  color: #0369a1;
  border-radius: 16px;
  border: 1px solid #bfdbfe;
  cursor: pointer;
  transition: all .2s;
  margin-right: 4px;
  font-size: 13px;
  font-weight: 500;
}

.chip:hover {
  background: #0369a1;
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(3,105,161,.2);
}

.chip:active {
  transform: translateY(0);
}
```

---

## Summary

**Chat Bubble Structure**:
- User messages: Right-aligned, cyan gradient
- AI messages: Left-aligned, white, with tool status row above
- Markdown rendered in real-time as tokens stream in
- Tool status elements show live spinner → checkmark transition

**SSE Flow**:
- Server streams events with format: `event: TYPE\ndata: JSON\n\n`
- Handler dispatches to appropriate UI update
- Full text accumulated for markdown re-render on each token

**For Option Chips**:
- **Best approach**: Extend markdown renderer to recognize chip syntax
- **Place**: Inside `renderMarkdown()` function, after sanitization
- **DOM**: Render as `<div class="chip" data-action="...">` 
- **Handler**: Add click listener to chips after rendering
- **SSE**: Could add optional `option_chip` event type for rich metadata

