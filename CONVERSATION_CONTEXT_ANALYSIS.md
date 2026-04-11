# AI Travel Planner: Conversation Context Handling Analysis

**Date:** 2026-04-10  
**Focus:** Understanding how the system tracks user-provided information and why it re-asks confirmed questions

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Data Flow Diagrams](#data-flow-diagrams)
3. [Detailed Code References](#detailed-code-references)
4. [The Re-Ask Problem](#the-re-ask-problem)
5. [TripBook Lifecycle](#tripbook-lifecycle)
6. [Quick Reply Generation Logic](#quick-reply-generation-logic)

---

## System Overview

The system uses **three parallel mechanisms** to track constraints:

### 1. **Message History** (Complete ✅)
- Stores all user messages sent
- **File:** `public/js/chat.js` Line 9
- **Sent every request:** Yes

### 2. **TripBook State** (Structured ✅)
- Stores confirmed vs pending constraints with timestamps
- **File:** `models/trip-book.js` Lines 43-51
- **Persisted via:** `sessionStorage` → restored on each request

### 3. **Quick Reply Chips** (Incomplete ❌)
- Generates clickable options from AI response
- **File:** `server.js` Lines 563-612
- **Problem:** Doesn't check TripBook state

---

## Data Flow Diagrams

### Request Flow: How User Input Becomes System Context

```
USER INPUT                    CLIENT                       SERVER
  │                             │                            │
  ├─ "我想去日本，7天"           │                            │
  │                             ├─ chatHistory.push()        │
  │                             │   (Line 87, chat.js)       │
  │                             │                            │
  │                             ├─ fetch /api/chat           │
  │                             │  {                         │
  │                             │    messages: [...],        │
  │                             │    tripBookSnapshot: {...} │
  │                             │  }                         │
  │                             │                            │
  │                             │ (Line 139, chat.js)        │
  │                             │                            │
  │                             ├──────────────────────────►│
  │                             │ (Received: Line 23)       │
  │                             │                            │
  │                             │ Restore TripBook:         │
  │                             │ - updateConstraints()     │
  │                             │ - updateItinerary()       │
  │                             │ (Lines 96-102)            │
  │                             │                            │
  │                             │ Build system prompt:      │
  │                             │ tripBook.toSystemPrompt() │
  │                             │ (Line 106)                │
  │                             │                            │
  │                             │ Execute AI call           │
  │                             │ with system prompt        │
  │                             │ (Lines 634-710)           │
  │                             │                            │
  │◄──── AI Response Stream ─────┼──────────────────────────┤
  │ "好的，7天日本行程..."        │ (Streamed via SSE)       │
  │                             │                            │
  │ extractQuickReplies()        │ PROBLEM:
  │ → Shows duplicate options    │ Does NOT check if:
  │                             │ destination.confirmed=true
```

### State Persistence: Where TripBook Lives

```
SESSION 1:
  └─ User: "去日本，2人，5天"
  └─ AI: update_trip_info with confirmed: true
  └─ TripBook in memory
  └─ sessionStorage.setItem('tp_tripbook', {...})
         │
         ├─ Persists in browser storage
         │
  └─ (User refreshes or continues...)
         │
SESSION 2 (Same browser):
  └─ Client: sessionStorage.getItem('tp_tripbook')
  └─ Include in POST body: tripBookSnapshot
  └─ Server: tripBook.updateConstraints(snapshot.constraints)
  └─ TripBook state RESTORED ✓
```

---

## Detailed Code References

### A. TripBook Data Structure

**File:** `models/trip-book.js`

```javascript
// Lines 25-62: Constructor
class TripBook {
  constructor(id) {
    this.constraints = {
      destination:      null,  // { value, cities, confirmed, confirmed_at }  [Line 44]
      departCity:       null,  // { value, airports, confirmed, confirmed_at } [Line 45]
      dates:            null,  // { start, end, days, flexible, confirmed }    [Line 46]
      people:           null,  // { count, details, confirmed }                 [Line 47]
      budget:           null,  // { value, per_person, currency, confirmed }   [Line 48]
      preferences:      null,  // { tags, notes, confirmed }                    [Line 49]
      specialRequests: [],    // [{ type, value, confirmed }]                  [Line 50]
      _history: []            // [{ field, from, to, changed_at }]             [Line 51]
    };
    
    this.dynamic = {
      weather: {},          // { "tokyo": { city, temp, description, _meta } } [Line 36]
      exchangeRates: {},    // { "JPY_CNY": { from, to, rate, _meta } }       [Line 37]
      flightQuotes: [],     // Array of flight quotes with status              [Line 38]
      hotelQuotes: []       // Array of hotel quotes with status                [Line 39]
    };
  }
}
```

### B. Constraint Confirmation Tracking

**File:** `models/trip-book.js`, Lines 126-164

```javascript
/**
 * updateConstraints(delta) — Incremental update from AI tool call
 * Key: Automatically timestamps confirmations
 */
updateConstraints(delta) {
  if (!delta) return;
  const now = Date.now();
  const fields = ['destination', 'departCity', 'dates', 'people', 'budget', 'preferences'];

  for (const field of fields) {
    if (delta[field] !== undefined) {
      const newVal = { ...delta[field] };
      
      // AUTO-SET confirmed_at when confirmed=true [Lines 136-138]
      if (newVal.confirmed && !newVal.confirmed_at) {
        newVal.confirmed_at = now;  // ← TIMESTAMP ADDED AUTOMATICALLY
      }
      
      this.constraints[field] = newVal;
    }
  }
}
```

### C. System Prompt Section Generation

**File:** `models/trip-book.js`, Lines 227-277

```javascript
buildConstraintsPromptSection() {
  const c = this.constraints;
  const confirmed = [];  // ← Fields with confirmed: true
  const pending = [];    // ← Fields with confirmed: false

  // Example: destination [Lines 232-237]
  if (c.destination) {
    const cities = c.destination.cities?.length
      ? `（${c.destination.cities.join('·')}）` : '';
    const line = `目的地：${c.destination.value || ''}${cities}`;
    
    // KEY: Separate based on confirmed flag
    (c.destination.confirmed ? confirmed : pending).push(line);  // [Line 236]
  }

  // Build two sections with different markers
  const parts = [];
  if (confirmed.length > 0) {
    // ✅ CONFIRMED (Do NOT re-ask) [Line 271]
    parts.push(`## 用户已确认信息（勿重复询问）\n${confirmed.map(l => `- ${l} ✅`).join('\n')}`);
  }
  if (pending.length > 0) {
    // ❓ PENDING (Still need to ask) [Line 274]
    parts.push(`## 待确认信息\n${pending.map(l => `- ${l} ❓`).join('\n')}`);
  }
  
  return parts.join('\n\n');
}
```

**Example Output:**
```markdown
## 用户已确认信息（勿重复询问）
- 目的地：日本 ✅
- 人数：2人 ✅

## 待确认信息
- 出发城市：❓
```

### D. System Prompt Injection

**File:** `prompts/system-prompt.js`, Lines 138-144

```javascript
function buildSystemPrompt(conversationText = '', knownRates = [], knownWeather = [], tripBook = null) {
  const parts = [];
  
  // ... other sections ...
  
  // TripBook Injection [Lines 138-144]
  if (tripBook) {
    const tripBookSection = tripBook.toSystemPromptSection();
    if (tripBookSection) {
      parts.push('\n---\n' + tripBookSection);  // ← INJECTED HERE
    }
  }
  
  return parts.join('\n\n');
}
```

**Called from:** `server.js` Line 106:
```javascript
const systemPrompt = buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook);
```

### E. TripBook Serialization & Client-Side Storage

**File:** `public/js/chat.js`

#### Saving to SessionStorage (Lines 313-318)
```javascript
case 'tripbook_update':
  if (typeof updateFromTripBook === 'function') updateFromTripBook(data);
  
  // SAVE to sessionStorage [Line 317]
  try { 
    sessionStorage.setItem('tp_tripbook', JSON.stringify(data)); 
  } catch {}
  break;
```

#### Loading from SessionStorage (Lines 147-150)
```javascript
const bodyPayload = {
  messages: chatHistory,
  provider: settings.provider,
  model: settings.model
};

// Restore TripBook snapshot for next request [Lines 148-150]
try {
  const tripBookSnapshot = sessionStorage.getItem('tp_tripbook');
  if (tripBookSnapshot) bodyPayload.tripBookSnapshot = JSON.parse(tripBookSnapshot);
} catch {}
```

### F. Server-Side TripBook Recovery

**File:** `server.js`, Lines 96-102

```javascript
// Restore TripBook from client snapshot
try {
  if (tripBookSnapshot) {
    if (tripBookSnapshot.constraints) {
      tripBook.updateConstraints(tripBookSnapshot.constraints);  // [Line 97]
    }
    if (tripBookSnapshot.itinerary) {
      tripBook.updateItinerary(tripBookSnapshot.itinerary);     // [Line 98]
    }
    if (tripBookSnapshot.knowledgeRefs) {
      for (const ref of tripBookSnapshot.knowledgeRefs) {
        tripBook.addKnowledgeRef(ref);
      }
    }
  }
} catch {}
```

---

## The Re-Ask Problem

### Problem Statement

User confirms a constraint → AI acknowledges it → System shows quick reply chips with the **same question again**

### Root Cause: Quick Reply Generation Lacks TripBook Context

**File:** `server.js`, Lines 563-612

```javascript
function extractQuickReplies(text) {  // ← Note: only receives text!
  if (!text || text.length < 10) return [];
  const questions = [];

  // Layer 1: Pattern Matching [Lines 567-580]
  for (const pattern of QUICK_REPLY_PATTERNS) {
    if (pattern.test.test(text)) {  // ← Matches pattern in AI response
      
      // PROBLEM: NO check like this:
      // if (tripBook?.constraints?.destination?.confirmed) continue;
      
      const q = { text: pattern.text, options: [...pattern.options] };
      questions.push(q);  // ← ALWAYS emits, even if already confirmed!
    }
  }
  
  return questions.slice(0, 5);
}
```

**Function Signature Issue:**
- **Current:** `extractQuickReplies(text)` — receives AI text only
- **Needed:** `extractQuickReplies(text, tripBook)` — receive both text AND state
- **Location of call:** `server.js` Line 119

### Missing Constraint Check

**What SHOULD happen but doesn't:**

```javascript
function extractQuickReplies(text, tripBook) {  // ← Modified signature
  const questions = [];
  
  for (const pattern of QUICK_REPLY_PATTERNS) {
    if (pattern.test.test(text)) {
      
      // NEW: Check constraint state [MISSING IN CURRENT CODE]
      const constraintField = pattern.constraintField; // e.g., "destination"
      if (tripBook?.constraints?.[constraintField]?.confirmed) {
        continue;  // ← SKIP: Already confirmed, don't re-ask
      }
      
      questions.push(q);
    }
  }
  
  return questions;
}
```

### Example Quick Reply Patterns

**File:** `server.js`, Lines 463-556

```javascript
const QUICK_REPLY_PATTERNS = [
  {
    // Pattern 1: Departure City [Lines 464-471]
    test: /(?:从哪.*出发|出发城市|出发地|哪个城市出发)/,
    text: '出发城市？',
    options: ['北京', '上海', '广州', '深圳', '成都', '杭州'],
    allowInput: true,
    inputPlaceholder: '输入其他城市'
    // ← MISSING: constraintField: 'departCity' for state checking
  },
  {
    // Pattern 2: Number of People [Lines 493-497]
    test: /(?:几个人|多少人|几人同行|同行.*人数)/,
    text: '几个人出行？',
    options: ['1人', '2人', '3-4人', '5人以上']
    // ← MISSING: constraintField: 'people'
  },
  {
    // Pattern 3: Budget [Lines 506-512]
    test: /(?:预算.*多少|预算.*范围|大概.*预算)/,
    text: '预算大概多少（每人）？',
    options: ['5000以内', '1万左右', '2万左右', '3万以上'],
    allowInput: true,
    inputPlaceholder: '输入具体预算'
    // ← MISSING: constraintField: 'budget'
  },
  // ... more patterns ...
];
```

### Where Quick Replies Are Emitted

**File:** `server.js`, Lines 118-122

```javascript
// After AI response completes
const quickReplies = extractQuickReplies(fullText);  // ← Line 119: text only!
if (quickReplies.length > 0) {
  sendSSE('quick_replies', { questions: quickReplies });
}
```

**Should be:**
```javascript
const quickReplies = extractQuickReplies(fullText, tripBook);  // ← Add tripBook!
```

---

## TripBook Lifecycle

### Phase 1: Initialization

**Location:** `server.js` Line 51
```javascript
const tripBook = new TripBook();
```

### Phase 2: Population from Client Snapshot

**Location:** `server.js` Lines 96-102
```javascript
if (tripBookSnapshot) {
  if (tripBookSnapshot.constraints) {
    tripBook.updateConstraints(tripBookSnapshot.constraints);
  }
  // ... restore other data ...
}
```

### Phase 3: AI Updates via Tool Call

**Location:** `server.js` Lines 245-259

When AI calls `update_trip_info` tool:

```javascript
// update_trip_info tool result parsing [Lines 246-256]
if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
  const updates = parsed.updates;
  if (updates.constraints) {
    tripBook.updateConstraints(updates.constraints);  // ← CONSTRAINT PERSISTED
  }
  if (updates.phase !== undefined) {
    tripBook.updatePhase(updates.phase);
  }
  if (updates.itinerary) {
    tripBook.updateItinerary(updates.itinerary);
  }
  
  // Notify client of TripBook update [Line 258]
  sendSSE('tripbook_update', tripBook.toPanelData());
}
```

### Phase 4: Export to System Prompt

**Location:** `prompts/system-prompt.js` Lines 138-144

TripBook data injected into system prompt for next AI call:

```javascript
if (tripBook) {
  const tripBookSection = tripBook.toSystemPromptSection();
  if (tripBookSection) {
    parts.push('\n---\n' + tripBookSection);
  }
}
```

### Phase 5: Round-Trip to Client

**Location:** `public/js/chat.js` Line 317

```javascript
sessionStorage.setItem('tp_tripbook', JSON.stringify(data));
```

Sent back on next request (Lines 148-150):
```javascript
const tripBookSnapshot = sessionStorage.getItem('tp_tripbook');
if (tripBookSnapshot) bodyPayload.tripBookSnapshot = JSON.parse(tripBookSnapshot);
```

---

## Quick Reply Generation Logic

### Detection Layers

The system uses **two-tier detection**:

#### Layer 1: Pattern Matching (Lines 567-585)

```javascript
// Scan QUICK_REPLY_PATTERNS against AI response text
for (const pattern of QUICK_REPLY_PATTERNS) {
  if (pattern.test.test(text)) {  // ← Regex test
    questions.push(q);
  }
}

// If Layer 1 found results, use them
if (questions.length > 0) {
  return questions.slice(0, 5);  // ← Limit to 5 groups
}
```

#### Layer 2: Numbered List Detection (Lines 587-610)

```javascript
// Only if Layer 1 found nothing, try to extract from numbered lists
const listPattern = /(?:^|\n)\s*(\d+)\s*[.、）)]\s*(.+)/g;
const items = [];

// Search in last 800 characters
const searchArea = text.slice(-800);
while ((match = listPattern.exec(searchArea)) !== null) {
  const itemText = match[2].replace(/\*\*/g, '').trim();
  if (itemText.length > 0 && itemText.length <= 40) {
    items.push(itemText);
  }
}

// If 2-6 items found with question mark before
if (items.length >= 2 && items.length <= 6) {
  const beforeList = searchArea.slice(0, searchArea.indexOf(items[0]));
  const hasQuestion = /[？?]\s*$/.test(beforeList.trim());
  if (hasQuestion) {
    questions.push({ text: '', options: items });
  }
}
```

### Pattern-to-Constraint Mapping (Should Exist)

**Currently missing:** Direct mapping from pattern to TripBook field

**Should be:**
```javascript
const QUICK_REPLY_PATTERNS = [
  {
    test: /从哪.*出发/,
    text: '出发城市？',
    options: ['北京', '上海', ...],
    constraintField: 'departCity'  // ← For state checking
  },
  {
    test: /几个人/,
    text: '几个人出行？',
    options: ['1人', '2人', ...],
    constraintField: 'people'  // ← For state checking
  },
  // ... etc
];
```

---

## Signal Flow: A Complete Example

```
REQUEST N:
  ┌─ User: "帮我规划日本7天2人旅行，预算2万"
  ├─ chatHistory = [{ role: 'user', content: '...' }]
  ├─ Client: sessionStorage.getItem('tp_tripbook') = null (first request)
  └─ POST /api/chat with messages + no snapshot
    │
    ├─ Server: new TripBook() [Line 51]
    ├─ System prompt built (no TripBook constraints) [Line 106]
    │
    ├─ AI Response: "好的，我来帮你规划日本行程..."
    │   └─ AI calls update_trip_info with:
    │      constraints: {
    │        destination: { value: '日本', confirmed: true },
    │        dates: { days: 7, confirmed: true },
    │        people: { count: 2, confirmed: true },
    │        budget: { value: '2万', confirmed: true }
    │      }
    │
    ├─ Server: tripBook.updateConstraints() [Line 249]
    │   └─ TripBook.constraints now has confirmed fields
    │
    ├─ Server: sendSSE('tripbook_update', tripBook.toPanelData())
    │   └─ Includes: { destination: '日本', days: 7, people: 2, budget: '2万' }
    │
    ├─ Client: sessionStorage.setItem('tp_tripbook', {...})
    │   └─ Persists confirmed state
    │
    ├─ extractQuickReplies(fullText)  ← ONLY receives text
    │   └─ Finds /目的地|日本|确认/ patterns
    │   └─ emits: { text: '目的地？', options: [...] }  ← Even though confirmed!
    │
    └─ User sees: "目的地？ [日本][泰国][新加坡]"  ✓ BUG!

REQUEST N+1:
  ├─ Client: sessionStorage.getItem('tp_tripbook') = {...constraints with confirmed: true}
  ├─ POST /api/chat with messages + snapshot
  │
  ├─ Server: tripBook = new TripBook()
  ├─ Server: tripBook.updateConstraints(snapshot.constraints)  [Line 97]
  │   └─ TripBook now knows: destination.confirmed = true
  │
  ├─ Server: buildSystemPrompt(..., tripBook)
  │   └─ System prompt includes: "## 用户已确认信息（勿重复询问）"
  │   └─ AI sees: "- 目的地：日本 ✅" in prompt
  │
  ├─ AI Response: "继续规划，需要确认出发城市..."
  │
  ├─ extractQuickReplies(fullText)  ← Still NO TripBook param!
  │   └─ Finds /出发城市/ pattern
  │   └─ SHOULD check: tripBook.constraints.departCity.confirmed?
  │   └─ But CAN'T because tripBook not passed!
  │   └─ emits: { text: '出发城市？', options: [...] }  ✓ CORRECT
  │
  └─ User sees: "出发城市？ [北京][上海][...]"  ✓ Correct this time
```

---

## Summary: What Works vs. What Doesn't

| Component | Status | Notes |
|-----------|--------|-------|
| TripBook data model | ✅ Excellent | Clear field structure with confirmed flags |
| Constraint updates (via AI tool) | ✅ Working | AI can mark constraints as confirmed |
| TripBook → System Prompt | ✅ Working | Confirmed constraints appear in prompt |
| Message history tracking | ✅ Complete | All user/assistant messages preserved |
| SessionStorage persistence | ✅ Working | TripBook survives page refresh |
| TripBook recovery on next request | ✅ Working | Snapshot restored and constraints reapplied |
| Quick reply chip generation | ❌ Broken | Doesn't check if constraint already confirmed |
| Quick reply suppression logic | ❌ Missing | No `if (constraint.confirmed) skip` |

---

## Recommendations

### High-Priority Fix: Make Quick Replies Aware of TripBook

**Change required in `/server.js`:**

1. **Modify function signature** (Line 563):
   ```javascript
   function extractQuickReplies(text, tripBook) {  // ← Add tripBook param
   ```

2. **Add constraint suppression** (After Line 568):
   ```javascript
   for (const pattern of QUICK_REPLY_PATTERNS) {
     if (pattern.test.test(text)) {
       
       // NEW: Skip if constraint already confirmed
       if (pattern.constraintField && tripBook?.constraints?.[pattern.constraintField]?.confirmed) {
         continue;  // Don't show quick replies for confirmed fields
       }
       
       questions.push(q);
     }
   }
   ```

3. **Update call site** (Line 119):
   ```javascript
   const quickReplies = extractQuickReplies(fullText, tripBook);  // ← Pass tripBook
   ```

4. **Add constraintField to patterns** (Lines 463-556):
   ```javascript
   const QUICK_REPLY_PATTERNS = [
     {
       test: /从哪.*出发|出发城市/,
       constraintField: 'departCity',  // ← NEW
       text: '出发城市？',
       options: ['北京', '上海', ...]
     },
     // ... for each pattern ...
   ];
   ```

---
