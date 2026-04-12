# Agent Rendering Flow Diagram

## Complete SSE Event Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Backend starts parallel agent execution                         │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
        ┌─────────────────────────────────┐
        │ SSE: agents_batch_start         │ Line 337
        │ data.count = 2                  │
        └─────────────────┬───────────────┘
                          │
         ┌────────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
  ┌─────────────────┐            ┌─────────────────┐
  │ SSE: agent_start│            │ SSE: agent_start│
  │ data.agent      │ Line 355    │ data.agent      │ Line 355
  │ data.label      │            │ data.label      │
  │ data.icon       │            │ data.icon       │
  └────────┬────────┘            └────────┬────────┘
           │                              │
           │ (Agent 1 execution)         │ (Agent 2 execution)
           │                              │
    ┌──────┴──────┐                ┌──────┴──────┐
    │             │                │             │
    ▼             ▼                ▼             ▼
 ┌──────────┐  ┌──────────┐    ┌──────────┐  ┌──────────┐
 │ agent_   │  │ agent_   │    │ agent_   │  │ agent_   │
 │ tool     │  │ tool_    │    │ tool     │  │ tool_    │
 │ Line 373 │  │ done     │    │ Line 373 │  │ done     │
 │          │  │ Line 390 │    │          │  │ Line 390 │
 └──────────┘  └──────────┘    └──────────┘  └──────────┘
    │             │                │             │
    │             └─────────────────┴─────────────┘
    │                                │
    └────────────────┬───────────────┘
                     │
                     ▼
        ┌──────────────────────┐
        │ SSE: agent_done      │
        │ (for each agent)     │ Line 407
        │ data.summary         │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ (repeat for all      │
        │ agents...)           │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ SSE: agents_batch_   │
        │ done                 │ Line 452
        │ data.success = 2     │
        │ data.failed = 0      │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │ COLLAPSE PANEL &     │
        │ GENERATE SUMMARY     │
        │ "✅ 已完成调研:      │
        │  Agent1(xxx)·Agent2  │
        │  (xxx)"              │
        └──────────────────────┘
```

---

## DOM Creation Timeline

### 1. agents_batch_start → Create Panel Container

```javascript
const panel = document.createElement('div');
panel.className = 'agent-progress-panel';
panel.dataset.total = '2';
panel.dataset.done = '0';

const header = document.createElement('div');
header.className = 'agent-panel-header';
header.innerHTML = `<div class="spinner"></div><span>正在并行调研（0/2 完成）</span>`;

const body = document.createElement('div');
body.className = 'agent-panel-body';

panel.appendChild(header);
panel.appendChild(body);
toolContainer.appendChild(panel);
```

**Result DOM:**
```
.agent-progress-panel (data-total=2, data-done=0)
├── .agent-panel-header
│   ├── .spinner (animating)
│   └── <span>正在并行调研（0/2 完成）</span>
└── .agent-panel-body
```

---

### 2. agent_start → Create Agent Row

```javascript
const row = document.createElement('div');
row.className = 'agent-row running';
row.dataset.agent = 'agent_1';
row.innerHTML = `
  <span class="agent-icon">🎯</span>
  <span class="agent-label">景点Agent</span>
  <div class="spinner"></div>
  <span class="agent-status-text">启动中…</span>
`;

const toolsList = document.createElement('div');
toolsList.className = 'agent-tools-list';
row.appendChild(toolsList);

panel.querySelector('.agent-panel-body').appendChild(row);
```

**Result DOM:**
```
.agent-row.running (data-agent=agent_1)
├── .agent-icon "🎯"
├── .agent-label "景点Agent"
├── .spinner (animating, 11px)
├── .agent-status-text "启动中…"
└── .agent-tools-list
    └── (empty, will fill as tools run)
```

---

### 3. agent_tool → Add Tool Item

```javascript
const item = document.createElement('div');
item.className = 'agent-tool-item running';
item.dataset.tool = 'web_search';
item.innerHTML = `<div class="spinner"></div><span>web_search</span>`;

row.querySelector('.agent-tools-list').appendChild(item);
```

**Result DOM:**
```
.agent-tool-item.running (data-tool=web_search)
├── .spinner (animating, 9px)
└── <span>web_search</span>
```

---

### 4. agent_tool_done → Mark Tool Done

```javascript
// Find running tool item
const item = toolsList.querySelector(`.agent-tool-item.running[data-tool="web_search"]`);

// Update to done state
item.className = 'agent-tool-item done';
item.innerHTML = `<span>✅ 查询景点</span>`;
```

**Result DOM:**
```
.agent-tool-item.done
└── <span>✅ 查询景点</span>
```

---

### 5. agent_done → Mark Agent Completed

```javascript
// Find agent row
const row = toolContainer.querySelector(`.agent-row[data-agent="agent_1"]`);

// Update state
row.className = 'agent-row done';
row.querySelector(':scope > .spinner').remove();
row.querySelector('.agent-status-text').textContent = 'agent_1完成了调研';

// Update panel counter
const panel = toolContainer.querySelector('.agent-progress-panel');
panel.dataset.done = '1';
panel.querySelector('.agent-panel-header span').textContent = '正在并行调研（1/2 完成）';
```

**Result DOM:**
```
.agent-row.done (no spinner, green background)
├── .agent-icon "🎯"
├── .agent-label "景点Agent"
├── .agent-status-text "agent_1完成了调研"
└── .agent-tools-list
    └── .agent-tool-item.done "✅ 查询景点"
```

**Panel header:**
```
正在并行调研（1/2 完成）
```

---

### 6. agents_batch_done → Collapse & Summarize

```javascript
// Change panel class to collapsed
panel.className = 'agent-progress-panel collapsed';

// Extract summaries from all rows
const rows = panel.querySelectorAll('.agent-row');
const summaries = [];
rows.forEach(row => {
  const label = row.querySelector('.agent-label')?.textContent;
  const status = row.querySelector('.agent-status-text')?.textContent;
  if (row.classList.contains('done')) {
    summaries.push(`${label}(${status})`);
  } else if (row.classList.contains('error')) {
    summaries.push(`${label}(失败)`);
  }
});

// Build summary text
const summaryText = summaries.join(' · ');
// Result: "景点Agent(agent_1完成了调研) · 百科Agent(agent_2完成了调研)"

// Update header
const headerEl = panel.querySelector('.agent-panel-header');
headerEl.innerHTML = `<span>✅ 已完成调研：${summaryText}</span>`;
headerEl.style.cursor = 'pointer';
headerEl.onclick = () => panel.classList.toggle('collapsed');
```

**Result DOM (Collapsed):**
```
.agent-progress-panel.collapsed
├── .agent-panel-header (clickable)
│   └── <span>✅ 已完成调研：景点Agent(agent_1完成了调研) · 百科Agent(xxx)</span>
└── .agent-panel-body (display: none by CSS)
    └── (all agent rows hidden)
```

---

## CSS State Management

### Panel Visibility

**Expanded state:**
```css
.agent-progress-panel {
  /* visible */
}
.agent-progress-panel .agent-panel-body {
  display: flex;  /* ← visible */
}
```

**Collapsed state:**
```css
.agent-progress-panel.collapsed {
  /* still visible */
}
.agent-progress-panel.collapsed .agent-panel-body {
  display: none;  /* ← hidden */
}
```

---

### Row Color Coding

```
running:  .agent-row.running       → color: #2563eb (blue)
done:     .agent-row.done          → color: green, bg: #f0fdf4 (light green)
error:    .agent-row.error         → color: #dc2626 (red), bg: #fef2f2 (light red)
```

---

## Full Code Locations

| Step | Event | Lines | DOM Change |
|------|-------|-------|-----------|
| 1 | `agents_batch_start` | 337-352 | Creates `.agent-progress-panel` with header |
| 2 | `agent_start` | 355-371 | Appends `.agent-row.running` to body |
| 3 | `agent_tool` | 373-388 | Adds `.agent-tool-item.running` to tools list |
| 4 | `agent_tool_done` | 390-405 | Changes to `.agent-tool-item.done` |
| 5 | `agent_done` | 407-429 | Changes row to `.agent-row.done`, updates counter |
| 6 | `agent_error` | 431-450 | Changes row to `.agent-row.error`, updates counter |
| 7 | `agents_batch_done` | 452-482 | Adds `.collapsed` class, summarizes in header |

---

## Query Selectors Used

```javascript
// Find panel
toolContainer.querySelector('.agent-progress-panel')

// Find header
panel.querySelector('.agent-panel-header')

// Find body
panel.querySelector('.agent-panel-body')

// Find specific agent row
toolContainer.querySelector(`.agent-row[data-agent="${agent}"]`)

// Find all rows
panel.querySelectorAll('.agent-row')

// Find tools list in row
row.querySelector('.agent-tools-list')

// Find tool item in tools list
toolsList.querySelector(`.agent-tool-item[data-tool="${tool}"]`)

// Find status text
row.querySelector('.agent-status-text')

// Find spinner in header
headerEl.querySelector('.spinner')
```

