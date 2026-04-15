# Main Agent System Prompt Analysis

## Executive Summary
The main agent already has comprehensive guidance for using tools directly. When you remove sub-agents, the main agent will be able to call `search_hotels`, `search_poi`, `web_search`, `get_weather`, etc. directly. The system prompt is well-structured and already contains detailed tool usage strategies.

---

## 1. File Structure & Import Path

### Main System Prompt Builder Location
- **File**: `prompts/system-prompt.js`
- **Size**: 9,387 bytes (187 lines)
- **Function**: `buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook)`

### How It's Imported
In `server.js` (line 11):
```javascript
const { buildSystemPrompt } = require('./prompts/system-prompt');
```

### How It's Called
In `server.js` (line 178):
```javascript
const systemPrompt = buildSystemPrompt(conversationText, knownRates, knownWeather, tripBook);
```

---

## 2. System Prompt Assembly Architecture

The `buildSystemPrompt()` function dynamically constructs the system prompt by concatenating multiple sections in this order:

### Section 1: Current Time & Holiday Knowledge (Lines 12-25)
- Injects current date/time in Beijing timezone (UTC+8)
- Adds holiday calendar for the year
- Used for date calculations and holiday name recognition

### Section 2: Cached Exchange Rates (Lines 27-36)
- Only if `tripBook` is null (legacy mode)
- Instructs agent NOT to re-call `get_exchange_rate` for known pairs
- Format: `1 CNY = X USD (updated: ...)`

### Section 3: Cached Weather (Lines 38-50)
- Only if `tripBook` is null (legacy mode)
- Instructs agent NOT to re-call `get_weather` for known cities
- Summarizes 3-day forecast preview

### Section 4: Core Agent Instructions (Lines 53-156)
**This is the main guidance section** including:

#### 4a. Role Definition (Lines 54-66)
- Professional travel planning assistant
- Can call tools directly or delegate to sub-agents
- Must verify all prices/policies via tools
- Never fabricate information
- Reference sources: `[Source: Display Text](URL)`

#### 4b. Progressive Planning Methodology (Lines 69-105)
**Key guidance for tool usage timing:**
- **Phase 1 - Lock constraints**: Confirm dates, destinations, budget, people
- **Phase 2 - Major transport**: Call tools for flights
- **Phase 3 - Fill itinerary**: Call tools for attractions, food, hotels
- **Phase 4 - Summary**: Write reminders and budget

#### 4c. Tool Usage Strategy (Lines 108-156)
**THIS IS CRITICAL FOR YOUR REFACTORING**

##### Sub-Agent Delegation Strategy (Lines 110-119)
```
| Agent | Domain | Typical Tasks |
|-------|--------|---------|
| booking | Flights, hotels, transport | search_flights, search_hotels |
| activity | Attractions, restaurants | search_poi, attractions info |
| knowledge | Destination info | visa, weather, basics |

⚠️ Max 2 sub-agents per delegation
```

**When you remove sub-agents, the main agent will call these tools directly instead of delegating.**

##### Direct Tool Availability (Lines 121-132)
The main agent CAN ALREADY access these tools directly:

| Tool | Purpose | Already in Main Prompt |
|------|---------|----------------------|
| `web_search` | General web search | ✅ Yes (line 125) |
| `get_weather` | Weather forecast | ✅ Yes (line 126) |
| `get_exchange_rate` | Currency conversion | ✅ Yes (line 127) |
| `search_poi` | POI/restaurant search | ✅ Yes (line 128) |
| `search_flights` | Flight search | ✅ Yes (line 129) |
| `search_hotels` | Hotel search | ✅ Yes (line 130) |
| `cache_destination_knowledge` | Store knowledge | ✅ Yes (line 131) |
| `update_trip_info` | Update itinerary | ✅ Yes (line 132) |

#### 4d. update_trip_info Call Timing (Lines 134-139)
Key points for your refactoring:
1. After user confirms constraints
2. Immediately after locking dates to create skeleton
3. When recording flights/hotels/weather
4. When filling daily segments
5. In final summary for reminders

#### 4e. Segment Type Rules (Lines 141-148)
Guidance for segment classification:
- `transport` - any movement
- `attraction` - sightseeing
- `activity` - experiences (diving, spa, etc.)
- `meal` - dining
- `hotel` - lodging
- `flight` - air travel

#### 4f. Destination Knowledge Library (Lines 150-152)
- Organized by country → city (two-level hierarchy)
- Main agent checks conversation for destination names
- Injects relevant cached knowledge

#### 4g. Source Attribution Rules (Lines 154-156)
Always mark: visa policies, ticket times, prices, weather, exchange rates
Format: `[Source: Website Name](URL)`

### Section 5: Injected Cached Destination Knowledge (Lines 158-169)
- If conversation mentions a cached destination, injects its full knowledge section
- Includes freshness label (today vs N days ago)
- Main agent uses this to avoid re-searching

### Section 6: TripBook Reference Section (Lines 171-181)
- If `tripBook` object exists, calls `tripBook.toSystemPromptSection()`
- Injects current constraints, itinerary, phase, reminders
- Serves as running "state of the trip"

---

## 3. What Guidance Exists for Each Tool

### Current Guidance in Main System Prompt

#### search_hotels (Line 130)
**Current Guidance**: "搜索酒店价格" (Search hotel prices)
- Line 93: Delegate to booking Agent
- Line 130: Listed as direct available tool
- **Need to Add**: Migrate booking agent's detailed hotel strategy (lines 87-143 from booking.js)

#### search_poi (Line 128)
**Current Guidance**: "搜索餐厅、景点等地点信息和坐标" (Search restaurants, attractions, location info and coordinates)
- No delegate guidance (because activity agent does this differently)
- **Need to Add**: POI search strategy from activity agent (search by region, focus on ratings ≥4.0, etc.)

#### web_search (Line 125)
**Current Guidance**: "搜索签证政策、景点信息等" (Search visa policies, attraction info, etc.)
- Line 122: For "direct available tools"
- No detailed strategy currently
- **Need to Add**: Web search strategy from all 3 sub-agents:
  - Booking: airline ecosystem, hotel platforms, pricing research
  - Activity: restaurant platforms, attraction info, booking channels
  - Knowledge: visa sources, weather data, safety info

#### get_weather (Line 126)
**Current Guidance**: "查询**出行期间**天气（必须传 start_date + end_date）" (Query weather during travel **must pass start_date + end_date**)
- Clear guidance on date requirements
- Knowledge agent has: historical climate reference, seasonal warnings
- **Need to Add**: When to query (before finalizing dates), how to use climate vs forecast data

#### get_exchange_rate (Line 127)
**Current Guidance**: "查询实时汇率，同一货币对只需查一次" (Query real-time exchange rates, only query same pair once)
- Clear deduplication guidance
- **Need to Add**: When to call (price presentations require both USD and CNY)

#### search_flights (Line 129)
**Current Guidance**: "搜索机票报价（价格 USD），需转换为 CNY" (Search flight quotes (price USD), must convert to CNY)
- Basic guidance
- **Need to Add**: Booking agent's detailed strategy:
  - Multi-airport strategy for major cities
  - Date flexibility (±3 days)
  - Airline ecosystem research
  - Budget airlines not in GDS
  - Middle-leg routes

---

## 4. Current Behavioral Guidance Already in Main Prompt

### Prohibitions & Constraints
- Line 60: Never ask about already-confirmed info ("严禁重复询问" - prohibit repeat asking)
- Line 62-63: All key info must be tool-verified, never fabricate
- Line 64: Mark sources when referencing info
- Line 65: Show prices in both local currency AND CNY
- Line 70: Show comparisons with recommendations
- Line 71: Don't re-ask confirmed info from TripBook
- Line 72-73: Clarify boundaries - you plan, users book

### Tool Call Discipline
- Line 101-102: Max 2 topics per round, max 2 sub-agent delegations per call
- Line 103-104: Show results and wait for confirmation before next batch
- Line 104: Don't re-show full itinerary (panel already shows it)

### Planning Discipline
- Line 70: "Prohibit stage numbering" - say what you're doing, not "Phase 2"
- Line 73-74: Wrap internal reasoning in `<think>` tags for folding

---

## 5. What Sub-Agents Currently Know (Migration Guide)

### Booking Agent (`agents/prompts/booking.js`)
**Lines 1-168** - Detailed guidance on:

#### Flight Search Strategy (Lines 23-78)
1. **Airline ecosystem research** (lines 25-39):
   - Research which airlines fly the route
   - Budget airlines often not in GDS
   - Specific budget airlines: AirAsia, Scoot, Jetstar, Cebu Pacific, VietJet (Asia); Peach, Spring, HK Express (East Asia); Ryanair, EasyJet (Europe)
   - Search airline official websites for budget options

2. **Multi-dimensional search** (lines 41-64):
   - Multi-airport (SZX+HKG+CAN for Shenzhen departure area)
   - Multi-destination airports (especially for niche destinations)
   - Multi-date flexibility (±3 days minimum, ±1 day auto-retry on no results)
   - Middle-leg routes (split booking when direct unavailable)
   - Parallel batch calls (don't wait sequentially)

3. **Results presentation** (lines 67-83):
   - Convert USD→CNY
   - Table format: origin, destination, date, airline, price USD, price CNY, duration, stops
   - Mark red-eye flights (22:00+ departure, 06:00- arrival)
   - Show if budget airlines missed by search tool
   - Note price validity is short, recommend early booking
   - Evaluate departing/arrival time, connection times, give "cheapest" + "most comfortable" options

4. **Booking channels** (lines 80-84):
   - Explain GDS results (Google Flights / Skyscanner style)
   - Budget airlines should book at official websites
   - Suggest comparison: Google Flights, Skyscanner, Tianxun

#### Hotel Search Strategy (Lines 87-143)
1. **Discover local accommodation info** (lines 89-108):
   - Research local accommodation platforms and types
   - Special types: Japan (ryokan, capsule, machiya); SE Asia (beach resort, water bungalow, jungle eco-hotel); Europe (castle hotel, historic renovation, Airbnb)
   - Local platforms: Japan (Jalan, Rakuten Travel); SE Asia (Agoda often cheaper than Booking); China (携程, 飞猪); Airbnb/Vrbo
   - Research best neighborhoods

2. **Precision search & comparison** (lines 110-118):
   - Call search_hotels for real prices
   - Use search_poi for area distribution and Google Maps ratings
   - Use web_search for special recommendations, area comparisons
   - Convert USD→CNY

3. **Hotel selection logic** (lines 120-137):
   - Consider gameplay areas (based on itinerary/attractions)
   - Stay same hotel multiple nights when possible
   - Hotel-as-destination (resorts, special hotels)
   - Offer 2-3 price tiers (budget, comfort, luxury)
   - Include: name (local + Chinese), type, ratings, price/night USD+CNY, location benefits, highlights, booking platform recommendation

### Activity Agent (`agents/prompts/activity.js`)
**Lines 1-165** - Detailed guidance on:

#### Restaurant/Food Strategy (Lines 20-77)
1. **Discovery phase** (lines 22-40):
   - Research local food review platforms
   - Authority sources: Michelin, Asia's 50 Best, Black Pearl
   - Local platforms: Japan (Tabelog), Thailand/SE Asia (Wongnai), US (Yelp), Korea (Naver, MangoPlate), Global (TripAdvisor, Google)
   - Booking platforms: Japan (TableCheck, Hot Pepper, Ikyu.com); Europe (OpenTable, The Fork, Resy); SE Asia (Chope, Eatigo)

2. **Multi-dimensional search** (lines 42-54):
   - search_poi (Google Maps): focus on ratings ≥4.0, reviews ≥100, search by neighborhood (Asakusa, Shinjuku)
   - web_search (2-3 targeted queries): platform rankings (Tabelog Tokyo Asakusa ranking), local must-eats, specific needs (cheap, vegetarian), seasonal

3. **Booking supplement** (lines 56-60):
   - Whether advance reservation needed
   - Booking channels with links
   - Wait times for no-reservation spots

4. **Output structure** (lines 62-76):
   - Group by area first (convenience with itinerary)
   - Then by meal time (breakfast/lunch/dinner)
   - Prioritize local specialties over chains
   - Per restaurant: name (local+Chinese), cuisine, rating+source, price per person, signature dishes, address/district, hours, reservation method (+ link), source link

#### Attraction/Activity Strategy (Lines 80-140)
1. **Discovery phase** (lines 82-105):
   - Research local tourism authority websites
   - Ticket purchase channels: official websites, OTAs (Klook, GetYourGuide, Viator), local platforms (Peatix in Japan, etc.), passes (Paris Museum Pass, Osaka Loop Card)
   - Experience platforms: Airbnb Experiences, Klook/KKday, PADI dive centers, local (Asoview in Japan, Activity Japan)

2. **Multi-dimensional search** (lines 107-120):
   - search_poi: ratings ≥4.0, multiple comments, search by region
   - web_search (2-3 queries): top attractions, ticket pricing & hours, hidden gems, seasonal events

3. **Evaluation & guidance** (lines 122-127):
   - Duration estimates
   - Best visiting times
   - Reservation necessity
   - Ticket comparison (official vs OTA)
   - Geo-clustering for same-day itinerary

4. **Output structure** (lines 129-139):
   - Per attraction: name (local+Chinese), type, rating+source, ticket price (local currency + source), hours (with closed days), suggested duration, reservation (+ link), address/region, tips

---

## 6. Key Insights for Your Refactoring

### ✅ What's Already Ready
1. Main agent CAN already call tools directly (lines 121-132 of system-prompt.js)
2. Tool timing guidance exists (update_trip_info call timing, max 2 topics/round)
3. Source attribution requirements are clear
4. Phase-based planning methodology is established

### 🚨 What Needs to Be Added to Main System Prompt
When removing sub-agents, migrate these detailed strategies to the main prompt:

1. **Flight search strategy** (from booking agent lines 25-78):
   - Airline ecosystem research
   - Multi-airport, multi-date, multi-leg approach
   - Budget airline offline research
   - Add to main prompt lines 129 section

2. **Hotel search strategy** (from booking agent lines 89-143):
   - Platform discovery per destination
   - Neighborhood research
   - Price tier differentiation
   - Add to main prompt lines 130 section

3. **POI search strategy** (from activity agent):
   - Rating threshold (≥4.0, ≥100 reviews)
   - Neighborhood-based search
   - Add to main prompt lines 128 section

4. **Web search strategy** (consolidate from all 3 agents):
   - Airline ecosystem queries
   - Hotel platform queries
   - Restaurant authority platforms
   - Visa/entry official sources
   - Add to main prompt lines 125 section

5. **Weather nuance** (from knowledge agent):
   - Climate vs. forecast data distinction
   - Historical reference vs. actual forecast
   - Seasonal/typhoon considerations
   - Add to main prompt lines 126 section

6. **Exchange rate usage** (implicit in booking agent):
   - When to call (every new currency)
   - Only once per pair
   - Always present as USD + CNY
   - Already in main prompt but could be expanded

### 🎯 Recommended Action Plan
1. **Keep delegation structure** for now (lines 110-119) but mark as deprecated
2. **Add detailed tool strategies** to "Direct Tool Availability" section (lines 121-156)
3. **Update example calls** to show main agent calling these tools directly
4. **Add tool combo patterns**:
   - Flight: web_search (airline ecosystem) → search_flights (multiple airports/dates) → get_exchange_rate
   - Hotel: web_search (platforms) → search_poi (area discovery) → search_hotels (pricing) → get_exchange_rate
   - Attractions: web_search (authorities) → search_poi (area attractions) → web_search (hours/pricing)
5. **Adjust max tool round limits** (currently 10 rounds in server.js) if main agent doing more work
6. **Monitor first few calls** to see if tool call volume increases (may need prompt reduction to stay efficient)

---

## 7. Tools Available in server.js

Located in `tools/index.js`:
```javascript
const ALL_TOOLS = [
  webSearch,           // web_search
  weather,             // get_weather
  exchangeRate,        // get_exchange_rate
  poiSearch,           // search_poi
  flightSearch,        // search_flights
  hotelSearch,         // search_hotels
  destKnowledge,       // cache_destination_knowledge
  updateTripInfo       // update_trip_info
];
```

Plus special handling of `delegate_to_agents` in server.js (lines 260-277).

---

## Summary Table

| Component | Location | Status |
|-----------|----------|--------|
| **System Prompt Builder** | `prompts/system-prompt.js` | ✅ Exists, calls 8 tools + delegate |
| **Tool Availability** | Lines 121-132 of system-prompt.js | ✅ Main agent can call all 8 tools |
| **Tool Timing Guidance** | Lines 134-139 | ✅ Exists (update_trip_info timing) |
| **Round Discipline** | Lines 101-104 | ✅ Max 2 topics, max 2 delegations |
| **Source Attribution** | Lines 154-156 | ✅ Clear rules |
| **Flight Strategy** | `agents/prompts/booking.js:23-78` | ⚠️ Need to migrate |
| **Hotel Strategy** | `agents/prompts/booking.js:87-143` | ⚠️ Need to migrate |
| **POI Strategy** | `agents/prompts/activity.js:42-54` | ⚠️ Need to migrate |
| **Web Search Strategy** | All 3 agent prompts | ⚠️ Need to consolidate |
| **Weather Nuance** | `agents/prompts/knowledge.js:33-36` | ⚠️ Need to migrate |
