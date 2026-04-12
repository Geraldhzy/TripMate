# TripBook Persistence - Quick Reference

## The Problem in One Sentence
AI re-asks confirmed trip info because TripBook snapshots either fail to restore or have undefined `confirmed` flags.

## The Solution in One Sentence
Default confirmed flags to true in both TripBook and update_trip_info, add error logging everywhere, validate injection.

## Critical Code Sections to Know

### 1. Where Confirmed Flag Gets Set
```
tools/update-trip-info.js:92-112
  ↓
models/trip-book.js:150-156 (defaults to true if undefined)
  ↓
buildConstraintsPromptSection():257-296 (splits into confirmed vs pending)
  ↓
prompts/system-prompt.js:416-431 (injects into system prompt)
  ↓
LLM sees "勿重复询问" rule and doesn't re-ask
```

### 2. Where Snapshot Gets Stored/Retrieved
**Store** (after LLM calls update_trip_info):
```
server.js:389-392
  → sendSSE('tripbook_update', {_snapshot: tripBook.toJSON()})
  → public/js/chat.js:326 
  → sessionStorage.setItem('tp_tripbook_snapshot', JSON.stringify(snapshot))
```

**Retrieve** (on next request):
```
public/js/chat.js:149-150
  → JSON.parse(sessionStorage.getItem('tp_tripbook_snapshot'))
  → Send in POST body
  → server.js:180-195
  → tripBook.updateConstraints(snapshot.constraints)
```

### 3. Where Errors Are Logged
- **Client snapshot retrieval**: `public/js/chat.js:154` - `[Chat] Failed to parse...`
- **Client snapshot storage**: `public/js/chat.js:330` - `[Chat] Failed to store...`
- **Server restoration**: `server.js:189-193` - `[TripBook] Snapshot restoration failed:`
- **System prompt injection**: `prompts/system-prompt.js:428` - `[SystemPrompt] Failed to generate...`

## Quick Debugging Workflow

### Q: AI is re-asking confirmed questions
**A1: Check client storage**
```javascript
// Browser console:
JSON.parse(sessionStorage.getItem('tp_tripbook_snapshot')).constraints.destination
// Should have: { value: "Japan", confirmed: true, confirmed_at: 1234567890 }
// NOT: { value: "Japan", confirmed: undefined }
```

**A2: Check server logs for restoration errors**
```bash
grep "\[TripBook\]" your_server.log
# Should be empty (no errors)
```

**A3: Check if system prompt has confirmed section**
```
Open DevTools on first message, look for "用户已确认信息（勿重复询问）"
```

### Q: Snapshot not being stored
**A: Check browser console**
```javascript
// Should be empty
sessionStorage.getItem('tp_tripbook_snapshot')
```
Look for `[Chat] Failed to store...` in console.

### Q: Snapshot stored but not restored
**A: Check server logs**
```bash
grep "[TripBook] Snapshot restoration failed" your_server.log
```
Will show the exact error and truncated snapshot content.

## Key Files to Understand

| File | Role | Key Line(s) |
|------|------|-----------|
| `models/trip-book.js` | TripBook class | 150-156: confirmed flag default |
| `models/trip-book.js` | Constraint splitting | 257-296: buildConstraintsPromptSection() |
| `tools/update-trip-info.js` | Tool execution | 92-112: constraint validation |
| `server.js` | Snapshot restoration | 180-195: restore attempt |
| `server.js` | Snapshot sending | 389-392: SSE emission |
| `prompts/system-prompt.js` | Injection logic | 416-431: TripBook injection |
| `public/js/chat.js` | Client storage | 149-150: retrieval, 326: storage |

## The Confirmed Flag: Why It Matters

```javascript
// Without confirmed flag (WRONG):
{ destination: { value: "Japan" } }
→ buildConstraintsPromptSection() → pending list
→ System prompt has NO "已确认信息" section
→ AI doesn't see "勿重复询问" rule
→ AI re-asks "Where do you want to go?"

// With confirmed flag (RIGHT):
{ destination: { value: "Japan", confirmed: true } }
→ buildConstraintsPromptSection() → confirmed list
→ System prompt has "用户已确认信息" with ✅
→ AI sees "勿重复询问" rule
→ AI doesn't re-ask
```

## Testing One Feature End-to-End

1. **Say confirmation**: "I want to go to Tokyo for 5 days, May 1-5, 2 people, 20k CNY"
2. **Check storage**: `sessionStorage.getItem('tp_tripbook_snapshot')` in DevTools
3. **Send another message**: "What should I bring?"
4. **Check AI response**: Should reference Tokyo trip without re-asking
5. **Check prompt**: DevTools should show "用户已确认信息（勿重复询问）" section

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `[Chat] Failed to parse TripBook snapshot` | JSON.parse() failed | Snapshot is corrupted |
| `[Chat] Failed to store TripBook snapshot` | sessionStorage full | Clear other data |
| `[TripBook] Snapshot restoration failed` | update_trip_info had invalid data | Check constraint structure |
| `[SystemPrompt] Failed to generate TripBook section` | toSystemPromptSection() threw | Check TripBook data integrity |

## One-Line Fixes

**"Confirmed flag not being set"**
→ Check line 154 in models/trip-book.js is executing (add console.log if needed)

**"Snapshot not stored"**
→ Check line 326 in public/js/chat.js for sessionStorage quota errors

**"Snapshot not restored"**
→ Check server logs at line 189-193 for restoration errors

**"System prompt missing confirmed info"**
→ Check server logs at line 189: if restoration failed, TripBook is empty
