# Quick Reference: AI Travel Planner Context & Re-Ask Problem

## TL;DR

**Problem:** Users see quick reply chips asking for information they already provided.

**Root Cause:** `extractQuickReplies()` doesn't check if constraints are already confirmed in TripBook.

**Fix Location:** `/server.js` Line 563 and Line 119

---

## The Three-Layer Context System

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: MESSAGE HISTORY (✅ Complete)              │
│ File: public/js/chat.js:9                           │
│ Stores: All user + assistant messages               │
│ Updates: On every user input and AI response        │
│ Sent to server: YES (on every request)              │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Layer 2: TRIPBOOK STATE (✅ Well-designed)          │
│ File: models/trip-book.js:43-51                     │
│ Stores: { destination, departCity, dates, ... }    │
│ Tracks: confirmed flag + timestamp per field       │
│ Persisted via: sessionStorage (Line 317, chat.js)  │
│ Sent to server: YES (in request body, Lines 148)   │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Layer 3: SYSTEM PROMPT (✅ Injection working)       │
│ File: prompts/system-prompt.js:138-144             │
│ Builds: "## 用户已确认信息（勿重复询问）" section  │
│ Shows AI: Which fields are confirmed                │
│ Updates: Fresh on every request                    │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│ Layer 4: QUICK REPLIES (❌ BROKEN)                  │
│ File: server.js:563-612                            │
│ Problem: Doesn't receive TripBook instance!        │
│ Result: Shows chip for confirmed fields            │
│ Should check: tripBook?.constraints?.[field]?.confirmed
└─────────────────────────────────────────────────────┘
```

---

## Key Data Structures

### TripBook.constraints (What's tracking)
```javascript
{
  destination: {
    value: "日本",           // What user said
    cities: ["东京", "京都"],  // Extracted cities (optional)
    confirmed: true,          // ✅ HAS BEEN CONFIRMED?
    confirmed_at: 1712800000, // When confirmed
  },
  departCity: {
    value: "北京",
    confirmed: true,
  },
  dates: {
    start: "2026-05-01",
    end: "2026-05-07",
    days: 7,
    flexible: false,
    confirmed: true,
  },
  people: {
    count: 2,
    details: "2个成人",
    confirmed: true,
  },
  budget: {
    value: "2万",
    per_person: false,
    currency: "CNY",
    confirmed: true,
  },
  preferences: {
    tags: ["美食", "文化"],
    confirmed: false,  // ❓ NOT YET CONFIRMED
  }
}
```

### QUICK_REPLY_PATTERNS (What needs updating)

**Current (Broken):**
```javascript
{
  test: /从哪.*出发|出发城市/,
  text: '出发城市？',
  options: ['北京', '上海', '广州', ...],
  allowInput: true
  // ❌ Missing: constraintField: 'departCity'
}
```

**Should be:**
```javascript
{
  test: /从哪.*出发|出发城市/,
  text: '出发城市？',
  options: ['北京', '上海', '广州', ...],
  allowInput: true,
  constraintField: 'departCity'  // ← ADD THIS
}
```

---

## Call Stack: How Re-Ask Happens

```
1. User says: "我想去日本，7天"
   ↓
2. Client: chatHistory.push({role: 'user', content: '...'})
   ↓
3. Client: fetch /api/chat with {messages: [...], tripBookSnapshot: null}
   ↓
4. Server: new TripBook()
   ↓
5. Server: buildSystemPrompt(text, rates, weather, tripBook)
   ↓
6. AI: Reads system prompt (no confirmed constraints yet)
   ↓
7. AI: "好的，我来规划你的日本之旅..."
   ↓
8. AI: Calls update_trip_info with:
      constraints: {
        destination: {value: "日本", confirmed: true},
        dates: {days: 7, confirmed: true},
        people: {count: 1, confirmed: false}  ← If not explicitly in user msg
      }
   ↓
9. Server: tripBook.updateConstraints(updates.constraints)
   ↓
10. Server: sendSSE('tripbook_update', tripBook.toPanelData())
    ↓
11. Client: sessionStorage.setItem('tp_tripbook', data)
    ↓
12. Server: extractQuickReplies(fullText)  ← ❌ ONLY receives fullText!
    ↓
    Pattern /日本/ or /目的地/ matches AI response text
    ↓
    ❌ NO CHECK: if (tripBook.constraints.destination.confirmed) skip
    ↓
    Emits: { text: '目的地？', options: ['日本', '泰国', ...] }
    ↓
13. Client: Shows "目的地？ [日本][泰国]..." ← USER SEES DUPLICATE!
```

---

## Code Locations (Cheat Sheet)

| What | File | Line | Purpose |
|------|------|------|---------|
| TripBook class | `models/trip-book.js` | 25 | Data structure for all constraints |
| constraints field | `models/trip-book.js` | 43-51 | Holds confirmed/pending state |
| updateConstraints() | `models/trip-book.js` | 126 | Update method with confirmation logic |
| buildConstraintsPromptSection() | `models/trip-book.js` | 227 | Builds "confirmed" vs "pending" sections |
| toSystemPromptSection() | `models/trip-book.js` | 358 | Full TripBook section for system prompt |
| buildSystemPrompt() | `prompts/system-prompt.js` | 11 | Assembles full system prompt with TripBook |
| TripBook injection | `prompts/system-prompt.js` | 138 | Where TripBook gets injected |
| extractQuickReplies() | `server.js` | 563 | ❌ PROBLEM: Generates chips without TripBook |
| extractQuickReplies() call | `server.js` | 119 | ❌ WHERE FIX NEEDED: Pass tripBook here |
| QUICK_REPLY_PATTERNS | `server.js` | 463 | Pattern definitions (need constraintField added) |
| saveRates | `public/js/chat.js` | 317 | Save TripBook to sessionStorage |
| loadRates | `public/js/chat.js` | 148 | Load TripBook from sessionStorage |
| tripBook recovery | `server.js` | 96 | Restore TripBook from client snapshot |
| update_trip_info handler | `server.js` | 246 | Where AI tool results write to TripBook |

---

## The Fix (3 Changes)

### Change 1: Function Signature (Line 563)
```diff
- function extractQuickReplies(text) {
+ function extractQuickReplies(text, tripBook) {
```

### Change 2: Add Constraint Check (After Line 568)
```diff
  for (const pattern of QUICK_REPLY_PATTERNS) {
    if (pattern.test.test(text)) {
+     // Skip if constraint already confirmed
+     if (pattern.constraintField && tripBook?.constraints?.[pattern.constraintField]?.confirmed) {
+       continue;
+     }
      const q = { text: pattern.text, options: [...pattern.options] };
      questions.push(q);
    }
  }
```

### Change 3: Pass TripBook at Call Site (Line 119)
```diff
- const quickReplies = extractQuickReplies(fullText);
+ const quickReplies = extractQuickReplies(fullText, tripBook);
```

### Change 4: Add constraintField to Patterns (Lines 463-556)
```diff
  {
    test: /(?:从哪.*出发|出发城市|出发地)/,
    text: '出发城市？',
    options: ['北京', '上海', '广州', ...],
+   constraintField: 'departCity',
    allowInput: true
  },
  {
    test: /(?:几个人|多少人)/,
    text: '几个人出行？',
    options: ['1人', '2人', ...],
+   constraintField: 'people'
  },
  {
    test: /(?:预算.*多少|预算.*范围)/,
    text: '预算大概多少？',
    options: ['5000', '1万', ...],
+   constraintField: 'budget',
    allowInput: true
  },
  // ... add for all patterns ...
```

---

## Test Case: Verify Fix Works

**Step 1: Setup**
- Open app, clear sessionStorage
- Type: "帮我规划一个5天的日本之旅，预算1万"

**Expected WITHOUT Fix:**
```
AI Response: "好的，确认你要去日本..."
Quick Replies shown:
  □ 目的地？ [日本][泰国]... ← BUG! Already said Japan
  □ 几个人出行？ [1人][2人]... ← Correct (not mentioned)
```

**Expected WITH Fix:**
```
AI Response: "好的，确认你要去日本..."
Quick Replies shown:
  □ 几个人出行？ [1人][2人]... ← Only this (destination not asked)
```

---

## System Prompt Injection (How It Should Work)

```markdown
# 行程参考书

## 已缓存动态数据
### 已缓存天气（勿重复调用 get_weather）
- 东京: 当前 20°C，晴朗（5分钟前查询，175分钟后过期）

## 用户已确认信息（勿重复询问）
- 目的地：日本 ✅
- 日期：2026-05-01 ~ 2026-05-07（5天）✅
- 预算：1万（总预算）✅

## 待确认信息
- 出发城市：❓
- 人数：❓
- 偏好：❓

## 当前行程进度
阶段 1/7: 锁定约束
```

**Key:** AI reads "目的地：日本 ✅" in system prompt, so knows it's confirmed.

---

## Why It's Currently Broken (Mental Model)

```
                     ┌──────────────────┐
                     │  TripBook State  │
                     │ {destination: {  │
                     │   confirmed: T   │
                     │ }}               │
                     └────────┬─────────┘
                              │
                    System Prompt: ✅ USES IT
                    "目的地：日本 ✅"
                              │
                         AI reads it ✓
                              │
                    AI response: "好的，日本..."
                              │
                    Quick Replies: ❌ IGNORES IT
                    Pattern /日本/ matches
                    "目的地？" shown anyway
                              │
                    USER CONFUSION 😞
```

---

## Files That DON'T Need Changes

✅ `models/trip-book.js` — Structure is perfect
✅ `prompts/system-prompt.js` — Injection is perfect
✅ `public/js/chat.js` — Client handling is perfect
✅ `tools/update-trip-info.js` — Tool is perfect

**Only:** `/server.js` needs the 4 small changes above

---

## Constraint Field Mapping

When adding `constraintField` to patterns, use:

```javascript
// Pattern → TripBook Field Mapping
/从哪.*出发|出发城市/         → 'departCity'
/几个人|多少人/               → 'people'
/日期.*弹性|日期.*灵活/       → 'dates'
/预算.*多少|预算.*范围/       → 'budget'
/旅行.*风格|偏好.*类型/       → 'preferences'
/老人.*儿童|特殊需求/         → 'specialRequests' (note: array!)
```

---

## Debugging: How to Verify

Add logs in `server.js`:

```javascript
function extractQuickReplies(text, tripBook) {
  console.log('extractQuickReplies called');
  console.log('tripBook.constraints:', tripBook?.constraints);
  
  for (const pattern of QUICK_REPLY_PATTERNS) {
    if (pattern.test.test(text)) {
      const constraintField = pattern.constraintField;
      const isConfirmed = tripBook?.constraints?.[constraintField]?.confirmed;
      console.log(`Pattern matched: ${constraintField}, Confirmed: ${isConfirmed}`);
      
      if (isConfirmed) {
        console.log(`Skipping ${constraintField} (already confirmed)`);
        continue;
      }
      
      // Add to questions
    }
  }
}
```

---

## Related Issues

**Fallback Extraction** (Not the root cause, but related):
- File: `server.js` Line 274-456
- Function: `extractItineraryInfo()` and `postProcessTripBook()`
- Issue: Regex extraction doesn't set `confirmed: true`, only `confirmed: false`
- Why: When AI doesn't call `update_trip_info`, regex tries to salvage the info
- Not critical because: AI should always call `update_trip_info` for confirmed constraints

---

## Performance Notes

- Adding `constraintField` to patterns: **No cost** (just metadata)
- Checking `tripBook?.constraints?.[field]?.confirmed`: **Negligible cost** (O(1) lookup)
- New patterns to avoid: **Low overhead** (continue statement)
- No database queries or API calls needed

---

## Edge Cases Handled by Fix

1. **Partially confirmed constraints:**
   - User says "日本，3人" but not budget
   - TripBook: destination=confirmed, people=confirmed, budget=pending
   - Result: Only shows quick reply for budget ✓

2. **Updated constraints:**
   - User changes mind: "其实改成2人"
   - TripBook: people.value updated, but still confirmed=true
   - Result: Quick reply doesn't ask for people again ✓

3. **Missing TripBook (first request):**
   - tripBook is empty object {}
   - `tripBook?.constraints?.field?.confirmed` → undefined (falsy)
   - Result: Pattern shows (correct, hasn't been confirmed yet) ✓

---

## Rollout Plan

1. Add `constraintField` to 10-12 patterns (main constraints)
2. Modify `extractQuickReplies()` function signature
3. Add constraint check in loop
4. Pass `tripBook` at call site
5. Test with example: "帮我规划7天日本..." 
6. Verify: Quick replies don't ask for destination on next turn
7. Deploy

---
