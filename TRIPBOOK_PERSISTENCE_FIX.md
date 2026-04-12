# TripBook Persistence Chain Fix - Implementation Summary

## Problem Statement

The AI agent was re-asking for already-confirmed trip information (destination, dates, budget, etc.) even though this information had been confirmed in previous messages. This happened because the TripBook persistence chain had multiple failure points that were either silently catching errors or leaving confirmed flags undefined.

## Root Cause Analysis

### The TripBook Lifecycle (Normal Flow)

```
REQUEST 1 (Initial):
  1. User says "I want to go to Japan for 5 days"
  2. LLM calls update_trip_info tool with constraints { destination, dates, budget, ...}
  3. server.js:377-391 writes to TripBook and sends SSE tripbook_update
  4. public/js/chat.js:326 stores snapshot in sessionStorage

REQUEST 2 (Follow-up):
  1. User asks another question
  2. public/js/chat.js:149-150 retrieves snapshot from sessionStorage
  3. Sends snapshot in POST body to server
  4. server.js:180-195 attempts to restore snapshot into new TripBook instance
  5. prompts/system-prompt.js:416-431 injects TripBook data into system prompt
  6. System prompt includes "用户已确认信息（勿重复询问）" section
  7. LLM sees confirmed info and the "never repeat" rule → doesn't re-ask
```

### Failure Points

1. **Undefined `confirmed` flags** (models/trip-book.js:150)
   - When LLM calls update_trip_info, the constraint fields didn't have `confirmed: true` set
   - TripBook.updateConstraints() didn't default undefined confirmed to true
   - buildConstraintsPromptSection() would mark as "待确认" (pending) instead of "已确认"
   - System prompt had no confirmed info to reference

2. **Silent error swallowing** (public/js/chat.js:147-151)
   - If JSON.parse() failed on snapshot retrieval, error was silently caught
   - No logging, so failures were invisible
   - Server received broken snapshot or no snapshot

3. **Silent error swallowing** (public/js/chat.js:326)
   - If sessionStorage.setItem() failed (quota exceeded, etc.), error was silently caught
   - Snapshot never stored for next request

4. **Error visibility in restoration** (server.js:180-195)
   - Error logging was added in previous session but not comprehensive enough
   - Error messages didn't show what was in the failed snapshot

5. **System prompt injection logic** (prompts/system-prompt.js:416-419)
   - No validation that TripBook data exists before injecting
   - No error handling if toSystemPromptSection() throws

## Fixes Implemented

### 1. Defensive Confirmed Flag Handling

**File: models/trip-book.js (lines 150-156)**

```javascript
// ⚠️  CRITICAL: Ensure confirmed flag is set when LLM provides constraint data
// When AI calls update_trip_info with confirmed: true, set confirmed_at timestamp
// If confirmed flag is missing/undefined, default to true (assuming AI confirmation means commitment)
// If explicitly false, preserve it (for pending/tentative constraints)
if (newVal.confirmed === undefined) {
  newVal.confirmed = true; // Default: treat new constraints as confirmed
}
```

**File: tools/update-trip-info.js (lines 92-112)**

```javascript
// ⚠️ CRITICAL: Ensure all constraint fields have confirmed: true for system prompt injection
// Without confirmed flag, buildConstraintsPromptSection() will mark as "待确认" (pending)
// and AI will re-ask the question due to missing "严禁重复询问" rule
const constraintFields = ['destination', 'departCity', 'dates', 'people', 'budget', 'preferences', 'specialRequests'];
for (const field of constraintFields) {
  if (constraints[field] !== undefined) {
    if (Array.isArray(constraints[field])) {
      constraints[field] = constraints[field].map(item => ({
        ...item,
        confirmed: item.confirmed !== false ? true : false
      }));
    } else if (typeof constraints[field] === 'object') {
      constraints[field].confirmed = constraints[field].confirmed !== false ? true : false;
    }
  }
}
```

### 2. Error Visibility in Client

**File: public/js/chat.js (lines 147-158)**

```javascript
// Restore TripBook snapshot from client-side sessionStorage for cross-request context
try {
  const tripBookSnapshot = sessionStorage.getItem('tp_tripbook_snapshot')
                         || sessionStorage.getItem('tp_tripbook');
  if (tripBookSnapshot) bodyPayload.tripBookSnapshot = JSON.parse(tripBookSnapshot);
} catch (err) {
  // Log snapshot retrieval errors to aid debugging of AI re-asking questions
  console.warn('[Chat] Failed to parse TripBook snapshot from sessionStorage', {
    error: err.message,
    stack: err.stack,
    storageKeys: Object.keys(sessionStorage).filter(k => k.startsWith('tp_'))
  });
}
```

**File: public/js/chat.js (lines 326-333)**

```javascript
try {
  sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot));
} catch (err) {
  console.error('[Chat] Failed to store TripBook snapshot in sessionStorage', {
    error: err.message,
    snapshotSize: JSON.stringify(snapshot).length
  });
}
```

### 3. Defensive System Prompt Generation

**File: prompts/system-prompt.js (lines 415-431)**

```javascript
// ── TripBook 行程参考书注入 ────────────────────────────────
// CRITICAL: This section contains confirmed constraints and trip context.
// If TripBook snapshot restoration fails on server, this section will be empty
// and AI will re-ask previously confirmed questions.
// Debug: Check server logs for "[TripBook] Snapshot restoration failed" errors
if (tripBook) {
  try {
    const tripBookSection = tripBook.toSystemPromptSection();
    // Only inject if there's actual confirmed or pending data
    if (tripBookSection && tripBookSection.trim().length > 0) {
      parts.push('\n---\n' + tripBookSection);
    }
  } catch (err) {
    console.error('[SystemPrompt] Failed to generate TripBook section:', err.message);
    // Don't fail the entire prompt; continue without TripBook data
  }
}
```

### 4. Comprehensive Documentation

**File: server.js (lines 179-222)** - Added TripBook lifecycle documentation with ASCII diagram

**File: models/trip-book.js (lines 257-296)** - Added constraint splitting documentation explaining confirmed vs pending logic

## Testing Checklist

### Manual Testing

1. **Start a new conversation and confirm trip details**
   - [ ] User says: "I want to go to Japan for 5 days, leaving May 1st, 2 people, budget 20000 CNY"
   - [ ] Check browser console: no "[Chat] Failed to parse TripBook snapshot" warnings
   - [ ] Check browser DevTools → Application → Session Storage for `tp_tripbook_snapshot` key

2. **Refresh the page or make a new request**
   - [ ] The previous trip info should be restored
   - [ ] Check server logs for "[TripBook] Snapshot restoration failed" errors (should be none)
   - [ ] Check if AI's first response mentions the already-confirmed information

3. **Verify system prompt includes confirmed information**
   - [ ] Copy system prompt from DevTools (use chrome inspection on first message)
   - [ ] Should contain section "用户已确认信息（勿重复询问）" with:
     - `- 目的地：日本 ✅`
     - `- 日期：2026-05-01 ~ 2026-05-07（5天）✅`
     - `- 人数：2人 ✅`
     - `- 预算：20000CNY ✅`

4. **Verify AI doesn't re-ask confirmed questions**
   - [ ] User asks: "What should I bring?"
   - [ ] AI's response should NOT include: "Just to confirm, you're going to Japan for 5 days?"
   - [ ] AI should reference already-confirmed info: "Based on your confirmed trip to Japan (May 1-7)..."

### Browser DevTools Console Monitoring

When working correctly, you should see:
- NO console warnings/errors containing "Failed to parse TripBook snapshot"
- NO console warnings containing "Failed to store TripBook snapshot"

When something goes wrong, you'll see:
```
[Chat] Failed to parse TripBook snapshot from sessionStorage
{error: "SyntaxError: Unexpected token } in JSON at position 123", ...}
```

### Server Logs Monitoring

When working correctly, you should see:
- Message: `"tripbook_update"` SSE event sent after update_trip_info tool

When snapshot restoration fails, you'll see:
```
[TripBook] Snapshot restoration failed: Cannot read property 'value' of null
[TripBook] Stack: at TripBook.updateConstraints (models/trip-book.js:162)
[TripBook] Snapshot (truncated): {"constraints":{"destination":null, ...
```

## Debugging Guide

### Issue: AI Re-asks Confirmed Questions

**Check 1: Browser Storage**
```javascript
// In browser console:
sessionStorage.getItem('tp_tripbook_snapshot')
// Should return non-null snapshot with confirmed constraints
```

**Check 2: Server Logs**
```
grep "[TripBook]" server.log
// Should NOT show "Snapshot restoration failed"
```

**Check 3: System Prompt**
Send a test request and check if "用户已确认信息（勿重复询问）" appears in system prompt

**Check 4: Constraint Objects**
```javascript
// In server code, after TripBook restoration:
console.log(tripBook.constraints.destination);
// Should show: { value: "Japan", cities: [...], confirmed: true, confirmed_at: 123456 }
// NOT: { value: "Japan", cities: [...], confirmed: undefined }
```

### Issue: SessionStorage Quota Exceeded

If you see:
```
[Chat] Failed to store TripBook snapshot in sessionStorage
{error: "QuotaExceededError", snapshotSize: 50000}
```

This means the snapshot is too large. Solutions:
- Clear other session data
- Reduce number of cached destinations
- Compress snapshot before storage

### Issue: Corrupted Snapshot Data

If you see:
```
[TripBook] Snapshot restoration failed: Cannot read property 'value' of undefined
```

The snapshot was corrupted during storage. Check:
- Network traffic for truncated SSE messages
- Browser storage quota not exceeded
- JSON serialization not losing data

## Files Modified

1. **models/trip-book.js** - Added defensive confirmed flag defaulting in updateConstraints()
2. **tools/update-trip-info.js** - Added confirmed flag validation on all constraint fields
3. **public/js/chat.js** - Added error logging to snapshot retrieval and storage
4. **prompts/system-prompt.js** - Added defensive injection logic and error handling
5. **server.js** - Added comprehensive TripBook lifecycle documentation
6. **models/trip-book.js** - Added constraint splitting documentation in buildConstraintsPromptSection()

## Performance Impact

All fixes have minimal performance impact:
- Confirmed flag defaulting: O(n) where n = number of constraint fields (6-7, negligible)
- Error logging: Only logs when errors occur, no normal-path overhead
- Try-catch blocks: Standard error handling, no performance cost
- Documentation: Comments only, zero runtime impact

## Future Improvements

1. **Persist to localStorage in addition to sessionStorage**
   - Would survive browser crashes and tab closures
   - Requires encryption for privacy

2. **Add TripBook versioning**
   - Track when snapshots were created
   - Invalidate old snapshots after N days

3. **Add debug panel**
   - Show TripBook state in UI
   - Show "confirmed" vs "pending" constraints visually
   - Show snapshot size and storage quota

4. **Add metrics**
   - Count snapshot restoration failures
   - Track failed JSON parses
   - Measure system prompt generation time
