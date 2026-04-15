# Travel Itinerary App - Activity Duplication Bug Investigation Report

**Date:** 2026-04-15  
**Issue:** When AI adds a new activity to an existing day's itinerary, some original activities are duplicated/appended at the end of the day.

---

## Executive Summary

The bug is **NOT in the core data model or merge logic** itself—these are well-designed and thoroughly tested. Instead, the issue likely stems from:

1. **Streaming/incremental update problems** in how the AI response is constructed
2. **Incomplete segment data in AI responses** causing deduplication logic to fail
3. **Frontend state synchronization issues** with multiple `tripbook_update` events

---

## 1. Data Model Structure (Layer 3: Itinerary)

### Location
**File:** `/models/trip-book.js` (Lines 44-50, 142-196)

### Structure
```javascript
this.itinerary = {
  phase: 0,
  phaseLabel: '',
  route: [],              // ["东京", "京都", "大阪"]
  days: [],               // Array of day objects
  budgetSummary: null,    // Budget breakdown
};

// Each day object:
{
  day: 1,                 // Day number
  date: "2026-05-01",     // Date string
  city: "Tokyo",          // City name
  title: "抵达东京",      // Day title
  segments: [             // Activities/events array
    {
      time: "14:00",              // Time (HH:MM format)
      title: "抵达机场",          // Activity name
      type: "flight",             // Type: flight, hotel, meal, attraction, activity, transport
      location: "成田机场",       // Location
      duration: "",               // Duration
      transport: "",              // Transport info
      transportTime: "",          // Transport time
      notes: ""                   // Additional notes
    }
  ]
}
```

---

## 2. Itinerary Merge Logic (Core of the Bug)

### Location
**File:** `/models/trip-book.js` Lines 142-196 - `updateItinerary()` method

### Current Logic

```javascript
updateItinerary(delta) {
  if (Array.isArray(delta.days)) {
    for (const newDay of delta.days) {
      const idx = this.itinerary.days.findIndex(d => d.day === newDay.day);
      
      if (idx >= 0) {
        // EXISTING DAY: Merge logic
        const existing = this.itinerary.days[idx];
        const merged = { ...existing, ...newDay };

        // CRITICAL LOGIC: Segment merging
        if (!newDay.segments || newDay.segments.length === 0) {
          // Case 1: No new segments provided → Keep existing
          merged.segments = existing.segments || [];
        } else if (newDay._replace) {
          // Case 2: _replace flag set → Full replacement
          merged.segments = newDay.segments;
        } else if (existing.segments?.length > 0) {
          // Case 3: MERGE MODE (Default for adding activities)
          // Uses time+title as deduplication key
          const existingMap = new Map();
          for (const seg of existing.segments) {
            const key = `${seg.time || ''}|${seg.title || seg.activity || ''}`;
            existingMap.set(key, seg);
          }
          for (const seg of newDay.segments) {
            const key = `${seg.time || ''}|${seg.title || seg.activity || ''}`;
            existingMap.set(key, { ...(existingMap.get(key) || {}), ...seg });
          }
          merged.segments = Array.from(existingMap.values())
            .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        }
        
        this.itinerary.days[idx] = merged;
      } else {
        // NEW DAY: Just add it
        this.itinerary.days.push(newDay);
      }
    }
  }
}
```

### How the Merge Works

**Deduplication Key:** `${time || ''}|${title || activity || ''}`

- Uses Map to track unique segments by `time + title` combination
- When a new segment with the same time+title arrives, it **merges** (spreads) the data instead of adding a new entry
- **Sorting:** Segments are sorted by time after merge

**Example:**
```javascript
// Existing segments on Day 1
[
  { time: "09:00", title: "浅草寺", type: "attraction" },
  { time: "12:00", title: "午餐", type: "meal" }
]

// AI sends update with new activity
[
  { time: "15:00", title: "东京塔", type: "attraction" }
]

// Result (CORRECT):
[
  { time: "09:00", title: "浅草寺", type: "attraction" },
  { time: "12:00", title: "午餐", type: "meal" },
  { time: "15:00", title: "东京塔", type: "attraction" }
]
```

---

## 3. AI Response Processing & Merging

### Location
**File:** `/server.js` Lines 300-316 - Tool execution and TripBook update

### Flow

```
AI Response
    ↓
update_trip_info tool called
    ↓
Tool result: { success: true, updates: { itinerary: {...} } }
    ↓
TripBook.updateItinerary(updates.itinerary) [SERVER.JS LINE 310]
    ↓
sendSSE('tripbook_update', tripBook.toPanelData())
    ↓
Frontend receives tripbook_update event
    ↓
updateFromTripBook() [PUBLIC/JS/ITINERARY.JS LINE 99]
    ↓
renderPanel() [PUBLIC/JS/ITINERARY.JS LINE 147]
```

### Code in server.js (Lines 300-316)

```javascript
// update_trip_info → 核心：写入 TripBook 约束/行程/阶段
if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
  const updates = parsed.updates;
  if (updates.constraints) {
    tripBook.updateConstraints(updates.constraints);
  }
  if (updates.phase !== undefined) {
    tripBook.updatePhase(updates.phase);
  }
  if (updates.itinerary) {
    tripBook.updateItinerary(updates.itinerary);  // ← MERGE HAPPENS HERE
  }
  sendSSE('tripbook_update', {
    ...tripBook.toPanelData(),  // ← Exports to panel format
    _snapshot: tripBook.toJSON()  // ← Stores state for session recovery
  });
}
```

---

## 4. Streaming & Incremental Update Logic

### Location
**File:** `/server.js` Lines 520-600 - `streamOpenAI()` function

### Potential Issue: Streaming Tool Call Assembly

```javascript
async function streamOpenAI(client, model, messages, tools, sendSSE, silent = false) {
  let fullText = '';
  const toolCallsMap = {};

  for await (const chunk of stream) {
    const delta = chunk.choices[0].delta;

    if (delta.content) {
      fullText += delta.content;
      if (!silent) sendSSE('token', { text: delta.content });
    }

    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        if (!toolCallsMap[tc.index]) {
          toolCallsMap[tc.index] = { ... };
        }
        // Streaming assembly: Accumulate function arguments
        if (tc.function?.arguments) {
          toolCallsMap[tc.index].function.arguments += tc.function.arguments;
        }
      }
    }
  }

  let toolCalls = rawToolCalls.map(tc => {
    let args;
    try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }
    return { id: tc.id, name: tc.function.name, args };
  });

  return { fullText, toolCalls, rawAssistant };
}
```

**⚠️ Potential Issues:**
1. If JSON parsing fails in the try-catch, args becomes `{}`, losing segment data
2. Incomplete streaming assembly could result in truncated segment arrays
3. Multiple tool calls in sequence might have state carry-over

---

## 5. Frontend Update Handler

### Location
**File:** `/public/js/chat.js` Lines 446-466

```javascript
case 'tripbook_update': {
  const snapshot = data._snapshot;
  if (snapshot) {
    try {
      sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot));
    } catch (err) {
      console.error('[Chat] Failed to store TripBook snapshot', { error: err.message });
    }
  }
  // Face panel rendering data (remove _snapshot)
  const panelData = { ...data };
  delete panelData._snapshot;
  if (typeof updateFromTripBook === 'function') updateFromTripBook(panelData);
  // Also save for page refresh recovery
  try { sessionStorage.setItem('tp_tripbook', JSON.stringify(panelData)); } catch {}
  break;
}
```

### Frontend Itinerary Update

**File:** `/public/js/itinerary.js` Lines 99-142 - `updateFromTripBook()`

```javascript
function updateFromTripBook(data) {
  if (!data) return;
  
  // ⚠️ POTENTIAL BUG: Direct array replacement (not merging)
  if (data.daysPlan && data.daysPlan.length > 0) {
    itineraryState.daysPlan = data.daysPlan;  // Direct assignment
  }
  
  try { renderPanel(); } catch(e) { console.error('renderPanel error:', e); }
}
```

**⚠️ Issue Found:** The frontend does **direct replacement** of `daysPlan`:
```javascript
itineraryState.daysPlan = data.daysPlan;
```

This could be problematic if:
- Multiple `tripbook_update` events arrive in sequence
- Frontend state isn't properly synchronizing with backend state
- The `toPanelData()` export is not correctly reflecting the merged segments

---

## 6. Panel Data Export

### Location
**File:** `/models/trip-book.js` Lines 349-402 - `toPanelData()`

```javascript
toPanelData() {
  // ... other fields ...
  
  daysPlan: it.days.map(d => ({
    day: d.day,
    date: d.date,
    city: d.city,
    title: d.title,
    segments: (d.segments || []).map(seg => ({
      time: seg.time || '',
      title: seg.title || seg.activity || '',
      location: seg.location || '',
      duration: seg.duration || '',
      transport: seg.transport || '',
      transportTime: seg.transportTime || '',
      notes: seg.notes || '',
      type: seg.type || 'activity',
    })),
  })),
}
```

This looks correct—it just transforms the segments into panel format.

---

## 7. Test Coverage

### Location
**File:** `/__tests__/models/trip-book.test.js` Lines 175-242

The merge logic has comprehensive tests that all PASS:
- ✅ Preserving existing segments (Line 163-173)
- ✅ Merging new segments with existing ones (Line 175-191)
- ✅ Updating by time+title match (Line 193-208)
- ✅ Full replacement with `_replace` flag (Line 210-224)
- ✅ Not affecting unmentioned days (Line 226-242)

**Tests pass, so the merge logic itself is correct.**

---

## Root Cause Analysis

The bug likely occurs in one of these scenarios:

### Scenario A: Incomplete Segment Data in AI Response

**Problem:** AI sends `update_trip_info` with incomplete segments:
```javascript
{
  itinerary: {
    days: [{
      day: 1,
      segments: [
        { time: "15:00", title: "Bar Visit" }  // ← MISSING other fields
        // Other segments NOT included!
      ]
    }]
  }
}
```

**Result:** 
- Deduplication key = `"15:00|Bar Visit"` ✓ (should be unique)
- But if AI doesn't include ALL existing segments in its response, only the new one gets added
- **Then duplication happens if the same segment is sent again in a follow-up response**

### Scenario B: Multiple Streaming Updates

**Problem:** AI generates update_trip_info in streaming chunks:
1. First chunk: `{ segments: [{ time: "09:00", title: "Activity A" }] }`
2. Second chunk: `{ segments: [{ time: "15:00", title: "Activity B" }] }` (append)

If the streaming assembly fails or there's state carry-over:
- First update merges "Activity A" into day
- Second update tries to merge "Activity B" but JSON parsing fails
- Falls back to incomplete data

### Scenario C: Frontend State Sync Issue

**Problem:** 
1. Backend sends `tripbook_update` with `daysPlan` containing 2 activities
2. Frontend receives and renders
3. Backend sends another `tripbook_update` with 2 activities (same + new)
4. Frontend does direct replacement: `itineraryState.daysPlan = data.daysPlan`

If the second update doesn't include all original segments, they appear to vanish, then reappear when a third update includes them.

---

## Recommended Investigation Steps

### Step 1: Enable Detailed Logging
Add logging to `/models/trip-book.js` `updateItinerary()`:

```javascript
updateItinerary(delta) {
  if (!delta) return;
  if (Array.isArray(delta.days)) {
    for (const newDay of delta.days) {
      const idx = this.itinerary.days.findIndex(d => d.day === newDay.day);
      if (idx >= 0) {
        const existing = this.itinerary.days[idx];
        console.log('[DEBUG] Merging day', newDay.day, {
          existingSegmentCount: existing.segments?.length,
          newSegmentCount: newDay.segments?.length,
          existingSegments: existing.segments?.map(s => `${s.time}|${s.title}`),
          newSegments: newDay.segments?.map(s => `${s.time}|${s.title}`),
        });
        // ... rest of merge logic
      }
    }
  }
}
```

### Step 2: Verify AI Response Structure
Log the `update_trip_info` tool result in `/server.js`:

```javascript
if (funcName === 'update_trip_info' && parsed.success && parsed.updates) {
  reqLog.info('[DEBUG] update_trip_info result', {
    updates: JSON.stringify(parsed.updates, null, 2).slice(0, 500)
  });
  // ... rest of code
}
```

### Step 3: Check Streaming JSON Parse Failures
Add error logging to `streamOpenAI()`:

```javascript
let toolCalls = rawToolCalls.map(tc => {
  let args;
  try { args = JSON.parse(tc.function.arguments); } 
  catch (e) { 
    console.error('[DEBUG] JSON parse failed for tool', tc.function.name, {
      arguments: tc.function.arguments.slice(0, 100),
      error: e.message
    });
    args = {}; 
  }
  return { id: tc.id, name: tc.function.name, args };
});
```

### Step 4: Monitor Frontend State
Add logging to `/public/js/itinerary.js`:

```javascript
function updateFromTripBook(data) {
  if (data.daysPlan && data.daysPlan.length > 0) {
    console.log('[DEBUG] updateFromTripBook daysPlan', {
      dayCount: data.daysPlan.length,
      segments: data.daysPlan.map(d => ({
        day: d.day,
        segmentCount: d.segments?.length,
        segments: d.segments?.map(s => `${s.time}|${s.title}`)
      }))
    });
  }
  // ... rest of code
}
```

---

## Files Involved in Duplication Bug

| File | Lines | Purpose | Involvement |
|------|-------|---------|------------|
| `/models/trip-book.js` | 142-196 | Segment merge logic | **HIGH** - Core deduplication |
| `/models/trip-book.js` | 349-402 | Panel data export | **MEDIUM** - Data transformation |
| `/server.js` | 300-316 | TripBook update & SSE send | **HIGH** - Orchestrates merge & streaming |
| `/server.js` | 520-600 | Streaming tool call assembly | **HIGH** - Potential JSON parse failures |
| `/public/js/chat.js` | 446-466 | SSE event handler | **MEDIUM** - Event routing |
| `/public/js/itinerary.js` | 99-142 | Frontend state update | **HIGH** - Direct assignment issue |
| `/tools/update-trip-info.js` | 60-147 | AI tool definition & execution | **HIGH** - Must send complete segments |

---

## Key Findings Summary

✅ **Working Correctly:**
- TripBook data model structure is sound
- Segment deduplication by time+title is implemented correctly
- Merge algorithm handles all cases (preserve, merge, replace)
- Test suite validates the merge logic thoroughly

❌ **Potential Issues:**
- **Incomplete segment data in AI responses** - AI may not send all existing segments
- **JSON parsing failures in streaming** - Malformed tool responses could lose data
- **Frontend direct assignment** - `daysPlan` array is replaced without merging
- **Multiple update event handling** - No queue/debounce mechanism
- **Session state recovery** - Snapshot restoration may not properly reconcile state

💡 **Most Likely Root Cause:**
The AI's `update_trip_info` tool is being called with partial segment data (only the new activity, not including existing ones). When the merge happens, the existing Map sees `time+title` keys it already has and updates them, but this might cause issues if the "existing" segments aren't actually in the new response.

---

## Next Steps

1. **Reproduce the bug** with detailed logging enabled
2. **Inspect the exact `update_trip_info` responses** the AI is sending
3. **Check if segments have complete data** (all required fields present)
4. **Verify streaming assembly** isn't truncating data
5. **Test with `_replace: true` flag** to force full replacement instead of merge
6. **Add frontend debouncing** for `tripbook_update` events
7. **Implement validation** to ensure segments have required fields

