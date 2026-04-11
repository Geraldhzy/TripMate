# SSE Streaming Events - Quick Reference Guide

## File Structure
```
public/js/chat.js
├── Lines 120-219: streamChat() - Main streaming loop
├── Lines 224-344: handleSSEEvent() - Event dispatcher
└── Lines 794-827: appendAssistantMessage() - DOM creation
```

---

## 1. Event Types at a Glance

| Event | Line | What It Does | Visual Result |
|-------|------|-------------|----------------|
| `token` | 226 | Text chunk arrives | Typing dots → text, markdown renders |
| `tool_start` | 232 | Tool begins | 🔄 Spinner badge appears above bubble |
| `tool_result` | 265 | Tool finishes | ✅ Checkmark, text + summary |
| `rate_cached` | 295 | Exchange rate saved | (hidden) |
| `weather_cached` | 300 | Weather saved + synced | Right panel updates |
| `itinerary_update` | 309 | Trip info changed | Right panel updates |
| `tripbook_update` | 313 | Trip structure changed | (hidden, stored) |
| `quick_replies` | 320 | Suggestions ready | Interactive chip buttons |
| `error` | 326 | Something failed | 🔴 Red error text |
| `done` | 330 | Stream ended | Force-complete all spinners |

---

## 2. Data Structures

### SSE Wire Format
```
event: token
data: {"text":"Hello "}

event: tool_start
data: {"id":"call_123","name":"search_flights","arguments":{"origin":"NYC"}}

event: tool_result
data: {"id":"call_123","name":"search_flights","resultLabel":"Found 5 flights"}
```

### Parsed Event Object
```javascript
{
  type: 'token',      // from "event: " line
  data: { text: '...' } // from "data: " line (JSON)
}
```

---

## 3. Message Bubble Flow

```
INITIAL (line 819)
bubble.innerHTML = '<div class="typing-dots"><span></span>...</div>'

FIRST TOKEN (line 228)
bubble.innerHTML = renderMarkdown(currentText)
// Typing dots GONE, text appears

EACH SUBSEQUENT TOKEN (line 228)
bubble.innerHTML = renderMarkdown(fullText + newToken)
// Re-render entire content with new token
```

---

## 4. Tool Container Flow

### Grouped Tools (search_flights, search_hotels)

```javascript
// Line 347: GROUPED_TOOLS = ['search_flights', 'search_hotels']

// First tool_start with search_flights
toolContainer.querySelector('[data-group="search_flights"]') // null
// → Create new element, set dataset.total=1

// Second tool_start with search_flights
// → Same element, increment total to 2

// tool_result for first flight
// → increment done: 1, show "✈️ 正在查询机票… (1/2)"

// tool_result for second flight
// → increment done: 2, show "✅ ✈️ 已查询 2 条航线"
```

### Non-Grouped Tools

```javascript
// Creates individual badge for each tool
// No progress counter, just single running→done transition
```

---

## 5. Markdown Rendering

**Called on EVERY token (line 228)**

```javascript
bubble.innerHTML = renderMarkdown(currentText);
```

Supports:
- Headers: `# H1`, `## H2`, `### H3`
- Bold/Italic: `**bold**`, `*italic*`
- Code: `` `inline` ``, ` ```js code block``` `
- Lists: `- item`, `* item`, `1. numbered`
- Tables: `| col1 | col2 |`
- Links: `[text](url)`
- Blockquote: `> quoted`
- `<think>` blocks: collapsible reasoning

**Key**: Re-renders **entire content** each time = progressive formatting as text streams in

---

## 6. Typing Indicator

### Initial Display (line 819)
```javascript
bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
```

### CSS (style.css lines 754-764)
```css
.typing-dots span {
  animation: typingBounce 1.2s ease-in-out infinite;
  animation-delay: 0s; /* .2s, .4s for other spans */
}
```

### Animation (style.css lines 952-955)
```css
@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: .4; }
  30% { transform: translateY(-6px); opacity: 1; }
}
```

### Replaced When
First `token` event → `renderMarkdown()` replaces entire `bubble.innerHTML` → typing dots **vanish**

---

## 7. Tool Interleaving Logic

### DOM Structure
```html
<div class="message assistant">
  <div class="avatar">🌍</div>
  <div class="message-body">
    <div class="tool-container">
      <!-- Tool badges appear HERE -->
      <div class="tool-status running">
        <div class="spinner"></div>
        <span>✈️ 正在查询机票…</span>
      </div>
    </div>
    <div class="bubble">
      <!-- Text content appears HERE -->
      <p>I found these flights...</p>
    </div>
  </div>
</div>
```

### CSS Layout (style.css line 667)
```css
.message-body { 
  display: flex; 
  flex-direction: column;  /* Stack vertically */
  gap: 6px; 
}
```

**Result**: Tools ALWAYS appear ABOVE text bubble

---

## 8. Safety Cleanup (finally block, lines 199-218)

```javascript
// In case 'done' event is missed or corrupted:
toolContainer.querySelectorAll('.tool-status.running').forEach(el => {
  el.className = 'tool-status done';
  // Convert to checkmark + label
});
```

**When**: After streaming stops (success or error)

**Why**: Prevents visual glitches from stuck spinners

---

## 9. Scroll Behavior

### Auto-Scroll During Streaming (line 229, 261)
```javascript
if (!userScrolledUp) {
  chatArea.scrollTop = chatArea.scrollHeight;
}
```

### User Scroll Detection (lines 873-881)
```javascript
chatArea.addEventListener('scroll', () => {
  const distFromBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight;
  userScrolledUp = distFromBottom > 20; // 20px threshold
  
  if (userScrolledUp && isStreaming) {
    showScrollHint(); // "↓ 跳到最新" button
  }
});
```

### Hint Button (lines 851-866)
- Appears when user scrolls up > 20px
- Clicking disables `userScrolledUp` flag
- Disappears when stream ends

---

## 10. Grouped Tool Progress Display

### Function: `groupLabel()` (lines 520-532)

```javascript
groupLabel('search_flights', 5, 0) → "✈️ 正在查询机票…"
groupLabel('search_flights', 5, 2) → "✈️ 正在查询机票… (2/5)"
groupLabel('search_flights', 5, 5) → "✅ ✈️ 已查询 5 条航线"
```

### Tracking via Dataset
```javascript
// line 242
groupEl.dataset.total = totalCount;
groupEl.dataset.done = doneCount;
```

---

## 11. Quick Replies Rendering

### Trigger: `quick_replies` event (line 320)
```javascript
renderQuickReplies(data, bubble);
// data.questions = [ { text, options, multiSelect?, allowInput? }, ... ]
```

### Inserted After Bubble (line 516)
```javascript
bubble.parentElement.appendChild(wrapper);
```

### On Submit
```javascript
document.getElementById('msg-input').value = combinedAnswers;
sendMessage();
```

---

## 12. Common Patterns

### Find a running tool status
```javascript
toolContainer.querySelector('[data-tool-id="call_123"]')
```

### Check if tool is grouped
```javascript
const groupName = toolContainer.dataset['call_123'];
if (groupName) { /* it's grouped */ }
```

### Get current accumulated text
```javascript
const currentText = getFullText(); // callback passed to handleSSEEvent
```

### Force scroll down now
```javascript
scrollToBottom();
```

### Re-render bubble
```javascript
bubble.innerHTML = renderMarkdown(fullText);
```

---

## 13. Performance Considerations

⚠️ **Note**: `renderMarkdown()` is called on **every token**
- This means entire content is re-parsed each time
- For long messages, this could be expensive
- But: Ensures progressive formatting (headers appear as they're typed)

Alternative approaches:
- Diff-based updates (complex)
- Virtual DOM (adds framework dependency)
- Current approach: simple, works well for typical message lengths

---

## 14. Error Handling

### HTTP Error (line 158-161)
```javascript
if (!resp.ok) {
  const err = await resp.json().catch(() => ({ error: resp.statusText }));
  throw new Error(err.error || '请求失败');
}
```
→ Shows in red in bubble

### SSE Parse Error (line 186)
```javascript
} catch {}  // Silently ignore malformed JSON
```
→ Invalid events are skipped

### SSE Event Error (line 326-328)
```javascript
case 'error':
  bubble.innerHTML += `<br><span style="color:red">❌ ${escapeHtml(data.message)}</span>`;
```
→ Server-sent error message appended to bubble

---

## 15. State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `isStreaming` | bool | Prevents multiple simultaneous streams |
| `fullText` | string | Accumulates all tokens for final save |
| `userScrolledUp` | bool | Tracks if user manually scrolled up |
| `chatHistory` | array | Message history (role, content) |
| `currentTripId` | string\|null | Current trip being edited |

---

## 16. Testing Checklist

- [ ] First token appears and replaces typing dots
- [ ] Tool statuses appear above text
- [ ] Grouped tool progress counter increments (2/5 → 3/5)
- [ ] First tool transitions to checkmark when done
- [ ] Second tool can start while first is running
- [ ] Markdown formats correctly as text streams
- [ ] Manual scroll hides auto-scroll (shows "jump to latest" button)
- [ ] "done" event force-completes any remaining spinners
- [ ] Message saved to history after streaming ends
- [ ] Textarea auto-resizes as user types

---

## 17. Related Functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `sendMessage()` | 74 | Entry point for user input |
| `streamChat()` | 120 | Main streaming loop |
| `appendAssistantMessage()` | 794 | Creates message DOM |
| `appendUserMessage()` | 782 | Creates user message DOM |
| `handleSSEEvent()` | 224 | Event dispatcher |
| `renderMarkdown()` | 892 | Converts markdown to HTML |
| `toolLabel()` | 534 | Format tool name with args |
| `groupLabel()` | 520 | Format grouped tool progress |
| `scrollToBottom()` | 883 | Auto-scroll logic |
| `renderQuickReplies()` | 352 | Render suggestion chips |

