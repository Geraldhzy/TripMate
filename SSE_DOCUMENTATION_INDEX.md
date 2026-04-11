# SSE Streaming Documentation Index

Complete documentation for understanding how the AI Travel Planner frontend handles Server-Sent Events (SSE) during AI responses.

## 📚 Documents Included

### 1. **SSE_STREAMING_ANALYSIS.md** (22KB)
**Comprehensive deep-dive covering:**
- Complete architecture overview
- Line-by-line code walkthrough
- All 10 SSE event types with code
- Message bubble creation & updates
- Tool interleaving logic
- Visual state transitions
- Markdown rendering details
- Scroll management
- Cleanup & safety mechanisms

**Best for**: Understanding the complete system end-to-end

---

### 2. **SSE_QUICK_REFERENCE.md** (9.4KB)
**Quick lookup guide with:**
- Event types at a glance (table)
- Data structures & wire format
- Message bubble flow
- Tool container logic
- Common code patterns
- Testing checklist
- Performance notes
- Error handling strategies

**Best for**: Quick answers, common tasks, troubleshooting

---

### 3. **SSE_EVENT_FLOW_DIAGRAM.txt** (17KB)
**Visual flow diagrams showing:**
- User message → streaming initialization
- SSE parsing loop
- Event handler switch cases
- Visual state timeline (t=0ms to t=800ms)
- Grouped tool progress example
- Markdown rendering per token
- Cleanup sequence

**Best for**: Understanding flow and visual state changes

---

## 🎯 Quick Navigation

### I need to understand...

| Topic | File | Section |
|-------|------|---------|
| How the entire system works | SSE_STREAMING_ANALYSIS.md | Section 1: Architecture |
| What happens when the user sends a message | SSE_EVENT_FLOW_DIAGRAM.txt | "User Sends Message" diagram |
| The typing indicator | SSE_STREAMING_ANALYSIS.md | Section 2 |
| How tool calls are displayed | SSE_STREAMING_ANALYSIS.md | Section 5 |
| Tool interleaving with text | SSE_STREAMING_ANALYSIS.md | Section 6 |
| Grouped vs individual tools | SSE_QUICK_REFERENCE.md | Section 4 |
| How markdown is rendered | SSE_STREAMING_ANALYSIS.md | Section 4, SSE_QUICK_REFERENCE.md | Section 5 |
| Visual states during streaming | SSE_EVENT_FLOW_DIAGRAM.txt | "Visual State Timeline" |
| Tool progress counters | SSE_STREAMING_ANALYSIS.md | Section 5, SSE_QUICK_REFERENCE.md | Section 10 |
| Auto-scroll behavior | SSE_STREAMING_ANALYSIS.md | Section 10, SSE_QUICK_REFERENCE.md | Section 9 |
| What the `done` event does | SSE_STREAMING_ANALYSIS.md | Section 7 |
| Error handling | SSE_QUICK_REFERENCE.md | Section 14 |
| Testing the feature | SSE_QUICK_REFERENCE.md | Section 16 |

---

## 📍 Key Code Locations

### Main Entry Points
```
chat.js:74     sendMessage() - User input handler
chat.js:120    streamChat() - Main streaming loop
chat.js:224    handleSSEEvent() - Event dispatcher
chat.js:794    appendAssistantMessage() - DOM creation
```

### Event Handlers
```
chat.js:226    case 'token' - Text rendering
chat.js:232    case 'tool_start' - Tool begins
chat.js:265    case 'tool_result' - Tool completes
chat.js:295    case 'rate_cached' - Cache exchange rate
chat.js:300    case 'weather_cached' - Cache weather
chat.js:309    case 'itinerary_update' - Update trip panel
chat.js:313    case 'tripbook_update' - Update trip structure
chat.js:320    case 'quick_replies' - Render chips
chat.js:326    case 'error' - Handle error
chat.js:330    case 'done' - Stream complete
```

### Utility Functions
```
chat.js:520    groupLabel() - Grouped tool label formatting
chat.js:534    toolLabel() - Individual tool label
chat.js:892    renderMarkdown() - Convert markdown to HTML
chat.js:883    scrollToBottom() - Auto-scroll logic
chat.js:851    showScrollHint() - "Jump to latest" button
chat.js:352    renderQuickReplies() - Suggestion chips
```

### Styling
```
style.css:667   .message-body - Vertical layout (tools above bubble)
style.css:720   .tool-container - Tool status container
style.css:722   .tool-status - Individual tool badge
style.css:754   .typing-dots - Typing indicator dots
style.css:947   @keyframes spin - Spinner rotation
style.css:952   @keyframes typingBounce - Typing animation
```

---

## 🔄 Event Flow Summary

```
USER → sendMessage()
     ↓
   streamChat() creates bubble with typing dots
     ↓
   fetch('/api/chat') opens SSE stream
     ↓
   While (stream not done):
     ├─ Parse "event: TYPE" & "data: JSON"
     ├─ Call handleSSEEvent()
     └─ Handle by type:
          ├─ token → render markdown, remove typing dots
          ├─ tool_start → add spinner above bubble
          ├─ tool_result → remove spinner, add checkmark
          ├─ other events → handle side effects
          └─ done → force-complete remaining spinners
     ↓
   finally:
     ├─ Clear all running spinners (safety)
     ├─ Re-enable UI
     ├─ Save to localStorage
     └─ Done!
```

---

## 🎨 Visual State Transitions

```
INITIAL
  Bubble: ⏱️⏱️⏱️ (typing dots)
  Tools: (empty)

→ tool_start
  Bubble: ⏱️⏱️⏱️
  Tools: ✈️ 正在查询机票… (spinner)

→ token (first)
  Bubble: 我为你... (typing dots replaced)
  Tools: ✈️ 正在查询机票…

→ tokens (more)
  Bubble: 我为你找到了...
  Tools: ✈️ 正在查询机票…

→ tool_result
  Bubble: 我为你找到了...
  Tools: ✅ ✈️ 已查询 3 条航线 (spinner gone)

→ done
  Bubble: [complete response]
  Tools: ✅ ✈️ 已查询 3 条航线
```

---

## 📊 Event Type Reference

| Event | Type | Source | Effect |
|-------|------|--------|--------|
| `token` | Text | AI model streaming | Append to `fullText`, re-render markdown |
| `tool_start` | Tool | Tool call begins | Add running spinner above bubble |
| `tool_result` | Tool | Tool execution ends | Replace spinner with checkmark |
| `rate_cached` | Data | Exchange rate fetched | Cache to localStorage |
| `weather_cached` | Data | Weather fetched | Cache & update right panel |
| `itinerary_update` | Data | Trip info changes | Update right panel display |
| `tripbook_update` | Data | Trip structure changes | Save to sessionStorage |
| `quick_replies` | UI | AI suggests follow-ups | Render chip buttons |
| `error` | Error | Something failed | Append red error text |
| `done` | Control | Stream ends | Force-complete spinners |

---

## 🛠️ Common Tasks

### Add a new event type
1. Add case to `handleSSEEvent()` (chat.js:224)
2. Implement handler logic
3. Update documentation

### Modify grouped tools list
```javascript
// chat.js:347
GROUPED_TOOLS = ['search_flights', 'search_hotels'] // edit here
```

### Change typing indicator animation
```css
/* style.css:952-955 */
@keyframes typingBounce { /* modify here */ }
```

### Adjust auto-scroll threshold
```javascript
// chat.js:878
userScrolledUp = distFromBottom > 20; // change 20 to other value
```

### Add markdown support
```javascript
// chat.js:892
function renderMarkdown(text) {
  // Add regex for new format here
}
```

---

## ⚡ Performance Notes

### Current Approach
- Calls `renderMarkdown()` on **every token**
- Re-parses entire content each time
- Simple, easy to understand, works well for typical message lengths

### Potential Optimizations
- Diff-based updates (only re-render new tokens)
- Virtual DOM approach
- Incremental parsing

### When It Matters
- Messages < 5KB: No issues
- Messages 5-20KB: Slight pause between tokens
- Messages > 20KB: More noticeable lag

---

## 🧪 Testing Scenarios

### Basic Flow
- [ ] User sends message
- [ ] Bubble appears with typing dots
- [ ] First token replaces typing dots
- [ ] Text continues streaming
- [ ] Message saved to history

### Tool Calls
- [ ] Tool status appears above text
- [ ] Multiple tools can run concurrently
- [ ] Grouped tools show progress (N/M)
- [ ] Tool transitions to checkmark when done
- [ ] Text continues during tool execution

### Grouped Tool Aggregation
- [ ] Multiple search_flights calls merge into one badge
- [ ] Progress counter updates (1/3 → 2/3 → 3/3)
- [ ] Final state shows total (✅ ✈️ 已查询 3 条航线)

### Scroll Behavior
- [ ] Auto-scrolls as content arrives
- [ ] Scrolling up shows "jump to latest" button
- [ ] Clicking button re-enables auto-scroll
- [ ] Button hides when stream ends

### Edge Cases
- [ ] Network error during stream
- [ ] Malformed JSON in SSE event
- [ ] Tool never sends result (done event force-completes)
- [ ] Very long messages (markdown performance)
- [ ] Concurrent messages (blocked by isStreaming flag)

---

## 🔗 Related Systems

### Right Panel Updates
- `weather_cached` event triggers `updateItinerary()`
- `itinerary_update` event triggers `updateItinerary()`
- `tripbook_update` event triggers `updateFromTripBook()`
- Defined in separate file (itinerary.js or similar)

### Message History
- Messages saved to `chatHistory` array
- Auto-saved to localStorage via `saveTripSnapshot()`
- Loaded on app restart
- Deletable via history panel

### Caching
- Exchange rates cached in localStorage (4 hour TTL)
- Weather cached in localStorage (3 hour TTL)
- Trip data cached in sessionStorage

---

## 📋 SSE Wire Format

### Example Exchange

**Client Request:**
```
POST /api/chat
Content-Type: application/json

{
  "messages": [{"role":"user","content":"Find flights to Paris"}],
  "provider": "openai",
  "model": "gpt-4o"
}
```

**Server Response (streaming):**
```
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
```

---

## 🚀 Getting Started

### To Understand the System
1. Read SSE_STREAMING_ANALYSIS.md Section 1 (Architecture)
2. Look at SSE_EVENT_FLOW_DIAGRAM.txt (Visual overview)
3. Study SSE_QUICK_REFERENCE.md (Specific details)

### To Make a Change
1. Find the relevant section in QUICK_REFERENCE or ANALYSIS
2. Locate the code lines
3. Make the change
4. Test using checklist from QUICK_REFERENCE

### To Debug an Issue
1. Check error handling in QUICK_REFERENCE Section 14
2. Add console logs around handleSSEEvent()
3. Monitor network tab for SSE events
4. Check browser console for JavaScript errors

---

## 📞 Questions?

- **How is streaming implemented?** → Section 1 of Analysis
- **What's that spinner?** → Section 5 of Analysis + quick reference
- **Why does text lag?** → Performance section
- **Where's the code?** → Check "Key Code Locations" above
- **How do I test?** → Check "Testing Scenarios"

---

**Last Updated**: 2026-04-10
**Scope**: public/js/chat.js, public/css/style.css (SSE streaming only)
**Lines Covered**: ~850 lines of JavaScript + 250 lines of CSS

