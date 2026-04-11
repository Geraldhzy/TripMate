# 🚀 SSE Streaming Documentation - Complete Guide

Welcome! This directory contains comprehensive documentation for understanding how SSE (Server-Sent Events) streaming works in the AI Travel Planner frontend.

## 📚 Four Documents Included

```
├── SSE_DOCUMENTATION_INDEX.md      ← START HERE (navigation hub)
├── SSE_STREAMING_ANALYSIS.md       ← Deep technical analysis
├── SSE_QUICK_REFERENCE.md          ← Quick lookup guide
├── SSE_EVENT_FLOW_DIAGRAM.txt      ← Visual diagrams
└── README_SSE_DOCS.md              ← You are here
```

---

## 🎯 Where Should I Start?

### ✅ I want to...

**...understand the complete system**
→ Start with SSE_STREAMING_ANALYSIS.md (Section 1)
→ Then look at SSE_EVENT_FLOW_DIAGRAM.txt for visuals

**...quickly find something specific**
→ Use SSE_DOCUMENTATION_INDEX.md (Quick Navigation table)
→ Then jump to the relevant file/section

**...learn the basics fast**
→ Read SSE_QUICK_REFERENCE.md (15 min read)
→ Focus on Sections 1, 3, 4, 6, 7

**...debug a problem**
→ Check SSE_QUICK_REFERENCE.md Section 14 (Error Handling)
→ Check SSE_QUICK_REFERENCE.md Section 16 (Testing Checklist)

**...make a code change**
→ Find the code location in SSE_DOCUMENTATION_INDEX.md
→ Read the relevant analysis section
→ Make change → test using checklist

**...understand tool interleaving**
→ SSE_STREAMING_ANALYSIS.md Section 5 (tool_start event)
→ SSE_STREAMING_ANALYSIS.md Section 6 (DOM structure)
→ SSE_EVENT_FLOW_DIAGRAM.txt (Visual examples)

**...see the visual state changes**
→ SSE_EVENT_FLOW_DIAGRAM.txt (Visual State Timeline section)
→ Shows exact UI at each step (t=0ms to t=800ms)

---

## 📊 Document Overview

| Document | Size | Focus | Best For |
|----------|------|-------|----------|
| INDEX | 8KB | Navigation | Finding things |
| ANALYSIS | 22KB | Complete system | Understanding deeply |
| REFERENCE | 9.4KB | Quick lookup | Common tasks |
| DIAGRAMS | 17KB | Visual flows | Understanding flow |

---

## 🔑 Key Concepts to Know

### 1. SSE (Server-Sent Events)
- One-way streaming from server to browser
- Formatted as: `event: TYPE\ndata: JSON\n\n`
- Not WebSocket (simpler, request-response based)

### 2. Message Bubble Creation
```
1. User sends message → sendMessage()
2. streamChat() creates assistant message bubble
3. Bubble initially shows 3 animated dots (typing indicator)
4. First token arrives → dots disappear, text appears
5. Text continues streaming with live markdown rendering
6. Tools run during text streaming, adding badges above bubble
7. Stream ends → message saved to history
```

### 3. Tool Display
```
Above text bubble:
┌─────────────────────────┐
│ ✈️ 正在查询机票… (spinner) │ ← tool_start event
│ ✅ ✈️ 已查询 3 条航线  │ ← tool_result event
└─────────────────────────┘

Below tools:
Text content (Markdown formatted)
```

### 4. Grouped Tools
- `search_flights` and `search_hotels` are special
- Multiple calls of same tool merge into ONE badge
- Shows progress counter: "✈️ 正在查询机票… (2/5)"
- When all done: "✅ ✈️ 已查询 5 条航线"

### 5. Markdown Rendering
- Called on EVERY token (100s of times during stream)
- Re-parses entire message each time
- Simple approach, works well for normal message lengths
- Supports headers, bold, code, tables, links, lists, etc.

---

## 🎨 Visual Timeline

```
User types: "Find flights to Paris"
              ↓
         Press Enter
              ↓
    Bubble appears with ⏱️⏱️⏱️
              ↓
    Server: tool_start for search_flights
              ↓
    Bubble: [spinner icon] ✈️ 正在查询机票…
              ↓
    Server: token "I'll help"
              ↓
    Bubble: I'll help (typing dots gone)
              ↓
    Server: token " you find"
              ↓
    Bubble: I'll help you find
              ↓
    Server: tool_result for search_flights
              ↓
    Bubble: ✅ ✈️ 已查询 3 条航线 (spinner gone)
             I'll help you find...
              ↓
    More tokens arrive...
              ↓
    Server: done event
              ↓
    Final bubble with all text
    Tools: ✅ ✈️ 已查询 3 条航线
           ✅ 🏨 已查询 5 家酒店
```

---

## 🔍 Code Locations (Cheat Sheet)

### Creating the bubble
```javascript
// chat.js:794-827
function appendAssistantMessage() {
  // Creates message container with tool-container + bubble
  // Bubble initially contains: <div class="typing-dots">...</div>
}
```

### Processing streams
```javascript
// chat.js:120-219
async function streamChat(settings) {
  // Fetches /api/chat with SSE
  // Reads stream line-by-line
  // Calls handleSSEEvent() for each event
}
```

### Handling events
```javascript
// chat.js:224-344
function handleSSEEvent(type, data, bubble, toolContainer) {
  switch (type) {
    case 'token': /* render text */
    case 'tool_start': /* add spinner */
    case 'tool_result': /* remove spinner, add checkmark */
    // ... etc
  }
}
```

### Rendering markdown
```javascript
// chat.js:892-964
function renderMarkdown(text) {
  // Called on every token!
  // Converts markdown to HTML
  // Returns HTML string
}
```

### Styling
```css
/* style.css:754-764 */
.typing-dots span { animation: typingBounce 1.2s ease-in-out infinite; }

/* style.css:720-751 */
.tool-container { display: flex; flex-direction: column; }
.tool-status { padding: 4px 12px; border-radius: 20px; }
.tool-status.running { background: #eff6ff; /* light blue */ }
.tool-status.done { background: #f0fdf4; /* light green */ }
.tool-status .spinner { animation: spin .8s linear infinite; }
```

---

## 🧪 Testing Quickly

### Minimal Test
1. Open browser DevTools → Network tab
2. Type in chat: "Search for flights"
3. Watch Network tab for `/api/chat` request
4. Look for `event: token`, `event: tool_start`, etc.

### Full Test Checklist
See SSE_QUICK_REFERENCE.md Section 16 for complete checklist

---

## 🚨 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Typing dots don't disappear | First token not received | Check server streaming |
| Spinner keeps spinning | tool_result event missing | Check server tool handling |
| Text won't scroll down | userScrolledUp flag stuck | Scroll manually, then click button |
| Layout looks broken | CSS not loaded | Hard refresh browser |
| Old messages reappear | Chat history loading | Check localStorage |

---

## 📈 Performance Guide

### Re-renders per message
- **50 tokens** = renderMarkdown() called 50 times
- **Each call** parses entire message for markdown
- **Result**: For 50 tokens, ~50 full parses

### Impact
- < 5KB messages: No noticeable lag
- 5-20KB messages: Slight delays between tokens
- > 20KB messages: More noticeable lag

### Why current approach?
- Simple to understand
- Easy to maintain
- Works well for typical travel planning queries
- Alternative (incremental parsing) more complex

---

## 🔗 File Map

```
public/
├── js/
│   ├── chat.js                 ← Main file (850+ lines)
│   │   ├── sendMessage()       ← User input
│   │   ├── streamChat()        ← Streaming loop
│   │   ├── handleSSEEvent()    ← Event router
│   │   ├── appendAssistantMessage() ← DOM creation
│   │   ├── renderMarkdown()    ← HTML rendering
│   │   └── ...other utilities
│   └── itinerary.js            ← Right panel updates
│
└── css/
    └── style.css               ← 250+ lines for chat/tools/animations
        ├── .message-body       ← Vertical flex layout
        ├── .tool-container     ← Tool badges
        ├── .tool-status        ← Running/done states
        ├── .typing-dots        ← Typing animation
        ├── .spinner            ← Rotation animation
        └── @keyframes          ← Animations

Documentation/
├── SSE_DOCUMENTATION_INDEX.md
├── SSE_STREAMING_ANALYSIS.md
├── SSE_QUICK_REFERENCE.md
├── SSE_EVENT_FLOW_DIAGRAM.txt
└── README_SSE_DOCS.md          ← You are here
```

---

## 💡 Quick Tips

### To add a new event type
1. Open chat.js:224 (handleSSEEvent function)
2. Add `case 'my_event':` with logic
3. Test with network inspection
4. Update documentation

### To change grouped tools list
Edit chat.js:347:
```javascript
const GROUPED_TOOLS = ['search_flights', 'search_hotels']; // add/remove here
```

### To customize tool labels
Edit toolLabel() at chat.js:534 and groupLabel() at chat.js:520

### To modify animations
Edit style.css:
- Typing dots: lines 754-764 + 952-955
- Spinner: lines 747-749 + 947

---

## 📞 Common Questions

**Q: Why are tools shown above the text?**
A: Flexbox column layout (style.css:667). Tools added first in DOM order.

**Q: Why re-render entire message per token?**
A: Simple approach. Ensures markdown formatting appears as user types.

**Q: How is `userScrolledUp` set?**
A: Scroll listener (chat.js:873-881). Set when scrolled > 20px from bottom.

**Q: Where are messages saved?**
A: chatHistory array, then saved to localStorage via saveTripSnapshot() (chat.js:647)

**Q: Can user send message while streaming?**
A: No. isStreaming flag disables send button (chat.js:122, 203)

**Q: What's that "jump to latest" button?**
A: Shows when user scrolls up during streaming. Clicking it re-enables auto-scroll.

---

## 📖 Reading Order

### If you have 5 minutes
→ SSE_QUICK_REFERENCE.md (Sections 1, 3, 6)

### If you have 15 minutes
→ SSE_QUICK_REFERENCE.md (all sections)

### If you have 30 minutes
→ SSE_STREAMING_ANALYSIS.md (Sections 1-6)
→ SSE_QUICK_REFERENCE.md (reference)

### If you have 1 hour
→ Read ALL three documents in order:
  1. SSE_DOCUMENTATION_INDEX.md (context)
  2. SSE_STREAMING_ANALYSIS.md (complete)
  3. SSE_EVENT_FLOW_DIAGRAM.txt (visuals)
  4. SSE_QUICK_REFERENCE.md (details)

---

## 🎓 Learning Path

```
Beginner
  ↓
  1. Read README_SSE_DOCS.md (this file)
  2. Look at SSE_EVENT_FLOW_DIAGRAM.txt (visual)
  3. Skim SSE_QUICK_REFERENCE.md (high level)
  ↓
Intermediate
  ↓
  4. Read SSE_STREAMING_ANALYSIS.md Sections 1-3
  5. Look at code locations in chat.js
  6. Trace a single event (e.g., 'token') through code
  ↓
Advanced
  ↓
  7. Read full SSE_STREAMING_ANALYSIS.md
  8. Study renderMarkdown() function (chat.js:892)
  9. Make a small code change and test
  ↓
Expert
  ↓
  10. Optimize performance (incremental rendering)
  11. Add new event types
  12. Integrate with other systems (right panel, history)
```

---

## ✅ Next Steps

- [ ] Read SSE_DOCUMENTATION_INDEX.md for navigation overview
- [ ] Check SSE_QUICK_REFERENCE.md Section 1 for event types
- [ ] Look at SSE_EVENT_FLOW_DIAGRAM.txt for visual overview
- [ ] Open chat.js in editor and find the functions mentioned
- [ ] Use SSE_QUICK_REFERENCE.md as reference for lookups
- [ ] Bookmark SSE_DOCUMENTATION_INDEX.md for future navigation

---

**Created**: 2026-04-10  
**Scope**: Frontend SSE streaming (public/js/chat.js + public/css/style.css)  
**Total Documentation**: 4 files, ~55KB of comprehensive guides

Good luck! 🚀
