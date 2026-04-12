# Agent Rendering - Quick Reference Card

## 🎯 File Locations

| Component | File | Lines |
|-----------|------|-------|
| **SSE Handlers** | `public/js/chat.js` | 226-514 |
| **CSS Styling** | `public/css/style.css` | 1291-1400 |

---

## 📡 SSE Event Handlers

All in `handleSSEEvent()` function (Line 226):

```
agents_batch_start (337)  → Create panel with header
├─ agent_start (355)      → Create agent row
├─ agent_tool (373)       → Add tool to tools list
├─ agent_tool_done (390)  → Mark tool ✅
├─ agent_done (407)       → Complete agent row
├─ agent_error (431)      → Error state
└─ agents_batch_done (452) → Collapse & summarize
```

---

## 🎨 DOM Structure

### Active State (Expanded)
```html
<div class="agent-progress-panel" data-total="2" data-done="0">
  <div class="agent-panel-header">
    <div class="spinner"></div>
    <span>正在并行调研（0/2 完成）</span>
  </div>
  <div class="agent-panel-body">
    <div class="agent-row running" data-agent="agent_1">
      <span class="agent-icon">🎯</span>
      <span class="agent-label">景点Agent</span>
      <div class="spinner"></div>
      <span class="agent-status-text">web_search 执行中</span>
      <div class="agent-tools-list">
        <div class="agent-tool-item running" data-tool="web_search">
          <div class="spinner"></div>
          <span>web_search</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Collapsed State (Summary)
```html
<div class="agent-progress-panel collapsed">
  <div class="agent-panel-header" onclick="...toggle collapse...">
    <span>✅ 已完成调研：景点Agent(发现10个热门景点) · 百科Agent(xxx)</span>
  </div>
  <div class="agent-panel-body" style="display:none"><!-- hidden --></div>
</div>
```

---

## 📝 Summary Line Format

**Generated in `agents_batch_done` event (Lines 460-476)**

```javascript
summaries = []
for each agent row:
  if done:     summaries.push(`${label}(${status_text})`)
  if error:    summaries.push(`${label}(失败)`)

summaryText = summaries.join(' · ')
// Result: "景点Agent(发现10个热门景点) · 百科Agent(xxx)"

finalHTML = `✅ 已完成调研：${summaryText}`
```

**Fallback** (if no summaries):
```
✅ 已完成调研：${successCount}成功 ${failedCount}失败
```

---

## 🔄 State Transitions

### Agent Row Classes
- `.running` → Blue, with spinner
- `.done` → Green background, checkmark, no spinner
- `.error` → Red background, no spinner

### Panel States
- **expanded**: `.agent-progress-panel` (shows body)
- **collapsed**: `.agent-progress-panel.collapsed` (hides body, shows summary)

---

## 🛠️ Key Functions

| Function | Location | Purpose |
|----------|----------|---------|
| `handleSSEEvent()` | 226 | Main event dispatcher |
| `streamChat()` | 120 | Opens EventSource, calls handleSSEEvent |
| `appendAssistantMessage()` | 999 | Creates message container with toolContainer |
| `groupLabel()` | 690 | Labels for grouped tools |
| `toolLabel()` | 706 | Labels for individual tools |

---

## 💾 Data Attributes Used

| Attribute | Element | Purpose |
|-----------|---------|---------|
| `data-total` | `.agent-progress-panel` | Total agent count |
| `data-done` | `.agent-progress-panel` | Completed agents count |
| `data-agent` | `.agent-row` | Agent ID |
| `data-tool` | `.agent-tool-item` | Tool name |
| `data-group` | `.tool-status` (grouped tools) | Group name |
| `data-label` | `.tool-status` | Original tool label |

---

## ✨ CSS Animations

- `.spinner`: `spin 0.8s linear infinite`
- `.agent-progress-panel`: `fadeIn 0.3s`
- Spinners: 13px (header), 11px (row), 9px (tool item)

---

## 🐛 Error Handling

**Stream end cleanup (Lines 207-216)**
- Marks all `.tool-status.running` as `.done`

**Done event cleanup (Lines 488-512)**
- Collapses any unclosed `.agent-progress-panel:not(.collapsed)`
- Sets fallback message: "✅ 调研完成"

---

## 📌 Important Notes

1. **All agent rendering is in `chat.js`** - no separate agent rendering module
2. **Collapse toggle** - Added via `headerEl.onclick` in `agents_batch_done`
3. **Status text limit** - Agent summary truncated to 60 chars (line 416)
4. **Tool items** - Created dynamically as tools are called, marked done individually
5. **Counter updates** - Panel header updates on every `agent_done` or `agent_error`

