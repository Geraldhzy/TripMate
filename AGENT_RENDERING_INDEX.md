# Agent Rendering Documentation Index

## 📚 Documentation Files

This project contains 4 comprehensive guides for understanding agent progress/results rendering:

### 1. **AGENT_RENDERING_GUIDE.md** - Full Technical Reference
**Best for:** Detailed implementation understanding, copy-paste code examples

Contents:
- All 7 SSE event handlers with full code
- Complete DOM structure for each state
- CSS styling reference
- Complete data flow example
- Error handling patterns
- All query selectors

**Start here if:** You need to modify or extend agent rendering logic

---

### 2. **AGENT_RENDERING_QUICK_REF.md** - Quick Reference Card
**Best for:** Quick lookups, remembering code locations, emoji cheatsheet

Contents:
- File locations with line numbers
- SSE event tree diagram
- DOM structure examples (expanded/collapsed states)
- Key functions table
- Data attributes reference
- CSS animations
- Error handling summary

**Start here if:** You need quick reminders or must find something specific

---

### 3. **AGENT_RENDERING_FLOW.md** - Visual Diagrams
**Best for:** Understanding event sequences, DOM creation steps, visual learners

Contents:
- ASCII flowchart of complete SSE event sequence
- Step-by-step DOM creation timeline (6 steps)
- JavaScript code for each DOM creation step
- CSS state management rules
- Query selector examples

**Start here if:** You want to understand the big picture flow

---

### 4. **This File (AGENT_RENDERING_INDEX.md)** - Navigation Guide
**Best for:** Finding the right document for your task

---

## 🎯 Quick Navigation by Task

### "I need to find where SSE events are handled"
→ **AGENT_RENDERING_QUICK_REF.md** (File Locations section)
→ **public/js/chat.js**, lines 226-514

### "I need to understand the summary line format"
→ **AGENT_RENDERING_GUIDE.md** (Section 2: Summary Line Generation)
→ **public/js/chat.js**, lines 460-476

### "I need to modify how agent rows are displayed"
→ **AGENT_RENDERING_GUIDE.md** (Section 3: DOM Manipulation)
→ **public/js/chat.js**, lines 355-371 (agent_start)

### "I need to add new CSS styling for agents"
→ **AGENT_RENDERING_QUICK_REF.md** (CSS section)
→ **public/css/style.css**, lines 1291-1400

### "I need to understand the collapse/expand mechanism"
→ **AGENT_RENDERING_FLOW.md** (Step 6: agents_batch_done)
→ **AGENT_RENDERING_GUIDE.md** (Section 3.5: Collapse Mechanism)
→ **public/css/style.css**, lines 1324-1331

### "I need to debug agent rendering"
→ **AGENT_RENDERING_GUIDE.md** (Section 7: Error Handling)
→ **public/js/chat.js**, lines 207-216 and 488-512

### "I need to trace event flow for a specific agent"
→ **AGENT_RENDERING_FLOW.md** (Complete SSE Event Flow section)

---

## 📋 File Summary

| File | Type | Lines | Focus |
|------|------|-------|-------|
| `public/js/chat.js` | Code | 226-514 | All SSE handlers + DOM manipulation |
| `public/css/style.css` | Code | 1291-1400 | Agent panel CSS + animations |
| `AGENT_RENDERING_GUIDE.md` | Doc | - | Full technical reference |
| `AGENT_RENDERING_QUICK_REF.md` | Doc | - | Quick lookup reference |
| `AGENT_RENDERING_FLOW.md` | Doc | - | Visual flows and diagrams |

---

## 🔍 Key Code Locations

### Core Functions
- **handleSSEEvent()** - Line 226 - Main event dispatcher
- **streamChat()** - Line 120 - Opens event stream
- **appendAssistantMessage()** - Line 999 - Creates message container

### Event Handlers (in handleSSEEvent)
- **agents_batch_start** - Lines 337-352
- **agent_start** - Lines 355-371
- **agent_tool** - Lines 373-388
- **agent_tool_done** - Lines 390-405
- **agent_done** - Lines 407-429
- **agent_error** - Lines 431-450
- **agents_batch_done** - Lines 452-482 (⭐ Summary generation)

### Helper Functions
- **groupLabel()** - Line 690
- **toolLabel()** - Line 706

---

## 🎨 CSS Classes Quick Reference

```
.agent-progress-panel ←─ Main container
  ├─ .agent-panel-header ← Title bar with counter
  └─ .agent-panel-body ← List of agent rows
     └─ .agent-row (data-agent) ← Individual agent
        ├─ .agent-icon ← Emoji (🎯, 📚, etc)
        ├─ .agent-label ← Agent name
        ├─ .agent-status-text ← Status/summary
        └─ .agent-tools-list ← List of tools
           └─ .agent-tool-item (data-tool) ← Tool being run
              └─ .spinner ← Animation

States:
  .agent-row.running → Blue (#2563eb)
  .agent-row.done → Green (#f0fdf4 bg)
  .agent-row.error → Red (#fef2f2 bg)

Collapsed:
  .agent-progress-panel.collapsed
    .agent-panel-body { display: none; }
```

---

## 📡 SSE Event Sequence

```
agents_batch_start
  ├─ agent_start (agent 1)
  │   ├─ agent_tool
  │   └─ agent_tool_done
  │       └─ agent_done (repeat for agent 1's tools)
  │
  ├─ agent_start (agent 2)
  │   ├─ agent_tool
  │   └─ agent_tool_done
  │       └─ agent_done (repeat for agent 2's tools)
  │
  └─ agents_batch_done
       └─ Generate summary & collapse panel
```

---

## 💡 Implementation Highlights

### Summary Line Generation (Lines 460-476)
```javascript
// Collect summaries from each agent row
rows.forEach(row => {
  if (row.classList.contains('done')) {
    summaries.push(`${label}(${status})`);
  } else if (row.classList.contains('error')) {
    summaries.push(`${label}(失败)`);
  }
});

// Join with separator
const summaryText = summaries.join(' · ');

// Final format
`✅ 已完成调研：${summaryText}`
```

### Collapse Mechanism (Lines 1324-1331 CSS)
```css
.agent-progress-panel.collapsed .agent-panel-body {
  display: none;  /* ← Hide body */
}

/* Toggle via JavaScript:
   panel.classList.toggle('collapsed');
*/
```

---

## 🛠️ Common Modifications

### Change Summary Format
**File:** `public/js/chat.js`, line 476
**Current:** `✅ 已完成调研：${summaryText}`
**Modify:** Change prefix or separator

### Change Panel Color
**File:** `public/css/style.css`, line 1293
**Current:** `background: #f8fafc;`
**Modify:** Change color value

### Change Spinner Size
**File:** `public/css/style.css`, lines 1310-1315
**Current:** `width: 13px; height: 13px;`
**Modify:** Change dimensions

### Add Status Text Limit
**File:** `public/js/chat.js`, line 416
**Current:** 60 characters
**Modify:** Change slice(0, 60) number

---

## 📊 Architecture Overview

```
User Message
    ↓
streamChat() opens SSE connection
    ↓
handleSSEEvent() processes each event
    ├─ agents_batch_start → Create panel
    ├─ agent_start → Add agent row
    ├─ agent_tool → Add tool item
    ├─ agent_tool_done → Mark done
    ├─ agent_done → Mark agent done
    ├─ agent_error → Mark error
    └─ agents_batch_done → Generate summary
        ↓
    DOM updates & CSS classes applied
        ↓
    Browser renders agent progress UI
```

---

## ✅ Verification Checklist

When making changes, verify:
- [ ] All 7 SSE event types are handled
- [ ] DOM queries use correct selectors
- [ ] CSS classes match JavaScript classNames
- [ ] Data attributes set correctly
- [ ] Spinner animations still work
- [ ] Collapse/expand toggle functions
- [ ] Summary format correct
- [ ] No console errors

---

## 🔗 Related Files

Files that interact with agent rendering (but don't contain rendering logic):

- `public/index.html` - Contains toolContainer div
- `public/js/itinerary.js` - Updates itinerary panel from SSE events
- `public/css/style.css` - Only lines 1291-1400 are agent-related
- Backend SSE event sender (see agents module)

---

## 📚 Learning Path

1. **Start:** Read AGENT_RENDERING_QUICK_REF.md (5 min)
2. **Understand:** Study AGENT_RENDERING_FLOW.md (10 min)
3. **Deep dive:** Review AGENT_RENDERING_GUIDE.md (20 min)
4. **Reference:** AGENT_RENDERING_GUIDE.md (as needed)

---

## 🎓 Key Concepts

- **SSE (Server-Sent Events):** One-way real-time connection for streaming
- **Event-driven rendering:** UI updates in response to SSE events
- **Data attributes:** Store agent/tool IDs for DOM queries
- **CSS class toggles:** Switch between collapsed/expanded states
- **DOM selectors:** Find elements by class, data attribute, or hierarchy

---

## 💬 Questions & Answers

**Q: Where is agent rendering code?**
A: `public/js/chat.js` lines 226-514 and `public/css/style.css` lines 1291-1400

**Q: How is the summary line built?**
A: In `agents_batch_done` handler (lines 460-476), collects status from each agent row

**Q: Can I customize agent panel styling?**
A: Yes, edit `public/css/style.css` lines 1291-1400

**Q: What events must be handled?**
A: 7 events: agents_batch_start, agent_start, agent_tool, agent_tool_done, agent_done, agent_error, agents_batch_done

**Q: How does collapse/expand work?**
A: Toggle `.collapsed` class which CSS uses to hide `.agent-panel-body` with `display: none`

---

Generated: 2026-04-12
Project: ai-travel-planner
