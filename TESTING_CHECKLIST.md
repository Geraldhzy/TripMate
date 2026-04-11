# Testing Checklist for Recent Enhancements

**Last Updated:** 2026-04-11  
**Focus:** Two-column layout and day plan visualization

---

## UI/Frontend Testing

### Two-Column Layout
- [ ] Panel width correctly set to 520px
- [ ] Left column displays basic constraints
- [ ] Right column displays detailed itinerary
- [ ] Column ratio (2fr:3fr) is visually balanced
- [ ] Both columns scroll independently
- [ ] Scrollbars are visible when content overflows
- [ ] Layout works on different screen sizes

### Day Plan Rendering
- [ ] Day cards render with proper styling
- [ ] Day number badge displays correctly
- [ ] Date, city, and title appear in header
- [ ] Toggle arrow (▶) rotates on expand/collapse
- [ ] Collapsed state shows compact view
- [ ] Expanded state shows timeline

### Timeline Visualization
- [ ] Timeline dots are color-coded by type
  - [ ] Activity: Cyan (#0891b2)
  - [ ] Meal: Amber (#f59e0b)
  - [ ] Transport: Gray (#64748b)
  - [ ] Hotel: Purple (#8b5cf6)
- [ ] Timeline lines connect dots
- [ ] Time stamps align in grid layout
- [ ] Activity titles display correctly
- [ ] Location metadata shows with 📍 icon
- [ ] Duration appears when available
- [ ] Notes display in gray text
- [ ] Transport connections visible between activities

### Collapsible Functionality
- [ ] First click expands day
- [ ] Second click collapses day
- [ ] Multiple days can be expanded simultaneously
- [ ] Toggle state persists during conversation
- [ ] Clearing itinerary resets expanded state

### Budget Summary
- [ ] Budget section header displays
- [ ] Individual category items show amounts
- [ ] Total calculation shows correctly
- [ ] Remaining/overage logic works
  - [ ] Green text for remaining budget
  - [ ] Red text for budget overage

---

## Data Flow Testing

### SSE Message Handling
- [ ] `updateFromTripBook()` receives daysPlan data
- [ ] daysPlan array properly updates state
- [ ] `renderItinerary()` called after update
- [ ] No console errors on update

### Segment Data Structure
- [ ] Each segment has required fields:
  - [ ] time
  - [ ] title
  - [ ] location
  - [ ] duration
  - [ ] transport
  - [ ] transportTime
  - [ ] notes
  - [ ] type

- [ ] Missing fields default to empty strings
- [ ] Type values: 'activity', 'meal', 'transport', 'hotel'

### Route Visualization
- [ ] Route array renders as connected stops
- [ ] Arrow separators between cities
- [ ] City names display correctly
- [ ] No arrow after last city

---

## Integration Testing

### Planning Workflow
- [ ] Constraints update left column
- [ ] After goal confirmation, daysPlan populates
- [ ] Day cards appear in right column
- [ ] Timeline shows as day expands
- [ ] Budget summary updates with data

### Editing Constraints
- [ ] Inline edit buttons work
- [ ] Changes propagate to system
- [ ] Itinerary updates on constraint change
- [ ] Quick reply buttons still function

### Phase Progression
- [ ] Phase indicator updates
- [ ] Progress bar fills correctly (1/4 → 4/4)
- [ ] Layout adapts to each phase
- [ ] Content accumulates with progression

---

## Performance Testing

### Rendering Performance
- [ ] Panel renders smoothly with 7+ days
- [ ] No lag when expanding/collapsing days
- [ ] Timeline renders <100ms for 10+ segments
- [ ] Large content doesn't freeze UI

### Memory Usage
- [ ] expandedDays Set doesn't grow unbounded
- [ ] Clear functions properly free resources
- [ ] No memory leaks on multiple conversations

### CSS Optimization
- [ ] No layout thrashing on expand/collapse
- [ ] Grid layout efficient with many items
- [ ] Scrollbar rendering smooth

---

## Browser Compatibility
- [ ] Chrome 120+
- [ ] Firefox 121+
- [ ] Safari 17+
- [ ] Edge 120+

---

## Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Tab order is logical
- [ ] Color contrast meets WCAG AA
- [ ] Timeline dots are distinguishable (not color-only)
- [ ] Expanded/collapsed state indicated visually
- [ ] Text content readable without CSS

---

## Error Handling

### Edge Cases
- [ ] Empty daysPlan renders without error
- [ ] Missing segment fields default gracefully
- [ ] Very long activity titles wrap correctly
- [ ] Many segments (20+) render without crash
- [ ] Special characters in text escape correctly

### Error Recovery
- [ ] Console shows helpful error messages
- [ ] Invalid data structure handled gracefully
- [ ] Partial data renders what's available
- [ ] Broken JSON doesn't crash page

---

## Test Scenarios

### Scenario 1: Simple 3-Day Trip
```
Day 1: Arrival in Tokyo
- 14:30: Arrive at Narita
- 18:00: Check-in hotel
- 19:00: Dinner

Day 2: Tokyo Sightseeing
- 09:00: Breakfast
- 10:00: Senso-ji Temple
- 14:00: Lunch
- 15:00: Shinjuku shopping

Day 3: Departure
- 10:00: Check-out
- 12:00: Airport transfer
```
✓ Verify: All days visible, timeline correct, transport shown

### Scenario 2: Large Itinerary (10+ Days)
✓ Verify: Scroll performance, memory, responsive layout

### Scenario 3: Mixed Activity Types
✓ Verify: Color-coding accurate, dots display correctly

### Scenario 4: Expand All Days
✓ Verify: No performance degradation, scrolling smooth

### Scenario 5: Rapid Toggle
✓ Verify: Expand/collapse works rapidly without glitches

---

## CSS Regression Testing

### Style Consistency
- [ ] Font sizes readable
- [ ] Colors match design system
- [ ] Spacing/padding consistent
- [ ] Border styles applied
- [ ] Hover states work

### Responsive Design
- [ ] 1024px width (small screen)
- [ ] 1440px width (normal)
- [ ] 1920px width (large)
- [ ] Panel doesn't overflow

### Dark Mode (if applicable)
- [ ] Colors visible on dark background
- [ ] Contrast sufficient
- [ ] Timeline dots distinguishable

---

## Documentation Verification
- [ ] CURRENT_SESSION_PROGRESS.md accurate
- [ ] Code comments match implementation
- [ ] Function signatures documented
- [ ] Methodology updated correctly

---

## Sign-Off Checklist
- [ ] All UI tests pass
- [ ] Data flow verified
- [ ] Performance acceptable
- [ ] No regressions detected
- [ ] Code review completed
- [ ] Ready for production

---

**Testing By:** [Your Name]  
**Date Completed:** [Date]  
**Issues Found:** [Count]  
**Status:** [ ] Ready | [ ] Needs Work | [ ] In Progress
