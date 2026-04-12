# Refactoring Roadmap - Prioritized Action Plan

**Last Updated:** April 13, 2026  
**Total Estimated Effort:** 3-4 weeks  
**Team Size:** 1-2 developers  
**Risk Level:** LOW (changes are well-scoped and tested incrementally)

---

## Executive Summary

This project has ~1,500 lines of over-engineered, duplicated, or dead code that can be safely removed or simplified. Fixing these issues will:

1. **Eliminate the "re-asks confirmed questions" bug** (30 min fix)
2. **Reduce codebase by 33%** (1,530 LOC → 3,070 LOC)
3. **Make future changes 50% faster** (less complexity to understand)
4. **Improve performance** (fewer iterations, simpler logic)
5. **Reduce bugs** (fewer edge cases)

---

## Phase 1: Critical Fixes (1 day)

### Priority: P0 - Must Do First

These fixes are bug fixes with high impact and low risk.

#### 1.1 Fix TripBook Snapshot Restoration Bug (30 min)

**File:** `server.js` lines 186-236  
**Severity:** CRITICAL (causes "re-asks confirmed questions" bug)  
**Change Type:** Bug fix  
**Risk:** LOW

```javascript
// BEFORE (problematic)
try {
  if (req.body.tripbookSnapshot) {
    const restored = JSON.parse(req.body.tripbookSnapshot);
    mainAgent.tripbook.restore(restored);
  }
} catch (err) {
  log.warn('TripBook 快照恢复失败', err); // ← Silent failure!
}

// AFTER (fixed)
if (req.body.tripbookSnapshot) {
  try {
    const restored = JSON.parse(req.body.tripbookSnapshot);
    mainAgent.tripbook.restore(restored);
    log.info('TripBook restored successfully');
  } catch (err) {
    log.error('TripBook restore failed', { error: err.message });
    return res.status(400).json({ 
      error: 'Could not restore trip data',
      detail: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}
```

**Testing:**
- Test with valid snapshot: Should restore constraints
- Test with invalid snapshot: Should return 400 error
- Test with corrupted JSON: Should return error
- Verify AI doesn't re-ask confirmed questions

**Checklist:**
- [ ] Update server.js lines 186-236
- [ ] Test with valid/invalid snapshots
- [ ] Verify error message is helpful to users
- [ ] Commit with message: "Fix: Make TripBook restoration failures loud"

---

#### 1.2 Remove TripBook Dead Code (30 min)

**File:** `models/trip-book.js`  
**Change Type:** Dead code removal  
**Risk:** LOW

```javascript
// DELETE these lines:
// Line 50: this._history = [];
// Line 234: this._history.push({...});
// Lines 60-80: this.knowledgeRefs and related code
// Lines: this.flightQuotes = [];
// Lines: this.hotelQuotes = [];
// Lines: this.webSearches = [];
// Any methods that only reference the above
```

**Verification:**
- Search codebase for `_history` - should find zero results
- Search for `knowledgeRefs` - should find zero results
- Search for `flightQuotes`, `hotelQuotes`, `webSearches` - should find zero results
- Tests should still pass

**Checklist:**
- [ ] Remove _history tracking
- [ ] Remove unused Layer 1 (knowledgeRefs)
- [ ] Remove unused Layer 2 properties
- [ ] Run tests: `npm test`
- [ ] Commit: "Clean: Remove dead code from TripBook"

---

#### 1.3 Simplify Constraint Building (1 hour)

**File:** `models/trip-book.js`  
**Change Type:** Simplification  
**Risk:** LOW-MEDIUM

**Methods to simplify:**
1. `updateConstraints()` - 47 → 10 lines
2. `buildConstraintsPromptSection()` - 60 → 15 lines

```javascript
// SIMPLIFY updateConstraints (47 → 10 lines)
// OLD: 47 lines with validation, merging, history, events
// NEW: Simple assignment
updateConstraints(constraints) {
  Object.assign(this.constraints, constraints);
}

// SIMPLIFY buildConstraintsPromptSection (60 → 15 lines)
// OLD: 60 lines with per-constraint-type formatting
// NEW: Generic formatting
buildConstraintsPromptSection() {
  const entries = Object.entries(this.constraints)
    .filter(([k, v]) => v != null)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n');
  
  return entries.length > 0 
    ? `# User Constraints\n${entries}`
    : '';
}

// KEEP toPanelData() for now (will refactor in Phase 2)
```

**Testing:**
- Test constraint updates: Should merge correctly
- Test prompt generation: Should include all constraints
- Test with empty constraints: Should return empty string
- Run integration tests

**Checklist:**
- [ ] Simplify updateConstraints()
- [ ] Simplify buildConstraintsPromptSection()
- [ ] Test with various constraint combinations
- [ ] Commit: "Refactor: Simplify TripBook methods"

---

### Phase 1 Summary

**Time:** ~2 hours  
**LOC Reduction:** ~100 lines  
**Impact:** Fixes major bug + cleaner code

**Before Testing:**
- [ ] All three tasks completed
- [ ] No console errors
- [ ] Tests pass: `npm test`

**After Phase 1 Success:** Commit to git with tag `v0.1-cleanup`

---

## Phase 2: Backend Simplifications (2-3 days)

### Priority: P0-P1 - High Impact

#### 2.1 Simplify Quick Replies Extraction (2 hours)

**Files:** 
- `server.js` lines 472-665 (194 lines → 20 lines)
- `prompts/system-prompt.js` (add format requirement)

**Change Type:** Refactoring + prompt update  
**Risk:** MEDIUM (changes LLM output format)

**Steps:**

1. **Update system prompt:**
```javascript
// In system-prompt.js, add after the phase definitions:
/*
Quick Reply Format
==================

When providing quick reply suggestions, ALWAYS use this exact format:

\`\`\`json
{
  "quick_replies": [
    { "text": "Add this destination", "action": "add_destination" },
    { "text": "Check flights", "action": "search_flights" },
    { "text": "Save this itinerary", "action": "save_itinerary" }
  ]
}
\`\`\`

IMPORTANT:
- Always use markdown code block with json language tag
- Each reply must have "text" and "action" fields
- Maximum 5 replies per response
- Never use any other format
*/
```

2. **Simplify extraction:**
```javascript
// server.js - REPLACE lines 472-665 with:
function extractQuickReplies(text) {
  try {
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (!match) return null;
    
    const data = JSON.parse(match[1]);
    if (!Array.isArray(data.quick_replies)) return null;
    
    return data.quick_replies
      .filter(q => q.text && q.action && typeof q.text === 'string')
      .slice(0, 5);
  } catch (err) {
    log.debug('Quick replies extraction failed');
    return null;
  }
}
```

3. **Remove constraint validation:**
- Delete all constraint validation logic
- Trust that LLM provides valid options

**Testing:**
1. Test with LLM output that includes quick replies
   ```
   Here's my suggestion:
   ```json
   { "quick_replies": [{ "text": "Add Dubai", "action": "add_destination" }] }
   ```
   ```
   Expected: Extract correctly

2. Test with no quick replies
   ```
   I don't have quick suggestions for this.
   ```
   Expected: Return null

3. Test with invalid JSON
   ```
   ```json
   { invalid json }
   ```
   ```
   Expected: Return null, log debug message

4. Test with 6 quick replies
   ```
   ```json
   { "quick_replies": [... 6 items ...] }
   ```
   ```
   Expected: Return first 5 only

**Checklist:**
- [ ] Update system prompt with format requirement
- [ ] Replace extraction function (194 → 20 lines)
- [ ] Test 4 scenarios above
- [ ] Test existing tests still pass
- [ ] Verify no quick_replies in output breaks gracefully
- [ ] Commit: "Refactor: Simplify quick replies extraction"

---

#### 2.2 Extract Unified Agent Loop (3-5 days)

**Files:** 
- Create new: `lib/agent-loop.js` (300 lines)
- Update: `server.js` (remove 100 lines from main OpenAI loop)
- Update: `agents/sub-agent-runner.js` (remove 144 lines of duplicated loops)

**Change Type:** Major refactoring  
**Risk:** HIGH (replaces core logic) - mitigate with comprehensive testing

**High-level approach:**
1. Extract common logic to new `runAgentLoop()` function
2. Create provider adapters (OpenAI format, Anthropic format)
3. Replace both main loop and sub-agent loops with calls to unified function
4. Comprehensive testing at each step

**Benefit:**
- Eliminates 250+ lines of duplicated code
- Single source of truth for agent behavior
- Much easier to add new providers
- Easier to fix bugs (fix once, applies everywhere)

**This is a complex refactoring. DO NOT START until Phase 1 is complete and tested.**

**Checklist:**
- [ ] Create `lib/agent-loop.js` with unified function
- [ ] Create provider adapter functions
- [ ] Update server.js main loop to use new function
- [ ] Update sub-agent-runner.js to use new function
- [ ] Comprehensive testing of both paths
- [ ] Commit: "Refactor: Extract unified agent loop"

---

#### 2.3 Consolidate Middleware (3 hours)

**Files:** 
- `middleware/security.js` (160 → 40 lines)
- `middleware/validation.js` (228 → 30 lines)

**Change Type:** Simplification  
**Risk:** LOW (security implications require careful review)

**Changes:**

**security.js:**
```javascript
// BEFORE: 160 lines with complex CSP, helmet, headers
// AFTER: 40 lines with simple defaults

const helmet = require('helmet');
const cors = require('cors');

// Use Helmet defaults - it's battle-tested
app.use(helmet());

// Simple CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '10mb' }));

// Custom error handlers if needed
app.use((err, req, res, next) => {
  if (err.status === 429) { // Rate limit
    return res.status(429).json({ error: 'Too many requests' });
  }
  next(err);
});
```

**validation.js:**
```javascript
// BEFORE: 228 lines of Joi schemas
// AFTER: 30 lines of simple checks

const validateRequest = (schema) => (req, res, next) => {
  const errors = [];
  for (const [key, rules] of Object.entries(schema)) {
    const value = req.body[key];
    if (rules.required && !value) {
      errors.push(`${key} is required`);
    }
    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push(`${key} must be string`);
    }
  }
  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }
  next();
};

// Usage
app.post('/api/chat', validateRequest({
  message: { required: true, type: 'string' },
  provider: { required: true, type: 'string' }
}), chatHandler);
```

**Warnings:**
- Review security implications before deploying
- Test CORS with production domain before releasing
- CSP removal might expose to some attacks - verify acceptable risk

**Checklist:**
- [ ] Review Helmet defaults - are they acceptable?
- [ ] Test CORS with actual frontend
- [ ] Test validation still catches errors
- [ ] Security review by team
- [ ] Commit: "Refactor: Consolidate middleware"

---

### Phase 2 Summary

**Time:** 5-7 hours  
**LOC Reduction:** 400+ lines  
**Risk Level:** MEDIUM (due to agent loop refactoring)

**Milestones:**
1. ✓ Quick replies working with new format (2 hours)
2. ✓ All tests pass after simplification (30 min)
3. ✓ Unified agent loop functioning (3-5 days)
4. ✓ Middleware simplified (3 hours)

**Success Criteria:**
- [ ] All existing tests pass
- [ ] No console errors
- [ ] Agent loops produce same results as before
- [ ] Chat requests work end-to-end

---

## Phase 3: Frontend Refactoring (1.5-2 weeks)

### Priority: P1-P2 - Medium Impact

#### 3.1 Move Translations to Backend (1 day)

**Files:**
- Create: `backend/routes/i18n.js`
- Update: `public/js/itinerary.js` (remove 78 lines)

**Benefit:**
- Can update translations without redeploying frontend
- Supports multiple languages
- Removes hardcoded data from frontend

**Implementation:**
```javascript
// backend/routes/i18n.js
router.get('/api/i18n', (req, res) => {
  const lang = req.query.lang || 'zh';
  const translations = {
    weather: {
      'Rainy': lang === 'zh' ? '下雨' : 'Rainy',
      'Sunny': lang === 'zh' ? '晴天' : 'Sunny',
      // ...
    },
    cities: {
      'Kuala Lumpur': lang === 'zh' ? '吉隆坡' : 'Kuala Lumpur',
      // ...
    }
  };
  res.json(translations);
});

// frontend/public/js/itinerary.js
const translations = await fetch(`/api/i18n?lang=zh`).then(r => r.json());
const weatherZh = translations.weather;
const citiesZh = translations.cities;
```

**Checklist:**
- [ ] Create backend i18n endpoint
- [ ] Update frontend to fetch translations
- [ ] Remove translation tables from itinerary.js (78 lines)
- [ ] Test with multiple languages
- [ ] Commit: "Feature: Move translations to backend"

---

#### 3.2 Refactor Itinerary Tabs with Templates (3-5 days)

**File:** `public/js/itinerary.js` (1201 → 400 lines)  
**Change Type:** Major refactoring  
**Risk:** MEDIUM (UI changes, extensive testing needed)

**Approach:**
1. Define tab templates as data structures
2. Create generic `renderTab()` function
3. Replace 9 specific rendering functions with template-driven approach
4. Consolidate event handling

**Implementation outline:**
```javascript
// Define templates once
const TAB_CONFIG = {
  transport: {
    title: 'Transportation',
    items: 'transport.flights',
    template: `
      <div class="flight-card">
        <h4>{{from}} → {{to}}</h4>
        <p>{{airline}} • {{departure}}</p>
        <p class="price">${{price}}</p>
        <button class="btn-select">Select</button>
      </div>
    `,
    actions: { select: handleFlightSelect }
  },
  // ... other tabs
};

// Single render function
function renderTab(tabName) {
  const config = TAB_CONFIG[tabName];
  const items = getItems(config.items);
  const html = items
    .map(item => renderTemplate(config.template, item))
    .join('');
  document.getElementById('tab-content').innerHTML = html;
}

// Generic template renderer
function renderTemplate(template, data) {
  return template.replace(/{{(\w+)}}/g, (_, key) => data[key] ?? '');
}
```

**Benefit:**
- Reduces 1201 → 400 lines (67% reduction!)
- Easier to add new tabs (1 line instead of 80)
- Consistent styling across tabs
- Easier to maintain

**Testing:**
- Test each tab renders correctly
- Test data updates re-render properly
- Test all buttons/interactions work
- Test with empty data
- Manual UI testing across browsers

**Checklist:**
- [ ] Create TAB_CONFIG structure
- [ ] Implement generic renderTab() function
- [ ] Replace tab-specific functions one by one
- [ ] Test each tab during replacement
- [ ] Full UI testing
- [ ] Commit: "Refactor: Consolidate itinerary tabs (1201 → 400 lines)"

---

#### 3.3 Simplify Global State (2 days)

**File:** `public/js/itinerary.js`  
**Change Type:** Refactoring  
**Risk:** LOW-MEDIUM

**Before:**
```javascript
let itineraryState = {
  // 28 granular fields
  currentPhase: null,
  selectedDay: null,
  selectedFlight: null,
  flightDetails: {},
  // ... 24 more
};
```

**After:**
```javascript
let itineraryState = {
  phase: 'planning', // planning | booking | packing | traveling
  selection: { dayId: null, flight: null, hotel: null },
  transport: { flights: [], selected: null },
  accommodation: { hotels: [], selected: null },
  dining: { restaurants: [], selected: null },
  activities: { attractions: [], selected: null }
};
```

**Migration:**
- Update all references systematically
- Test at each step
- Update event handlers
- Update UI renderers

**Checklist:**
- [ ] Create new state structure
- [ ] Update all references
- [ ] Test state updates work correctly
- [ ] Commit: "Refactor: Simplify itinerary state"

---

### Phase 3 Summary

**Time:** 1.5-2 weeks  
**LOC Reduction:** 800+ lines  
**Risk Level:** MEDIUM (extensive UI changes)

**Milestones:**
1. ✓ Translations moved to backend (1 day)
2. ✓ Tabs refactored to template-driven (3-5 days)
3. ✓ State simplified (2 days)

---

## Phase 4: Optional Long-term Improvements (2-3 weeks)

### Priority: P2-P3 - Nice to Have

#### 4.1 Modernize with Vue.js or React
- Would reduce frontend by 50%
- Proper component architecture
- Reactive data binding
- Estimated: 1.5-2 weeks

#### 4.2 Implement Proper i18n
- Support multiple languages fully
- Extract all strings to translation files
- Estimated: 1 week

#### 4.3 Create Reusable Component Library
- Standardize UI patterns
- Reduce CSS duplication
- Estimated: 1 week

---

## Implementation Timeline

### Week 1 (Phase 1 + 2.1)
- Mon-Tue: Phase 1 (critical fixes)
- Wed-Fri: Phase 2.1 (quick replies)
- **Deliverable:** Cleaner codebase, "re-asking" bug fixed

### Week 2 (Phase 2.2 + 2.3)
- Mon-Wed: Phase 2.2 (unified agent loop) - COMPLEX
- Thu-Fri: Phase 2.3 (middleware)
- **Deliverable:** 250+ duplicate lines eliminated

### Week 3-4 (Phase 3)
- Ongoing: Itinerary.js refactoring (3-5 days)
- Ongoing: Frontend state simplification (2 days)
- Integration testing across phases
- **Deliverable:** Frontend code reduced by 800+ lines

---

## Risk Mitigation

### Testing Strategy

**Unit Tests (after each phase):**
```bash
npm test
```

**Integration Tests (after major changes):**
- Test complete chat flow end-to-end
- Test with multiple providers (OpenAI, Anthropic, DeepSeek)
- Test snapshot save/restore cycle

**Manual Testing:**
- Every browser (Chrome, Firefox, Safari)
- Mobile view
- Network latency simulation (DevTools throttling)

### Rollback Plan

**If anything breaks:**
1. Revert to previous commit: `git revert HEAD`
2. Debug in separate branch
3. Fix and test before merging again

### Version Tagging

- `v0.1-critical-fixes` - After Phase 1
- `v0.2-backend-cleanup` - After Phase 2
- `v0.3-frontend-refactor` - After Phase 3

---

## Success Metrics

| Metric | Current | Target | Phase |
|--------|---------|--------|-------|
| Total LOC | ~4,600 | ~3,100 | 3 |
| Code duplication | 314 LOC | 0 | 2.2 |
| Dead code | 100+ LOC | 0 | 1 |
| "Re-asks" bug | BROKEN | FIXED | 1.1 |
| TripBook clarity | COMPLEX | SIMPLE | 1.3 |
| itinerary.js | 1201 LOC | 400 LOC | 3 |
| Test coverage | TBD | >80% | All |
| Performance | TBD | 20% faster | All |

---

## Questions Before Starting?

- [ ] Is the timeline realistic for your team?
- [ ] Do you want to tackle this all at once or staggered?
- [ ] Should we deploy each phase or wait for all to be complete?
- [ ] Any other areas you'd like prioritized?

---

## Next Steps

1. **Review this roadmap** with your team
2. **Discuss timeline** and resource allocation
3. **Start with Phase 1** (lowest risk, high impact)
4. **Use git branches** for each phase
5. **Document any issues** found during refactoring
6. **Celebrate clean code!** 🎉

