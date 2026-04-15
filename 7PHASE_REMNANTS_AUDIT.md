═══════════════════════════════════════════════════════════════════════════════
7-PHASE SYSTEM REMNANTS AUDIT REPORT
═══════════════════════════════════════════════════════════════════════════════

EXECUTIVE SUMMARY
─────────────────
The codebase contains CRITICAL REMNANTS of an old 7-phase system that must be
removed or updated. The app is currently deployed with only 4 phases but has
leftover code that validates/processes phases 5-7.

Current System Status:
  • Deployed system: 4 phases only
  • Validation in code: Allows phases 1-7
  • Phase mapping: Internal 1-7 → Display 1-4 (WORKING AS INTENDED)

CRITICAL ISSUES FOUND
─────────────────────────────────────────────────────────────────────────────

1. ⚠️ VALIDATION BUG: Phase Range Allows Up To 7
   ─────────────────────────────────────────────
   FILE:    tools/update-trip-info.js
   LINES:   123-124
   CODE:    if (phase < 1 || phase > 7) {
            return JSON.stringify({ error: 'phase 必须在 1-7 之间' });
   
   ISSUE:   Phase validation allows phases 5, 6, 7 even though:
            - UI only displays 4 phases
            - System prompt only defines 4 phases
            - Database schema expects 4 phases
   
   IMPACT:  • AI could mistakenly set phase to 5, 6, or 7
            • Frontend phase display might not handle phases > 4
            • Causes inconsistency between internal and display state

   FIX:     Change line 123 to: if (phase < 1 || phase > 4) {

───────────────────────────────────────────────────────────────────────────────

2. ⚠️ TOOL DESCRIPTION REFERENCES PHASES 1-7
   ─────────────────────────────────────
   FILE:    tools/update-trip-info.js
   LINE:    42
   CODE:    description: '当前规划阶段（1-7）：1锁定约束 2机票查询 3构建框架 4关键预订 5每日详情 6预算汇总 7导出总结'
   
   ISSUE:   Tool definition describes ALL 7 phases:
            1锁定约束 (Lock constraints)
            2机票查询 (Flight search)
            3构建框架 (Build framework)
            4关键预订 (Key bookings)
            5每日详情 (Daily details)        ← PHASE 5 (REMOVED)
            6预算汇总 (Budget summary)      ← PHASE 6 (REMOVED)
            7导出总结 (Export summary)      ← PHASE 7 (REMOVED)
   
   IMPACT:  • AI's tool definition includes phases that don't exist
            • Tool descriptions are used by AI to understand its capabilities
            • Misleads AI into thinking it can set phases 5, 6, 7

   FIX:     Update description to reference only 1-4 phases with current labels:
            1锁定约束 2机票查询 3构建框架 4预算总结

───────────────────────────────────────────────────────────────────────────────

3. ⚠️ PHASE 7 TRIGGERING LOGIC IN SERVER
   ─────────────────────────────
   FILE:    server.js
   LINE:    758
   CODE:    if (args.itinerary?.budgetSummary || args.phase === 4 || args.phase === 7) {
              inferredPhase = 4;
            }
   
   ISSUE:   Server checks for phase === 7 as a trigger to set display phase to 4
            • Vestigial code from old 7-phase system
            • Suggests phase 7 was used for final export/summary
            • Now redundant since max phase is 4
   
   IMPACT:  • Dead code, but misleading during maintenance
            • Comments suggest internal phases 1-7 were mapped to display 1-4
            • Could confuse future developers

   FIX:     Remove the "|| args.phase === 7" condition:
            if (args.itinerary?.budgetSummary || args.phase === 4) {

───────────────────────────────────────────────────────────────────────────────

4. ℹ️ PHASE MAPPING COMMENTS (INFORMATIONAL)
   ───────────────────────────────
   FILE:    server.js
   LINES:   307-312
   CODE:    // AI 内部 phase 1-7 → 面板 phase 1-4 映射
            let displayPhase = updates.phase;
            if (displayPhase <= 1) displayPhase = 1;
            else if (displayPhase <= 3) displayPhase = 2;
            else if (displayPhase <= 5) displayPhase = 3;
            else displayPhase = 4;
   
   STATUS:  ✓ WORKING CORRECTLY
            This is intentional phase mapping and working as designed.
            Comments correctly document the mapping strategy.
   
   CONTEXT: The mapping was designed to compress internal phases to 4 display phases:
            - Internal 1 → Display 1
            - Internal 2-3 → Display 2
            - Internal 4-5 → Display 3
            - Internal 6-7 → Display 4

───────────────────────────────────────────────────────────────────────────────

5. ℹ️ DOCUMENTATION REFERENCES (INFORMATIONAL)
   ───────────────────────────────────
   The following files contain documentation about the 7-phase system.
   These are reference/doc files, not active code, but should be updated
   for clarity:
   
   • PRACTICAL_INFO_ANALYSIS.md:136 — Documents phase 1-7 range
   • prompts/system-prompt.js:85 — References "第1-7天" (days 1-7, not phases)
   • docs/ARCHITECTURE.md — References 7-phase methodology
   • docs/PRD.md:104 — References Phase 1-7 in PRD

───────────────────────────────────────────────────────────────────────────────

CORRECTED PHASE MAPPING (After Fix)
───────────────────────────────────────────────────────────────────────────────

Current State (4 Phases Only):

Phase 1: 了解需求 (Understand Requirements)
  • Gather destination, dates, budget, preferences
  • Confirm user constraints
  • TRIGGER: Initial conversation / constraint confirmation

Phase 2: 规划框架 (Plan Framework)
  • Search flights + research destination
  • Build route and daily structure
  • TRIGGER: Delegate to agents for flights + research

Phase 3: 完善详情 (Refine Details)
  • Add attractions, meals, accommodations
  • Fill in daily segments
  • TRIGGER: Search POIs, hotels, finalize daily plans

Phase 4: 预算总结 (Budget Summary)
  • Generate complete itinerary summary
  • Calculate and present budget breakdown
  • TRIGGER: budgetSummary field in update_trip_info

───────────────────────────────────────────────────────────────────────────────

RECOMMENDED FIXES
─────────────────────────────────────────────────────────────────────────────

HIGH PRIORITY (Must Fix):
─────────────────────────

[1] tools/update-trip-info.js : Line 123
    FROM: if (phase < 1 || phase > 7) {
    TO:   if (phase < 1 || phase > 4) {
    
    FROM: return JSON.stringify({ error: 'phase 必须在 1-7 之间' });
    TO:   return JSON.stringify({ error: 'phase 必须在 1-4 之间' });

[2] tools/update-trip-info.js : Line 42
    FROM: description: '当前规划阶段（1-7）：1锁定约束 2机票查询 3构建框架 4关键预订 5每日详情 6预算汇总 7导出总结'
    TO:   description: '当前规划阶段（1-4）：1锁定约束 2机票查询 3构建框架 4预算总结'
    
    (Or keep with context that the 7-phase is internal, map to 4 for display)

[3] server.js : Line 758
    FROM: if (args.itinerary?.budgetSummary || args.phase === 4 || args.phase === 7) {
    TO:   if (args.itinerary?.budgetSummary || args.phase === 4) {

MEDIUM PRIORITY (Nice to Have):
──────────────────────────────

[4] Update documentation files to remove references to 1-7 phase system:
    • PRACTICAL_INFO_ANALYSIS.md line 136
    • docs/PRD.md line 104
    • docs/ARCHITECTURE.md line 298, 134

[5] Clarify comments in server.js line 307 to explain the mapping is for
    historical compatibility or internal state management

───────────────────────────────────────────────────────────────────────────────

VERIFICATION CHECKLIST
──────────────────────────────────────────────────────────────────────────────

After applying fixes, verify:
  ☐ Phase validation in update-trip-info.js rejects phases > 4
  ☐ Error message updated to say "1-4" instead of "1-7"
  ☐ Tool description updated to list only 4 phases
  ☐ Phase 7 condition removed from server.js line 758
  ☐ All tests pass with phase values 1-4
  ☐ Frontend correctly displays 4-phase progress bar
  ☐ AI doesn't attempt to set phase > 4
  ☐ TripBook validation enforces phase <= 4

═══════════════════════════════════════════════════════════════════════════════
