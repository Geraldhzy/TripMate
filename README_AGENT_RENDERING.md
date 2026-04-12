# Agent Rendering System - Complete Reference

> **Last Updated:** 2026-04-12  
> **Project:** AI Travel Planner  
> **Focus:** Frontend agent progress and results rendering

## 📋 Table of Contents
1. [Quick Answer](#quick-answer)
2. [File Locations](#file-locations)
3. [SSE Event Handlers](#sse-event-handlers)
4. [Summary Line Generation](#summary-line-generation)
5. [DOM Structure](#dom-structure)
6. [CSS Styling](#css-styling)
7. [Query Reference](#query-reference)
8. [Documentation Files](#documentation-files)

---

## Quick Answer

### 1. SSE Event Handlers - Where Found?
**File:** `/Users/geraldhuang/DEV/ai-travel-planner/public/js/chat.js`  
**Function:** `handleSSEEvent()` at **line 226**  
**Range:** Lines **226-514**

| Event | Lines | Purpose |
|-------|-------|---------|
| `agents_batch_start` | 337-352 | Create main progress panel |
| `agent_start` | 355-371 | Add agent row to panel |
| `agent_tool` | 373-388 | Add tool item to agent's tools list |
| `agent_tool_done` | 390-405 | Mark tool as complete |
| `agent_done` | 407-429 | Mark agent as complete |
| `agent_error` | 431-450 | Mark agent as errored |
| `agents_batch_done` | **452-482** | **⭐ Generate summary line** |

### 2. Summary Line Generation - How Works?
**Location:** Lines **460-476** in `agents_batch_done` handler

```javascript
// Algorithm:
const rows = panel.querySelectorAll('.agent-row');
const summaries = [];
rows.forEach(row => {
  const label = row.querySelector('.agent-label')?.textContent;
  const status = row.querySelector('.agent-status-text')?.textContent;
  if (row.classList.contains('done')) {
    summaries.push(`${label}(${status})`);  // "景点Agent(发现10个景点)"
  } else if (row.classList.contains('error')) {
    summaries.push(`${label}(失败)`);       // "百科Agent(失败)"
  }
});

const summaryText = summaries.join(' · ');  // Join with separator
// Result: "✅ 已完成调研：景点Agent(发现10个景点) · 百科Agent(查询3本书)"
```

**Format:** `✅ 已完成调研：${Agent1Label}(${Agent1Status}) · ${Agent2Label}(${Agent2Status})`

### 3. DOM Manipulation - Where Is It?
**File:** `/Users/geraldhuang/DEV/ai-travel-planner/public/js/chat.js`

All DOM manipulation happens through:
- **DOM Creation:** Lines 337-388 (create elements)
- **DOM Updates:** Lines 390-482 (update state via class/content changes)
- **CSS Toggles:** Via `.classList.add/remove/toggle`
- **Data Attributes:** For element queries

**Key Structure Created:**
```
.agent-progress-panel (container)
├─ .agent-panel-header (title bar)
├─ .agent-panel-body (rows container)
│  ├─ .agent-row (agent status)
│  │  ├─ .agent-icon (emoji)
│  │  ├─ .agent-label (name)
│  │  ├─ .agent-status-text (summary)
│  │  └─ .agent-tools-list
│  │     └─ .agent-tool-item (tool status)
```

---

## File Locations

### Main Implementation Files
| File | Lines | Content |
|------|-------|---------|
| `public/js/chat.js` | 226-514 | All SSE handlers + DOM manipulation |
| `public/js/chat.js` | 120 | `streamChat()` - opens SSE connection |
| `public/js/chat.js` | 999 | `appendAssistantMessage()` - creates toolContainer |
| `public/css/style.css` | 1291-1400 | All agent panel CSS |

### Documentation Files (Created)
| File | Purpose |
|------|---------|
| `AGENT_RENDERING_INDEX.md` | Navigation by task (START HERE) |
| `AGENT_RENDERING_QUICK_REF.md` | Quick lookup reference |
| `AGENT_RENDERING_GUIDE.md` | Full technical details |
| `AGENT_RENDERING_FLOW.md` | Visual diagrams & flows |

---

## SSE Event Handlers

### Event: agents_batch_start (Lines 337-352)
**Triggered:** When backend starts parallel agent execution  
**Input:** `data.count` (number of agents)  
**Action:**
```javascript
const panel = document.createElement('div');
panel.className = 'agent-progress-panel';
panel.dataset.total = data.count;
panel.dataset.done = '0';

const header = document.createElement('div');
header.className = 'agent-panel-header';
header.innerHTML = `<div class="spinner"></div><span>正在并行调研（0/${data.count} 完成）</span>`;

const body = document.createElement('div');
body.className = 'agent-panel-body';

panel.appendChild(header);
panel.appendChild(body);
toolContainer.appendChild(panel);
```

### Event: agent_start (Lines 355-371)
**Triggered:** When individual agent starts  
**Input:** `data.agent` (ID), `data.label` (name), `data.icon` (emoji)  
**Action:** Creates `.agent-row` with icon, label, spinner, status text, tools list

### Event: agent_tool (Lines 373-388)
**Triggered:** When agent calls a tool  
**Input:** `data.agent`, `data.tool`  
**Action:** 
- Updates `.agent-status-text` with "tool_name 执行中"
- Adds `.agent-tool-item` to tools list with spinner

### Event: agent_tool_done (Lines 390-405)
**Triggered:** When tool completes  
**Input:** `data.agent`, `data.tool`, `data.label`  
**Action:** Updates `.agent-tool-item` class to `.done` and shows "✅ label"

### Event: agent_done (Lines 407-429)
**Triggered:** When agent completes all tools  
**Input:** `data.agent`, `data.summary`  
**Action:**
- Changes `.agent-row` class to `.done` (green)
- Removes spinner
- Updates status text with summary (max 60 chars)
- Updates panel header counter

### Event: agent_error (Lines 431-450)
**Triggered:** When agent fails  
**Input:** `data.agent`, `data.error`  
**Action:**
- Changes `.agent-row` class to `.error` (red)
- Updates status text with error message
- Updates counter

### Event: agents_batch_done (Lines 452-482) ⭐
**Triggered:** When all agents complete  
**Input:** `data.success`, `data.failed`  
**Action:** **GENERATES SUMMARY LINE** (see below)

---

## Summary Line Generation

**Location:** Lines 460-476 in `agents_batch_done` handler

### Algorithm
```javascript
// 1. Query all agent rows
const rows = panel.querySelectorAll('.agent-row');

// 2. Build summaries array
const summaries = [];
rows.forEach(row => {
  const label = row.querySelector('.agent-label')?.textContent || row.dataset.agent;
  const status = row.querySelector('.agent-status-text')?.textContent || '';
  
  if (row.classList.contains('done')) {
    summaries.push(`${label}(${status})`);  // Done agent
  } else if (row.classList.contains('error')) {
    summaries.push(`${label}(失败)`);       // Failed agent
  }
});

// 3. Join with separator
const summaryText = summaries.join(' · ');

// 4. Format final output
const finalHTML = `✅ 已完成调研：${summaryText || `${successCount}成功 ${failedCount}失败`}`;
```

### Output Examples

**Success case (all agents done):**
```
✅ 已完成调研：景点Agent(发现了10个热门景点) · 百科Agent(查询到3本参考书籍)
```

**Mixed case (some done, some error):**
```
✅ 已完成调研：景点Agent(发现了10个景点) · 百科Agent(失败)
```

**No summaries (all failed):**
```
✅ 已完成调研：0成功 2失败
```

### Key Points
- Status text extracted from `.agent-status-text` element
- Label extracted from `.agent-label` element
- Separator is ` · ` (space-dot-space)
- Failed agents show "(失败)" regardless of their status text
- Fallback to success/failed count if no individual summaries

---

## DOM Structure

### Full Hierarchy
```
.agent-progress-panel
  ├─ .agent-panel-header (height: auto, flex)
  │  ├─ .spinner (13px, animating)
  │  └─ <span>正在并行调研（0/N 完成）</span>
  │
  └─ .agent-panel-body (flex-column)
     ├─ .agent-row.running (data-agent="agent_1")
     │  ├─ .agent-icon "🎯"
     │  ├─ .agent-label "景点Agent"
     │  ├─ .spinner (11px, animating)
     │  ├─ .agent-status-text "启动中…"
     │  └─ .agent-tools-list
     │     ├─ .agent-tool-item.running (data-tool="web_search")
     │     │  ├─ .spinner (9px)
     │     │  └─ <span>web_search</span>
     │     └─ .agent-tool-item.done
     │        └─ <span>✅ 查询景点</span>
     │
     └─ .agent-row.done (green background)
        ├─ .agent-icon "📚"
        ├─ .agent-label "百科Agent"
        ├─ .agent-status-text "查询到3本书"
        └─ .agent-tools-list
           └─ .agent-tool-item.done "✅ web_search"
```

### Collapsed State
```
.agent-progress-panel.collapsed
  ├─ .agent-panel-header (clickable)
  │  └─ <span>✅ 已完成调研：景点Agent(...)·百科Agent(...)</span>
  │
  └─ .agent-panel-body (display: none by CSS)
```

---

## CSS Styling

### File: `public/css/style.css`, Lines 1291-1400

#### Main Container
```css
.agent-progress-panel {
  background: #f8fafc;           /* Light gray */
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 16px;
  animation: fadeIn .3s;
  max-width: 420px;
}
```

#### Header (Title Bar)
```css
.agent-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  padding-bottom: 8px;
  border-bottom: 1px solid #e2e8f0;
}

.agent-panel-header .spinner {
  width: 13px;
  height: 13px;
  border: 2px solid #3b82f6;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin .8s linear infinite;
}
```

#### Body (Rows Container)
```css
.agent-panel-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-progress-panel.collapsed .agent-panel-body {
  display: none;  /* ← COLLAPSE TOGGLE */
}
```

#### Agent Row
```css
.agent-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  padding: 8px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.agent-row.running {
  color: #2563eb;  /* Blue */
}

.agent-row.done {
  color: #16a34a;  /* Green */
  border-color: #a7f3d0;
  background: #f0fdf4;
}

.agent-row.error {
  color: #dc2626;  /* Red */
  border-color: #fecaca;
  background: #fef2f2;
}

.agent-row .spinner {
  width: 11px;
  height: 11px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  animation: spin .8s linear infinite;
}
```

#### Tool Items
```css
.agent-tool-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: #64748b;
}

.agent-tool-item.running {
  color: #2563eb;  /* Blue */
}

.agent-tool-item.done {
  color: #16a34a;  /* Green */
}

.agent-tool-item .spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid currentColor;
  border-top-color: transparent;
  animation: spin .8s linear infinite;
}
```

#### Collapsed State
```css
.agent-progress-panel.collapsed .agent-panel-header {
  padding-bottom: 0;
  color: var(--success);  /* Green */
  cursor: pointer;
  border-bottom: none;
}
```

---

## Query Reference

### Finding Elements
```javascript
// Main panel
const panel = toolContainer.querySelector('.agent-progress-panel');

// Header
const header = panel.querySelector('.agent-panel-header');

// Body
const body = panel.querySelector('.agent-panel-body');

// Specific agent row
const row = toolContainer.querySelector(`.agent-row[data-agent="${agentId}"]`);

// All rows
const rows = panel.querySelectorAll('.agent-row');

// Tools list in row
const toolsList = row.querySelector('.agent-tools-list');

// Specific tool item
const toolItem = toolsList.querySelector(`.agent-tool-item[data-tool="${toolName}"]`);

// Status elements
const statusText = row.querySelector('.agent-status-text');
const label = row.querySelector('.agent-label');
const icon = row.querySelector('.agent-icon');

// Spinners
const spinner = header.querySelector('.spinner');
const rowSpinner = row.querySelector(':scope > .spinner');
```

### DOM Manipulation
```javascript
// Add class
row.classList.add('done');

// Remove class
row.classList.remove('running');

// Toggle class
panel.classList.toggle('collapsed');

// Check class
if (row.classList.contains('done')) { }

// Update text
statusText.textContent = 'new text';

// Update HTML
header.innerHTML = `<span>new html</span>`;

// Create element
const div = document.createElement('div');
div.className = 'agent-row running';
div.dataset.agent = 'agent_1';
div.innerHTML = '...';

// Append
container.appendChild(div);

// Remove
spinner.remove();
```

---

## Documentation Files

### 1. AGENT_RENDERING_INDEX.md (8.7K)
**Navigation guide** - Start here to find what you need
- Task-based quick links
- File summary table
- Key code locations
- Q&A section

### 2. AGENT_RENDERING_QUICK_REF.md (4.3K)
**Quick reference card** - For quick lookups
- SSE event tree
- DOM structure examples
- Key functions
- Data attributes
- CSS animations
- Common modifications

### 3. AGENT_RENDERING_GUIDE.md (10K)
**Full technical reference** - For detailed understanding
- All event handlers with code
- Complete DOM structures
- CSS styling details
- Data flow example
- Error handling
- Query selectors

### 4. AGENT_RENDERING_FLOW.md (11K)
**Visual diagrams** - For visual learners
- ASCII event flow diagram
- DOM creation timeline (6 steps)
- Code for each step
- CSS state management
- Query selector examples

---

## Key Takeaways

✅ **Centralized:** All agent rendering in ONE file (`chat.js`, lines 226-514)  
✅ **No modules:** No separate agent rendering module  
✅ **Summary:** Built in `agents_batch_done` handler (lines 460-476)  
✅ **DOM:** Created dynamically with `createElement()` and `appendChild()`  
✅ **Styling:** CSS classes toggled for state changes (running/done/error)  
✅ **Collapse:** CSS class toggle hides body with `display: none`  
✅ **Query:** Elements found via class selectors and data attributes  

---

## Quick Start

### I need to find SSE handlers
→ `public/js/chat.js`, lines 226-514

### I need to modify summary format
→ `public/js/chat.js`, line 476 (change `✅ 已完成调研：`)

### I need to change colors
→ `public/css/style.css`, lines 1292-1362 (background colors)

### I need to understand the flow
→ Read `AGENT_RENDERING_FLOW.md` (ASCII diagrams)

### I need quick reference
→ Read `AGENT_RENDERING_QUICK_REF.md` (2-minute read)

---

Generated: 2026-04-12  
Project: /Users/geraldhuang/DEV/ai-travel-planner

