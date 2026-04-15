# Sub-Agent Removal Refactoring - Quick Reference

## Current State
- **Main System Prompt**: `prompts/system-prompt.js` (187 lines)
- **Sub-Agents**: booking, activity, knowledge in `agents/prompts/`
- **Tool Selection**: 8 direct tools + delegate_to_agents in server.js

---

## What Changes When Removing Sub-Agents

### Before: Delegation-Based
```javascript
delegate_to_agents([
  { agent: 'booking', task: 'Search flights to Tokyo on May 1-5' },
  { agent: 'activity', task: 'Find restaurants in Shibuya' }
])
```
→ Sub-agents get their own prompts, full delegation context, dedicated API calls

### After: Direct Tool Calling
```javascript
// Main agent directly calls:
search_flights({ origin: 'PVG', destination: 'NRT', start_date: '2026-05-01', ... })
search_poi({ query: 'restaurants', location: 'Shibuya, Tokyo', ... })
web_search({ query: 'Michelin restaurants Tokyo' })
get_weather({ city: 'Tokyo', start_date: '2026-05-01', end_date: '2026-05-05' })
get_exchange_rate({ from: 'USD', to: 'CNY' })
```

---

## Migration Checklist

### Step 1: Update System Prompt (`prompts/system-prompt.js`)
- [ ] Keep lines 110-119 (delegation section) but ADD deprecation note
- [ ] Expand lines 121-156 (Direct Tool Availability) with detailed strategies:
  - [ ] **search_flights**: Add booking agent's flight strategy (multi-airport, ±3 days, budget airlines)
  - [ ] **search_hotels**: Add booking agent's hotel strategy (platform discovery, neighborhoods, price tiers)
  - [ ] **search_poi**: Add activity agent's POI strategy (≥4.0 ratings, neighborhood searches)
  - [ ] **web_search**: Consolidate all 3 agents' web search strategies
  - [ ] **get_weather**: Add knowledge agent's weather guidance
  - [ ] **get_exchange_rate**: Clarify usage (every new currency, only once per pair, USD+CNY always)

### Step 2: Update Server.js
- [ ] **Line 101-102**: Review max tool round limits (currently 10)
  - Check if main agent needs more rounds for sequential tool calls
  - May need 15-20 rounds for complex research flows
- [ ] **Line 595-602**: Consider if delegationCount limit (currently 2) still applies
  - If removing delegation entirely, can delete this check
- [ ] **Optional**: Add tool call batching for parallel requests

### Step 3: Agent Cleanup
- [ ] Remove/deprecate `agents/delegate.js` 
- [ ] Remove/archive `agents/prompts/booking.js`, `activity.js`, `knowledge.js`
- [ ] Update `tools/index.js` if delegate tool needs removal

### Step 4: Testing
- [ ] Test single-destination trip (simple flow)
- [ ] Test multi-destination trip (complex research)
- [ ] Monitor tool call counts vs. before
- [ ] Verify response quality hasn't degraded
- [ ] Check token usage increase/decrease

---

## What Guidance to Add to Main Prompt

### For search_flights (Booking Agent Lines 25-78)
**Add to system prompt:**
```
### 机票搜索策略

#### 第一步：航空生态研究
查询该航线上有哪些航司，特别是被GDS漏掉的廉价航空：
- 亚洲廉航：AirAsia, Scoot, Jetstar, Cebu Pacific, VietJet
- 东亚廉航：Peach, Spring, HK Express, T'way, Jin Air
- 欧洲廉航：Ryanair, EasyJet, Vueling, Wizz Air
用 web_search 查询"[出发城市] [目的地] 直飞航班 航空公司"或"[航线] 廉价航空"

#### 第二步：多维度穷尽搜索
同时查询：
- 多出发机场（深圳：SZX+HKG+CAN；上海：PVG+SHA）
- 多目的机场（尤其小众目的地）
- 多日期（±3天，遇到无结果自动推后1-3天）
- 中转路线（直飞无结果或价格>直飞参考价200%时）
- **并行调用 search_flights，不要串行等待**

#### 第三步：结果展示
- 必须转换 USD → CNY
- 表格格式：出发机场 | 目的地 | 日期 | 航司 | 价格(USD) | 价格(CNY) | 时长 | 经停
- 标注红眼航班（22:00后起飞或06:00前落地）
- 若发现GDS漏掉的廉航，单独列出并标注"来源：官网参考价"
- 性价比评估：给出"最便宜"和"最舒适"两个方案
- 购票渠道：Google Flights / Skyscanner / 天巡
```

### For search_hotels (Booking Agent Lines 87-143)
**Add similar structured guidance**

### For search_poi (Activity Agent Lines 42-54)
**Emphasize:**
- 评分≥4.0，评论数≥100
- 按区域搜索（而非整个城市）
- 用 web_search 补充权威平台信息（Tabelog, Michelin, etc.）

### For web_search (All agents)
**Consolidate strategy:**
- For flights: airline ecosystem, GDS options, budget airlines
- For hotels: local platforms, neighborhood info, special accommodations
- For restaurants: local review platforms, Michelin/rankings
- For attractions: official tourism sites, ticket platforms, experiences
- For visas: official government sources, third-party verification

---

## Key Metrics to Track

### Before & After Comparison
| Metric | Before | After | Notes |
|--------|--------|-------|-------|
| Tool calls per trip | ? | ? | Monitor token efficiency |
| API calls | 8 tools + N delegates | 8 tools only | Fewer but more dense |
| Response latency | ? | ? | May increase due to sequential calls |
| Main agent rounds | ~5-7 | 10-20? | May need more iterations |
| LLM context depth | ? | ? | More tool strategies = larger prompt |
| Cost per trip | ? | ? | Fewer API calls but longer prompts |

---

## Prompt Size Estimate

### Current State
- Main prompt: ~9.3 KB
- Sub-agent prompts: booking (8.2 KB) + activity (8.6 KB) + knowledge (6.6 KB) = 23.4 KB
- Total per call: ~9.3 KB (main only)

### After Migration
- Expanded main prompt: ~15-20 KB (adding all sub-agent strategies)
- No sub-agent calls = fewer API roundtrips
- Trade-off: larger single prompt vs. multiple smaller prompts

---

## Potential Issues & Mitigations

| Issue | Mitigation |
|-------|-----------|
| Longer prompt = slower LLM response | Compress sub-agent strategies, use bullet points |
| More tool calls per main round = higher token usage | Batch tool calls, consolidate results |
| Less specialized agent = quality degradation | Extensive testing, detailed guidance in prompt |
| Tool round limit exhaustion | Increase MAX_TOOL_ROUNDS from 10 to 15-20 |
| User confusion (no stage indicators) | Add "I'm now searching for flights..." messages |

---

## Implementation Priority

### Phase 1: Prep (No User-Facing Changes)
1. [ ] Analyze sub-agent prompts, extract key strategies
2. [ ] Create detailed migration guide (this document ✅)
3. [ ] Prepare expanded main prompt draft

### Phase 2: Update Main Prompt (Low Risk)
1. [ ] Add flight strategy section
2. [ ] Add hotel strategy section
3. [ ] Add POI/restaurant strategy
4. [ ] Consolidate web_search guidance
5. [ ] Add weather/exchange rate nuance
6. [ ] Test in dev/staging

### Phase 3: Remove Delegation (High Risk)
1. [ ] Update server.js tool limits
2. [ ] Test direct tool calling
3. [ ] Monitor metrics
4. [ ] Gradual rollout (A/B test if possible)

### Phase 4: Cleanup (Post-Rollout)
1. [ ] Remove delegate.js
2. [ ] Remove unused agent prompt files
3. [ ] Clean up any delegation leftovers

---

## Testing Scenarios

### Scenario 1: Simple Single-City Trip
- Input: "Plan a 3-day Tokyo trip"
- Expected: ~2-3 rounds, straightforward tool calls
- Verify: Quality same as before?

### Scenario 2: Complex Multi-City + Research
- Input: "Help me plan a 2-week Japan trip with flights from Shanghai, visiting Tokyo/Kyoto/Osaka, need visa info, weather, 5-star hotels"
- Expected: ~8-12 rounds, heavy tool usage
- Monitor: Does it stay within MAX_TOOL_ROUNDS? Tool call volume?

### Scenario 3: Budget Flights + Niche Destination
- Input: "Cheapest way to get to Koh Samui from Beijing in June"
- Expected: Airline ecosystem research, multi-airport search, budget airline discovery
- Verify: Still finds obscure budget airlines?

---

## Success Criteria

✅ **Success if:**
- Main agent handles all 3 sub-agent responsibilities
- No degradation in recommendation quality
- Tool call volume ≤ 1.2x of current delegation model
- Response time < 30s for typical requests
- Token usage per trip similar or better

❌ **Roll back if:**
- Quality noticeably worse (missing deals, bad recommendations)
- Tool rounds exhausted frequently (>10% of calls)
- User complaints about "stage-less" experience
- Cost per trip > 20% higher

