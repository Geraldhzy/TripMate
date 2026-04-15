# Flight & Hotel Search Tools - Technical Deep Dive

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     User Chat Interface                   │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
         ┌─────────────────────────────────────┐
         │    /api/chat Endpoint (server.js)   │
         │   - Validates request               │
         │   - Calls handleChat()               │
         │   - Streams SSE responses            │
         └────────────┬────────────────────────┘
                      │
                      ▼
         ┌─────────────────────────────────────┐
         │  LLM Loop (OpenAI/DeepSeek)         │
         │  - Creates messages                 │
         │  - Detects tool calls               │
         │  - Returns tool names & args        │
         └────────────┬────────────────────────┘
                      │
                      ▼
         ┌─────────────────────────────────────┐
         │    runTool() - Main Dispatcher      │
         │  - Route tool by name               │
         │  - Handle delegate_to_agents        │
         │  - Apply 30s timeout                │
         │  - Sync results to TripBook         │
         └────────┬────────────────────────────┘
                  │
      ┌───────────┼───────────┐
      │           │           │
      ▼           ▼           ▼
  flight_search  hotel_search  web_search
      │           │           │
      ├──────┬────┴────┬──────┴────┬─────────────┐
      │      │        │           │             │
      ▼      ▼        ▼           ▼             ▼
   search_  search_  web_       update_    delegate_
   flights  hotels   search     trip_info  to_agents
  (Python) (Python)  (JS)      (Node)     (Sub-agents)
```

## Tool Execution Flow - Detailed

### 1. REQUEST ENTRY POINT

**File**: `server.js` lines 100-165

```javascript
app.post('/api/chat', validateHeaders(), validate(chatRequestSchema), chatLimiter, toolLimiter, async (req, res) => {
  const { messages, provider, model, tripBookSnapshot } = req.body;
  
  // Create request-scoped logger
  const reqId = log.generateId();
  const reqLog = log.child({ reqId });
  
  // Build system prompt with context
  const systemPrompt = buildSystemPrompt(conversationText, tripBook);
  
  // Stream LLM response + execute tools
  fullText = await handleChat(apiKey, model, systemPrompt, messages, sendSSE, effectiveBaseUrl, tripBook, reqLog);
  
  // Send SSE events to client
  sendSSE('done', {});
});
```

### 2. LLM CONVERSATION LOOP

**File**: `server.js` lines 423-514

```javascript
async function handleChat(apiKey, model, systemPrompt, userMessages, sendSSE, baseUrl, tripBook, reqLog) {
  const client = new OpenAI(clientOpts);
  const tools = getToolDefinitions();  // ← Gets both flight & hotel tools
  const messages = [{ role: 'system', content: systemPrompt }, ...userMessages];
  
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {  // max 10 rounds
    sendSSE('thinking', {});
    
    // Call LLM with tools
    const { fullText, toolCalls, rawAssistant } = await streamOpenAI(
      client, selectedModel, messages, tools, sendSSE
    );
    
    // If no tool calls, return final response
    if (toolCalls.length === 0) {
      return fullText;
    }
    
    messages.push(rawAssistant);
    
    // Execute all tool calls in this round
    const toolResults = [];
    for (const tc of toolCalls) {
      const resultStr = await runTool(tc.name, tc.args, tc.id, sendSSE, tripBook, delegateCtx, reqLog);
      toolResults.push({ id: tc.id, content: resultStr });
    }
    
    messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
  }
}
```

### 3. TOOL DISPATCH

**File**: `server.js` lines 197-315

```javascript
async function runTool(funcName, funcArgs, toolId, sendSSE, tripBook, delegateCtx, reqLog) {
  const toolLog = reqLog.child({ tool: funcName });
  const toolTimer = toolLog.startTimer(`tool:${funcName}`);
  
  // Special handling for delegation
  if (funcName === 'delegate_to_agents') {
    sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
    try {
      const resultStr = await executeDelegation(...);
      sendSSE('tool_result', { id: toolId, name: funcName, resultLabel: '子Agent调研完成' });
      return resultStr;
    } catch (err) {
      // Error handling...
    }
  }
  
  // Standard tool execution
  sendSSE('tool_start', { id: toolId, name: funcName, arguments: funcArgs });
  try {
    // ← TIMEOUT APPLIED HERE (30 seconds)
    const result = await withTimeout(
      executeToolCall(funcName, funcArgs),  // ← routes to specific tool
      TOOL_TIMEOUT_MS,
      `工具 ${funcName}`
    );
    
    const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
    const resultLabel = getToolResultLabel(funcName, funcArgs, resultStr);
    
    toolTimer.done({ resultLen: resultStr.length, label: resultLabel });
    sendSSE('tool_result', { id: toolId, name: funcName, resultLabel });
    
    // SYNC RESULTS TO TRIPBOOK
    const parsed = JSON.parse(resultStr);
    
    if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
      for (const f of parsed.flights) {
        tripBook.addFlightQuote({
          route: `${parsed.origin} → ${parsed.destination}`,
          date: parsed.date,
          airline: f.airline,
          price_usd: f.price_usd,
          duration: f.duration,
          stops: f.stops
        });
      }
    }
    
    if (funcName === 'search_hotels' && Array.isArray(parsed.hotels)) {
      for (const h of parsed.hotels) {
        tripBook.addHotelQuote({
          name: h.name,
          city: h.city,
          checkin: h.checkin,
          checkout: h.checkout,
          nights: h.nights,
          price_per_night_usd: h.price_per_night_usd,
          rating: h.rating
        });
      }
    }
    
    return resultStr;
  } catch (toolErr) {
    // Error handling...
  }
}
```

### 4. TOOL EXECUTION - executeToolCall

**File**: `tools/index.js` lines 39-45

```javascript
async function executeToolCall(name, args) {
  const handler = toolMap[name];  // ← Maps tool name to handler function
  if (!handler) {
    throw new Error(`未知工具: ${name}`);
  }
  return handler(args);  // ← Calls execute() in flight-search.js or hotel-search.js
}

// toolMap is built from:
// const toolMap = {};
// ALL_TOOLS.forEach(t => { toolMap[t.TOOL_DEF.name] = t.execute; });
//
// Where ALL_TOOLS = [webSearch, poiSearch, flightSearch, hotelSearch, updateTripInfo]
//
// So:
// toolMap['search_flights'] = flightSearch.execute
// toolMap['search_hotels'] = hotelSearch.execute
```

### 5. FLIGHT SEARCH EXECUTION

**File**: `tools/flight-search.js` lines 22-60

```javascript
function execute(params) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scripts', 'search_flights.py');
    const child = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000  // ← Python-side timeout (60 seconds)
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      // ← Code 0 = success
      if (code !== 0 || !stdout.trim()) {
        resolve(JSON.stringify({
          error: `机票搜索脚本执行失败 (code=${code})`,
          detail: stderr.substring(0, 500) || '无输出',
          suggestion: '请确保已安装 fast-flights: pip3 install fast-flights'
        }));
        return;
      }
      try {
        JSON.parse(stdout);  // Validate JSON
        resolve(stdout.trim());  // ← Return JSON string
      } catch {
        resolve(JSON.stringify({ error: '返回数据格式错误', raw: stdout.substring(0, 500) }));
      }
    });

    child.on('error', (err) => {
      resolve(JSON.stringify({ error: `无法启动Python: ${err.message}` }));
    });

    // Pass params as JSON to Python stdin
    child.stdin.write(JSON.stringify(params));
    child.stdin.end();
  });
}
```

**Python Script**: `tools/scripts/search_flights.py`

```python
def main():
    # 1. Read JSON from stdin
    params = json.loads(sys.stdin.read())
    
    # 2. Extract parameters
    origin = params.get("origin", "")  # e.g., "MFM" (Macau)
    destination = params.get("destination", "")  # e.g., "KUL" (Kuala Lumpur)
    date = params.get("date", "")  # e.g., "2026-04-20"
    passengers = int(params.get("passengers", 1))
    
    # 3. Validate
    if not origin or not destination or not date:
        print(json.dumps({"error": "缺少必要参数"}))
        return
    
    # 4. Create flight data object
    flight_data = FlightData(date=date, from_airport=origin, to_airport=destination)
    
    # 5. Try to get flights with fallback modes
    for mode in ['common', 'fallback', 'force-fallback']:
      try:
        result = get_flights(
          flight_data=[flight_data],
          trip='one-way',
          passengers=Passengers(adults=passengers),
          seat='economy',
          fetch_mode=mode
        )
        if result and result.flights:
          break
      except Exception as e:
        # Try next mode
        pass
    
    # 6. Deduplicate and format flights
    seen = set()
    flights = []
    for f in result.flights:
      # Parse fields, deduplicate...
      flights.append({
        "airline": f.name,
        "departure": f.departure,
        "arrival": f.arrival,
        "duration": f.duration,
        "stops": parse_stops(f.stops),
        "price_usd": parse_price_usd(f.price)
      })
    
    # 7. Sort by price and output JSON
    flights.sort(key=lambda x: (x["price_usd"] is None, x["price_usd"] or 0))
    print(json.dumps({
      "origin": origin,
      "destination": destination,
      "date": date,
      "currency": "USD",
      "flights": flights,
      "total_results": len(flights)
    }, ensure_ascii=False))
```

### 6. HOTEL SEARCH EXECUTION

**File**: `tools/hotel-search.js` lines 21-59

```javascript
function execute(params) {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, 'scripts', 'search_hotels.py');
    const child = spawn('python3', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 70000  // ← Python-side timeout (70 seconds)
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve(JSON.stringify({
          error: `酒店搜索脚本执行失败 (code=${code})`,
          detail: stderr.substring(0, 500) || '无输出',
          suggestion: '请确保已安装 playwright: pip3 install playwright && python3 -m playwright install chromium'
        }));
        return;
      }
      try {
        JSON.parse(stdout);
        resolve(stdout.trim());
      } catch {
        resolve(JSON.stringify({ error: '返回数据格式错误' }));
      }
    });

    child.on('error', (err) => {
      resolve(JSON.stringify({ error: `无法启动Python: ${err.message}` }));
    });

    child.stdin.write(JSON.stringify(params));
    child.stdin.end();
  });
}
```

**Python Script**: `tools/scripts/search_hotels.py`

```python
def main():
    # 1. Read JSON from stdin
    params = json.loads(sys.stdin.read())
    
    # 2. Extract parameters
    city = params.get("city", "")  # e.g., "Kuala Lumpur"
    checkin = params.get("checkin", "")  # e.g., "2026-04-20"
    checkout = params.get("checkout", "")  # e.g., "2026-04-22"
    
    # 3. Validate
    if not city or not checkin or not checkout:
        print(json.dumps({"error": "缺少必要参数"}))
        return
    
    # 4. Build Google Hotels URL
    url = f"https://www.google.com/travel/hotels/{city}?q={city}+hotels&dates={checkin}_{checkout}"
    
    # 5. Open browser (REQUIRES PLAYWRIGHT & CHROMIUM)
    with sync_playwright() as p:
      browser = p.chromium.launch(headless=True)
      page = browser.new_page()
      page.goto(url, wait_until="domcontentloaded", timeout=45000)
      
      # 6. Wait for hotel cards to load
      try:
        page.wait_for_selector('[data-hveid], .Hkjgbb, .kCsInf', timeout=15000)
      except:
        pass  # Continue even if selector not found
      
      # 7. Parse hotel cards
      hotels = []
      cards = page.query_selector_all('[data-hveid] .uaTTDe, [jsname="mutHjb"]')
      for card in cards[:10]:
        text = card.inner_text()
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        
        name = lines[0] if lines else "Unknown"
        price = ""
        rating = ""
        
        for line in lines:
          if '$' in line or '¥' in line:
            price_match = re.search(r'[\$¥]\s*[\d,]+', line)
            if price_match:
              price = price_match.group()
          if re.match(r'^\d\.\d', line):
            rating = line.split()[0]
        
        if name and name != "Unknown":
          hotels.append({
            "name": name,
            "price_per_night": price,
            "rating": rating
          })
      
      browser.close()
      
      # 8. Output JSON
      print(json.dumps({
        "city": city,
        "checkin": checkin,
        "checkout": checkout,
        "currency": "USD",
        "hotels": hotels,
        "total_results": len(hotels)
      }, ensure_ascii=False))
```

## Tool Registration

**File**: `tools/index.js` lines 1-48

```javascript
// 1. IMPORT ALL TOOL MODULES
const webSearch = require('./web-search');
const poiSearch = require('./poi-search');
const flightSearch = require('./flight-search');      // ← Here
const hotelSearch = require('./hotel-search');        // ← Here
const updateTripInfo = require('./update-trip-info');
const delegate = require('../agents/delegate');

// 2. CREATE TOOLS ARRAY
const ALL_TOOLS = [webSearch, poiSearch, flightSearch, hotelSearch, updateTripInfo];

// 3. BUILD TOOL DEFINITIONS FOR LLM
function getToolDefinitions() {
  const tools = ALL_TOOLS.map(t => ({
    type: 'function',
    function: {
      name: t.TOOL_DEF.name,           // e.g., "search_flights"
      description: t.TOOL_DEF.description,
      parameters: t.TOOL_DEF.parameters  // JSON Schema
    }
  }));
  
  // Add delegation tool
  tools.push({
    type: 'function',
    function: {
      name: delegate.TOOL_DEF.name,
      description: delegate.TOOL_DEF.description,
      parameters: delegate.TOOL_DEF.parameters
    }
  });
  
  return tools;
}

// 4. BUILD EXECUTION HANDLER MAP
const toolMap = {};
ALL_TOOLS.forEach(t => { toolMap[t.TOOL_DEF.name] = t.execute; });

// So:
// toolMap['search_flights'] = flightSearch.execute
// toolMap['search_hotels'] = hotelSearch.execute

// 5. UNIFIED EXECUTOR
async function executeToolCall(name, args) {
  const handler = toolMap[name];
  if (!handler) {
    throw new Error(`未知工具: ${name}`);
  }
  return handler(args);
}

module.exports = { getToolDefinitions, executeToolCall };
```

## Timeout Logic

**File**: `server.js` lines 343-352

```javascript
function withTimeout(promise, ms, label = 'operation') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} 超时 (${ms / 1000}s)`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

// Used in runTool():
// const result = await withTimeout(
//   executeToolCall(funcName, funcArgs),
//   TOOL_TIMEOUT_MS,  // ← 30000 ms (30 seconds)
//   `工具 ${funcName}`
// );

const TOOL_TIMEOUT_MS = 30000;  // ← APPLIES TO ALL TOOLS
```

## Result Sync to TripBook

**File**: `server.js` lines 238-301

```javascript
// After tool execution returns resultStr...

try {
  const parsed = JSON.parse(resultStr);

  // FLIGHT SEARCH RESULTS
  if (funcName === 'search_flights' && Array.isArray(parsed.flights)) {
    const route = `${parsed.origin || funcArgs.origin || '?'} → ${parsed.destination || funcArgs.destination || '?'}`;
    const flightDate = parsed.date || funcArgs.date || '';
    for (const f of parsed.flights) {
      tripBook.addFlightQuote({
        route, 
        date: flightDate, 
        airline: f.airline,
        price_usd: f.price_usd,
        duration: f.duration, 
        stops: f.stops,
      });
    }
  }

  // HOTEL SEARCH RESULTS
  if (funcName === 'search_hotels' && Array.isArray(parsed.hotels)) {
    for (const h of parsed.hotels) {
      tripBook.addHotelQuote({
        name: h.name, 
        city: h.city,
        checkin: h.checkin, 
        checkout: h.checkout, 
        nights: h.nights,
        price_per_night_usd: h.price_per_night_usd || h.price_per_night,
        price_total_cny: h.price_total_cny,
        rating: h.rating,
      });
    }
  }

  // ← TripBook now contains flight/hotel quotes for later reference
  
} catch (err) {
  // Error handling
}
```

## Error Handling Strategy

```
Tool Call Fails:
  ├─ Python ImportError (missing module)
  │  └─ Return JSON: { error: "module 未安装..." }
  │
  ├─ Python Runtime Error (bad data, API error)
  │  └─ Return JSON: { error: "搜索失败: ..." }
  │
  ├─ Node.js Timeout (>30s)
  │  └─ Reject promise: "工具 search_hotels 超时 (30s)"
  │     → runTool() catches → Returns error message
  │
  ├─ Node.js Process Error (can't spawn)
  │  └─ Python process 'error' event
  │     → Resolve JSON: { error: "无法启动Python: ..." }
  │
  └─ Node.js JSON Parse Error
     └─ Resolve JSON: { error: "返回数据格式错误" }

All paths:
  1. Tool error caught
  2. SSE 'tool_result' sent to user with error
  3. Error returned to LLM for recovery
  4. LLM can suggest web_search or user action
```

## Performance Characteristics

### Flight Search
- **Speed**: ~3-5 seconds (API call)
- **Memory**: Low (simple API call)
- **Reliability**: High (multiple fallback modes)
- **Timeout**: Rarely triggers

### Hotel Search
- **Speed**: ~10-20 seconds (web scraping)
- **Memory**: Medium (Chromium browser)
- **Reliability**: Medium (depends on Google Hotels DOM structure)
- **Timeout**: May trigger if Google is slow

## Known Limitations

1. **Fast-Flights**: 
   - Depends on Google Flights availability
   - May be rate-limited
   - Occasionally returns "Price unavailable"

2. **Hotel Search**:
   - Requires Chromium (heavy ~150MB)
   - Brittle to Google Hotels DOM changes
   - Slow compared to flight search
   - May timeout if network is slow

3. **Architecture**:
   - Only supports OpenAI (Anthropic removed)
   - Single 30s timeout for both tools
   - No browser pooling for hotels

---

**Generated**: Investigation Report 2026-04-14
