# Quick Reference: Conversation & TripBook Data Flow

## 🎯 30-Second Overview

```
User Message
    ↓
chatHistory[] + sessionStorage.tp_tripbook
    ↓
POST /api/chat (to server)
    ↓
Server creates TripBook, AI processes, tools update TripBook
    ↓
SSE events stream back:
  • token → display text
  • tool_* → show spinners
  • tripbook_update → update panel + save sessionStorage.tp_tripbook
    ↓
saveTripSnapshot() saves messages to localStorage.tp_trips
    ↓
Next message uses tripbook_update data as starting point
    ↓
❌ ON PAGE RELOAD: sessionStorage cleared, TripBook LOST
✅ ON PAGE RELOAD: localStorage.tp_trips messages still here
```

---

## 📍 Five Key Locations

### 1. **Where Conversations Live**
- **File**: `public/js/chat.js`
- **Key Functions**:
  - `saveTripSnapshot()` (line 647) → Saves to localStorage
  - `loadTripById()` (line 686) → Loads from localStorage
  - `restoreChatUI()` (line 697) → Re-renders messages
- **Storage Key**: `tp_trips`
- **Format**: `[{id, title, createdAt, updatedAt, messages[]}]`

### 2. **Where TripBook Lives (Current)**
- **File**: `public/js/chat.js`
- **Key Line**: 317 → `sessionStorage.setItem('tp_tripbook', ...)`
- **Storage Key**: `tp_tripbook`
- **Format**: Flattened panel data from `trip-book.js` `toPanelData()`
- **Lifetime**: One page session only ⏰

### 3. **TripBook Class Definition**
- **File**: `models/trip-book.js`
- **Key Methods**:
  - `toJSON()` (line 492) → Serialize to JSON
  - `toPanelData()` (line 426) → Flatten for UI
  - `updateConstraints()` (line 142) → User requirements
  - `updateItinerary()` (line 201) → Day-by-day plan

### 4. **Server-Side TripBook Handling**
- **File**: `server.js`
- **Post `/api/chat`**:
  - Line 51: `new TripBook()` created per request
  - Lines 95-102: Restore from client snapshot
  - Line 270: `sendSSE('tripbook_update', tripBook.toPanelData())`

### 5. **UI Panel Updates**
- **File**: `public/js/itinerary.js`
- **Key Function**:
  - `updateFromTripBook()` (line 311) → Receives SSE data
  - `renderItinerary()` (line 128) → Renders to DOM

---

## 📊 Data Flow Checklist

### Sending a Message
- [ ] User types & sends
- [ ] Add to `chatHistory[]`
- [ ] Display in UI
- [ ] GET `sessionStorage.tp_tripbook` (if exists)
- [ ] POST to `/api/chat` with messages + tripbook snapshot
- [ ] Stream SSE events
- [ ] Update `sessionStorage.tp_tripbook` on `tripbook_update`
- [ ] Call `saveTripSnapshot()` after response
- [ ] Save to `localStorage.tp_trips`

### Loading Historical Conversation
- [ ] User clicks trip card
- [ ] `loadTripById(tripId)` reads `localStorage.tp_trips`
- [ ] Restore `chatHistory[]`
- [ ] Call `restoreChatUI()` to render messages
- [ ] ❌ TripBook NOT restored (lost on page reload)
- [ ] Itinerary panel stays empty

### Caching Mechanism
- [ ] AI calls `get_exchange_rate` tool
- [ ] Server sends `rate_cached` SSE event
- [ ] Frontend saves to `localStorage.tp_rate_cache`
- [ ] Next request includes cached rates
- [ ] Server merges and deduplicates
- [ ] Same for weather with `tp_weather_cache`

---

## 🔄 Message Format

### chatHistory Array Entry
```javascript
{
  role: "user" | "assistant",
  content: "raw message text or markdown"
}
```

### localStorage Trip Object
```javascript
{
  id: "trip_TIMESTAMP_RANDOM",
  title: "First user message (24 chars max)",
  createdAt: 1234567890,
  updatedAt: 1234567890,
  messages: [
    {role: "user", content: "..."},
    {role: "assistant", content: "..."}
  ]
  // MISSING: tripBookSnapshot (THIS IS THE PROBLEM ❌)
}
```

### sessionStorage TripBook Snapshot
```javascript
{
  destination: "日本 东京·京都·大阪",
  departCity: "北京",
  dates: "2024-05-01 ~ 2024-05-07",
  days: 7,
  people: 2,
  budget: "¥20000",
  preferences: ["文化", "美食"],
  phase: 3,
  phaseLabel: "完善细节",
  route: ["东京", "京都", "大阪"],
  flights: [{route, airline, price, time, status}],
  hotels: [{name, city, price, nights, status}],
  weather: {city, temp_c, description},
  daysPlan: [{day, date, city, title, segments[]}],
  budgetSummary: {flights, hotels, total_cny}
}
```

---

## 🐛 The Critical Bug

### Current State
```
Trip Created → Messages saved ✅ → TripBook saved to sessionStorage ✅
              ↓ (page reload)
              Messages restored ✅ → TripBook LOST ❌
              Itinerary panel empty 😞
```

### Why It Happens
- Conversations stored in `localStorage` (persistent) ✅
- TripBook stored in `sessionStorage` (ephemeral) ❌
- No code to save TripBook with conversation history

### The Fix (One Line per Phase)

**Phase 1: Save TripBook Snapshot**
```javascript
// In chat.js streamChat() after saveTripSnapshot()
trip.tripBookSnapshot = JSON.parse(sessionStorage.getItem('tp_tripbook') || '{}');
```

**Phase 2: Restore TripBook Snapshot**
```javascript
// In chat.js loadTripById() after restoreChatUI()
if (trip.tripBookSnapshot) {
  sessionStorage.setItem('tp_tripbook', JSON.stringify(trip.tripBookSnapshot));
  updateFromTripBook(trip.tripBookSnapshot);
}
```

---

## 📈 SSE Events Reference

| Event | When | Data | Action |
|-------|------|------|--------|
| `token` | AI streaming | `{text}` | Append to bubble |
| `tool_start` | Tool begins | `{id, name, arguments}` | Show spinner |
| `tool_result` | Tool ends | `{id, name, resultLabel}` | ✅ Mark done |
| `rate_cached` | Exchange rate fetched | Rate data | Save to localStorage |
| `weather_cached` | Weather fetched | Weather data | Save to localStorage |
| `tripbook_update` | Trip info updated | Panel data | Update UI + save sessionStorage |
| `quick_replies` | AI suggests options | Questions array | Show choice buttons |
| `error` | Any error | `{message}` | Display error |
| `done` | Stream complete | `{}` | Cleanup |

---

## 🔑 Storage Keys

```javascript
// Settings (persistent across sessions)
localStorage.tp_provider       // "openai" | "anthropic" | "deepseek"
localStorage.tp_model         // "gpt-4o" | "claude-sonnet-4-20250514" etc
localStorage.tp_apiKey        // Stored locally only, never sent to server
localStorage.tp_baseUrl       // Custom API endpoint

// Caches (persistent, with TTL)
localStorage.tp_rate_cache    // {from_to: {rate, fetched_at}} TTL: 4h
localStorage.tp_weather_cache // {city: {temp_c, forecast, fetched_at}} TTL: 3h

// Conversation History (persistent)
localStorage.tp_trips         // [{id, title, messages[], createdAt, updatedAt}]

// Current Session (ephemeral, lost on reload)
sessionStorage.tp_tripbook    // Latest panel data snapshot
```

---

## 💡 Key Insights

1. **Dual Storage Strategy**:
   - Conversations = localStorage (persistent)
   - TripBook = sessionStorage (ephemeral)

2. **Why sessionStorage?**:
   - TripBook can be reconstructed from messages
   - Server creates new TripBook per request
   - Client only needs current state for next message

3. **The Missing Link**:
   - No code to persist TripBook to localStorage with trip
   - No code to restore TripBook when loading historical trip
   - Simple to fix, high impact

4. **Current Behavior**:
   - ✅ Can read old conversations
   - ❌ Itinerary panel empty
   - ❌ Can't see what was planned before page reload

5. **Proper Solution**:
   - Include `tripBookSnapshot` in trip object
   - Save on each `tripbook_update` event
   - Restore when loading historical trip
   - Render itinerary panel from snapshot

---

## 🚀 Implementation Checklist

- [ ] Modify trip object schema to include `tripBookSnapshot`
- [ ] Update `saveTripSnapshot()` to capture latest TripBook
- [ ] Update `loadTripById()` to restore TripBook
- [ ] Test loading historical trip shows itinerary
- [ ] Test iterative planning still works (TripBook grows)
- [ ] Check localStorage size doesn't exceed limits
- [ ] Consider compression if needed

---

## 🎓 Learning Resources

1. **Understanding the Flow**:
   - Read: `CONVERSATION_TRIPBOOK_FLOW.md` (full detailed analysis)
   - See: Part 7 data flow diagram

2. **TripBook Structure**:
   - Read: `models/trip-book.js` comments (lines 1-9)
   - Understand: Four layers (knowledge, dynamic, constraints, itinerary)

3. **SSE Communication**:
   - Read: `server.js` lines 45-47 (sendSSE definition)
   - Read: `public/js/chat.js` lines 224-343 (handleSSEEvent)

4. **Persistence Logic**:
   - Conversation save: `public/js/chat.js` line 647
   - Conversation load: `public/js/chat.js` line 686
   - TripBook save: `public/js/chat.js` line 317
   - TripBook load: Missing! ❌

