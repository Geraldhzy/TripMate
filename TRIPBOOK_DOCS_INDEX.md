# TripBook Documentation Index

## 📚 Available Documents

### 1. **TRIPBOOK_EXECUTIVE_SUMMARY.txt** ⭐ START HERE
   - **Best for:** Getting the big picture quickly
   - **Contents:**
     - What is TripBook? (4 layers explained)
     - Core workflow (8-step process)
     - 3 key problems it solves
     - Design principles
     - Quick reference on key methods
   - **Read time:** 10 minutes

### 2. **TRIPBOOK_ARCHITECTURE.md** (Comprehensive)
   - **Best for:** Deep understanding and implementation
   - **Contents:**
     - Complete TripBook model structure
     - Layer 3 constraints with all fields explained
     - Layer 4 itinerary with all fields explained
     - Layer 2 dynamic data structure
     - All key methods with examples
     - update_trip_info tool definition with example AI call
     - System prompt integration details
     - Phase lifecycle (1-7)
     - Summary table
   - **Read time:** 20-30 minutes

### 3. **TRIPBOOK_QUICK_REFERENCE.md**
   - **Best for:** Field-by-field reference while coding
   - **Contents:**
     - Essential field structures (copy-paste ready)
     - When to call update_trip_info (trigger table)
     - System prompt injection examples
     - TripBook methods to call (organized by purpose)
     - Common mistakes with corrections
     - Data flow at a glance
     - File locations
   - **Use:** Keep this open while implementing

### 4. **TRIPBOOK_FLOW_DIAGRAM.txt**
   - **Best for:** Visual learners
   - **Contents:**
     - 8-step workflow with ASCII boxes
     - TripBook layer diagram
     - update_trip_info tool input → output flow
     - Key methods and outputs organized visually
   - **Use:** Reference when confused about state flow

### 5. **TRIPBOOK_DATA_STRUCTURES.md** (Previously existing)
   - **Best for:** Detailed data structure reference
   - **Contents:** Likely contains schema-level details

### 6. **TRIPBOOK_PERSISTENCE_IMPLEMENTATION.md** (Previously existing)
   - **Best for:** Database storage and serialization
   - **Contents:** Likely contains save/load patterns

---

## 🎯 Quick Navigation Guide

### I want to...

**Understand what TripBook is**
→ Read: TRIPBOOK_EXECUTIVE_SUMMARY.txt (sections 1-2)

**Implement a new feature that updates TripBook**
→ Read: TRIPBOOK_QUICK_REFERENCE.md + TRIPBOOK_ARCHITECTURE.md (relevant section)

**Debug: AI keeps re-asking questions**
→ Read: TRIPBOOK_EXECUTIVE_SUMMARY.txt (section "CRITICAL CONSTRAINT: DO NOT RE-ASK")

**Understand the 4 layers**
→ Read: TRIPBOOK_EXECUTIVE_SUMMARY.txt (section "LAYERS EXPLAINED")

**See the full workflow**
→ Read: TRIPBOOK_FLOW_DIAGRAM.txt (section "1. USER SENDS MESSAGE" through "8. NEXT TURN")

**Reference constraint fields**
→ Read: TRIPBOOK_QUICK_REFERENCE.md (section "Essential Field Structures" → "Constraints")

**Reference itinerary fields**
→ Read: TRIPBOOK_QUICK_REFERENCE.md (section "Essential Field Structures" → "Itinerary")

**Check when to call update_trip_info**
→ Read: TRIPBOOK_QUICK_REFERENCE.md (section "When to Call update_trip_info")

**Understand system prompt integration**
→ Read: TRIPBOOK_EXECUTIVE_SUMMARY.txt (section "HOW SYSTEM PROMPT INTEGRATION WORKS")

**See what methods exist**
→ Read: TRIPBOOK_QUICK_REFERENCE.md (section "TripBook Methods")

**Debug data flow issues**
→ Read: TRIPBOOK_QUICK_REFERENCE.md (section "Data Flow at a Glance")

---

## 📊 Document Comparison

| Need | Executive Summary | Architecture | Quick Reference | Flow Diagram |
|------|------|---|---|---|
| High-level overview | ⭐⭐⭐ | ⭐ | ⭐ | ⭐⭐ |
| Field details | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Usage examples | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Implementation guide | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Visual workflow | ⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| System prompt info | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| Design principles | ⭐⭐⭐ | ⭐⭐ | ⭐ | ⭐ |

---

## 🔑 Key Concepts Defined

### TripBook
4-layer data model that acts as single source of truth for trip planning state.

### Constraints (Layer 3)
What the user wants (destination, dates, budget, etc.). Each field has a `confirmed` boolean to track whether user said yes.

### Itinerary (Layer 4)
The actual trip plan being built incrementally: phases, route, days with activities (segments), budget, reminders.

### Dynamic Data (Layer 2)
Cached real-time info (weather, exchange rates, flight/hotel quotes, web searches) with TTL to avoid repeated API calls.

### Segments
Individual activities within a day: time, title, location, transport, notes, type (transportation/dining/activity/etc).

### update_trip_info
AI tool that accepts structured data about constraints + itinerary and returns validated response for server to apply.

### toSystemPromptSection()
TripBook method that generates markdown text injected into system prompt, telling AI what's confirmed ✅ and pending ❓.

### Delta (Incremental Update)
Only pass fields that changed, not entire objects. Servers use shallow merge to preserve unmentioned fields.

### Confirmed ✅
When `confirmed: true`, that constraint appears in system prompt with ✅ marker. AI sees this and knows not to re-ask.

### Phase (1-7)
Planning stage: 1=lock constraints, 2=flights, 3=framework, 4=bookings, 5=details, 6=budget, 7=export.

---

## 💡 Implementation Checklist

When adding new features that touch TripBook:

- [ ] Check if data should go in Layer 2 (dynamic), Layer 3 (constraints), or Layer 4 (itinerary)
- [ ] If AI updates it, ensure update_trip_info tool accepts the field
- [ ] If server updates it, use the right method (updateConstraints/updateItinerary/setWeather/etc)
- [ ] Test that system prompt includes new data in toSystemPromptSection()
- [ ] Verify frontend receives correct data via toPanelData()
- [ ] Check that serialization works (toJSON/fromJSON)
- [ ] Ensure delta pattern (only changed fields) is used
- [ ] Test in multi-turn conversation: does AI see updated context on next turn?

---

## 📞 File Locations

| What | File |
|------|------|
| TripBook class | `/models/trip-book.js` |
| update_trip_info tool | `/tools/update-trip-info.js` |
| System prompt builder | `/prompts/system-prompt.js` |
| Tool registry | `/tools/index.js` |
| Integration point | `/server.js` (or wherever tripBook instantiated) |

---

## 🚀 Example: End-to-End Flow

```
User: "I want to go to Japan in May, 2万/person, 2 people"
  ↓
System Prompt Built: includes empty TripBook section
  ↓
AI Calls: update_trip_info({
  constraints: { destination, dates, people, budget, ... },
  phase: 1,
  itinerary: { route: ["Tokyo","Kyoto","Osaka"], days: [...] }
})
  ↓
Tool Returns: { success: true, updates: {...}, message: "..." }
  ↓
Server Applies:
  - tripBook.updateConstraints(...)
  - tripBook.updatePhase(1)
  - tripBook.updateItinerary(...)
  ↓
Server Sends: tripBook.toPanelData() to frontend
  ↓
Frontend: Right panel shows day skeleton
  ↓
Next Turn AI:
  - Gets system prompt with TripBook context
  - Sees "## 用户已确认信息（勿重复询问）" with ✅ marks
  - Knows NOT to re-ask those questions
  - Proceeds with planning forward
```

---

Generated: 2026-04-12
Location: `/Users/geraldhuang/DEV/ai-travel-planner/`
