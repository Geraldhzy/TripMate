# Activity Duplication Bug - Quick Fix Checklist

## 🔍 Immediate Investigation (5 minutes)

### 1. Check Recent Logs
```bash
# Look for JSON parse errors
grep -i "parse\|error\|fail" logs/*.log | tail -50

# Look for streaming issues
grep -i "stream\|chunk\|arguments" logs/*.log | tail -50
```

### 2. Test Specific Scenario
1. Open the app in browser with DevTools Console open
2. Start a trip planning conversation
3. Create Day 1 with 2 activities (e.g., Arrival + Lunch)
4. Ask AI to add a third activity (e.g., Bar visit)
5. **Check Console for:**
   - Duplication warning logs
   - Network errors in SSE stream
   - Multiple `tripbook_update` events

### 3. Reproduce & Capture
```javascript
// In browser console, add this logging:
const originalUpdateFromTripBook = window.updateFromTripBook;
window.updateFromTripBook = function(data) {
  console.log('[TRACE] updateFromTripBook called with daysPlan:', data.daysPlan);
  return originalUpdateFromTripBook.call(this, data);
};
```

---

## 🛠️ Quick Fixes (Priority Order)

### Fix 1: Add Error Logging to Streaming (2 mins)
**File:** `/server.js` Line 570-574

**Current:**
```javascript
let toolCalls = rawToolCalls.map(tc => {
  let args;
  try { args = JSON.parse(tc.function.arguments); } 
  catch { args = {}; }
  return { id: tc.id, name: tc.function.name, args };
});
```

**Fixed:**
```javascript
let toolCalls = rawToolCalls.map(tc => {
  let args;
  try { 
    args = JSON.parse(tc.function.arguments); 
  } 
  catch (e) { 
    console.error('[ERROR] JSON parse failed for tool', tc.function.name, {
      arguments: tc.function.arguments.slice(0, 200),
      error: e.message
    });
    args = {}; 
  }
  return { id: tc.id, name: tc.function.name, args };
});
```

**Why:** Reveals if streaming truncation is losing segment data

---

### Fix 2: Add Merge Logging to TripBook (3 mins)
**File:** `/models/trip-book.js` Line 154-182

**Add logging at the start of merge:**
```javascript
if (idx >= 0) {
  const existing = this.itinerary.days[idx];
  const merged = { ...existing, ...newDay };

  // ADD THIS:
  if (process.env.DEBUG_MERGE) {
    console.log(`[MERGE] Day ${newDay.day}:`, {
      existingCount: existing.segments?.length || 0,
      newCount: newDay.segments?.length || 0,
      existingTitles: existing.segments?.map(s => `${s.time}|${s.title}`),
      newTitles: newDay.segments?.map(s => `${s.time}|${s.title}`),
    });
  }
  
  // ... rest of merge logic
```

**Enable with:** `DEBUG_MERGE=1 npm start`

**Why:** Shows exactly what segments are being merged and why

---

### Fix 3: Frontend Event Debouncing (5 mins)
**File:** `/public/js/itinerary.js` Line 99-142

**Current:**
```javascript
function updateFromTripBook(data) {
  if (!data) return;
  if (data.daysPlan && data.daysPlan.length > 0) {
    itineraryState.daysPlan = data.daysPlan;  // Direct assignment
  }
  try { renderPanel(); } catch(e) { console.error('renderPanel error:', e); }
}
```

**Fixed with debounce:**
```javascript
let updateTimeout = null;

function updateFromTripBook(data) {
  if (!data) return;
  
  // Clear pending update
  if (updateTimeout) clearTimeout(updateTimeout);
  
  // Apply update with 100ms debounce
  updateTimeout = setTimeout(() => {
    if (data.daysPlan && data.daysPlan.length > 0) {
      itineraryState.daysPlan = data.daysPlan;
    }
    if (data.preferences && data.preferences.length > 0) {
      itineraryState.preferences = data.preferences;
    }
    // ... other updates
    
    try { renderPanel(); } catch(e) { console.error('renderPanel error:', e); }
  }, 100);
}
```

**Why:** Prevents multiple rapid updates from causing race conditions

---

### Fix 4: Segment Validation (4 mins)
**File:** `/models/trip-book.js` Line 169-181

**Add validation before merge:**
```javascript
else if (existing.segments?.length > 0) {
  // ADD THIS VALIDATION:
  if (!newDay.segments || !Array.isArray(newDay.segments)) {
    console.warn(`[WARN] Invalid segments for day ${newDay.day}:`, newDay.segments);
    merged.segments = existing.segments || [];
  } else {
    // Original merge logic
    const existingMap = new Map();
    for (const seg of existing.segments) {
      const key = `${seg.time || ''}|${seg.title || seg.activity || ''}`;
      existingMap.set(key, seg);
    }
    for (const seg of newDay.segments) {
      const key = `${seg.time || ''}|${seg.title || seg.activity || ''}`;
      if (!key.includes('|')) {
        console.warn(`[WARN] Segment missing time or title:`, seg);
      }
      existingMap.set(key, { ...(existingMap.get(key) || {}), ...seg });
    }
    merged.segments = Array.from(existingMap.values())
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }
}
```

**Why:** Catches malformed segment data from streaming failures

---

## 📋 Complete Testing Checklist

After each fix, test these scenarios:

- [ ] **Single Activity Add**: Add one new activity → No duplicates
- [ ] **Multiple Adds**: Add 3 activities sequentially → All present, no duplicates
- [ ] **Rapid Fire**: Ask AI to add 5 activities quickly → All added correctly
- [ ] **Edit Activity**: Modify existing activity → Original count preserved
- [ ] **Page Refresh**: Add activity, refresh page → State recovered correctly
- [ ] **Long Session**: 10+ activities on one day → No duplicates
- [ ] **Mixed Types**: Flights, hotels, meals, attractions → All deduplicate correctly
- [ ] **Unicode Titles**: Chinese characters in titles → Deduplication works
- [ ] **Time Variations**: Activities at same time → Handles correctly
- [ ] **Network Delay**: Simulate slow connection → No race conditions

---

## 🔬 Advanced Debugging

### Enable Full Tracing
```javascript
// server.js - Line 310
if (updates.itinerary) {
  console.log('[BEFORE] TripBook state:', JSON.stringify(tripBook.itinerary.days, null, 2));
  tripBook.updateItinerary(updates.itinerary);
  console.log('[AFTER] TripBook state:', JSON.stringify(tripBook.itinerary.days, null, 2));
  console.log('[DELTA] Update received:', JSON.stringify(updates.itinerary, null, 2));
}
```

### Monitor SSE Events
```javascript
// public/js/chat.js - Line 446
case 'tripbook_update': {
  console.log('[SSE] tripbook_update event #' + (window.__event_counter = (window.__event_counter || 0) + 1));
  console.log('[SSE] daysPlan segments:', data.daysPlan?.map(d => ({
    day: d.day,
    count: d.segments?.length,
    list: d.segments?.map(s => s.title)
  })));
  // ... rest of handler
}
```

### Capture Network Traffic
Use DevTools Network tab:
1. Filter to `EventStream` type
2. Expand `tripbook_update` events
3. Compare sequential events for differences

---

## 🎯 Root Cause Decision Tree

```
Does duplication occur?
├─ YES, immediately after adding activity
│  ├─ Check: Is segment already in existing array? (Case 1)
│  ├─ Check: Is _replace flag set? (Case 2)
│  └─ Check: Does merge map contain duplicate keys? (Case 3)
│
├─ YES, after 2nd+ add on same day
│  ├─ Check: Are all segments in AI response? (Incomplete response)
│  ├─ Check: Do time+title keys match exactly? (Key mismatch)
│  └─ Check: Did streaming assembly fail? (JSON parse error)
│
└─ YES, sometimes after page refresh
   ├─ Check: Is session snapshot restored correctly?
   ├─ Check: Frontend state vs backend state in sync?
   └─ Check: Are old SSE events being reprocessed?
```

---

## 📞 Key Contacts

- **Model:** `/models/trip-book.js` - TripBook class
- **Server:** `/server.js` - AI response handling
- **Frontend:** `/public/js/itinerary.js` - Display logic
- **Tools:** `/tools/update-trip-info.js` - AI tool definition
- **Tests:** `/__tests__/models/trip-book.test.js` - Merge validation

---

## 📝 Notes

- The merge logic itself is **NOT broken** (tests pass)
- The issue is likely **upstream** (AI response structure or streaming)
- **Don't** add duplicate detection to merge logic
- **Instead** focus on data completeness and streaming reliability

---

## ✅ Success Criteria

- [ ] No duplication after adding 5 sequential activities
- [ ] Merge logs show correct dedup keys
- [ ] No JSON parse errors in streaming
- [ ] Frontend events are processed in order (no race conditions)
- [ ] Session state recovery maintains segment integrity

