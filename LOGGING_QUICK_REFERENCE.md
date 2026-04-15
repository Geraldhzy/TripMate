# Quick Reference: AI Travel Planner Logging

## 📍 Key File Locations

| File | Path | Size | Purpose |
|------|------|------|---------|
| **Logger Utility** | `utils/logger.js` | 218 lines | Main logging implementation |
| **Server** | `server.js` | 900+ lines | Uses logger throughout |
| **Config** | `.env` | 14 lines | Active settings |
| **Config Template** | `.env.example` | 81 lines | Reference settings |
| **Git History** | `.git/logs/HEAD` | 8.1 KB | Recent commits |

## 🔧 Quick Start

### Enable Debug Logging
```bash
LOG_LEVEL=debug npm start
```

### Enable JSON Output
```bash
LOG_JSON=true npm start
```

### Combined
```bash
LOG_LEVEL=debug LOG_JSON=true npm start
```

## 📝 Logger Usage Examples

### Basic Logging
```javascript
const logger = require('./utils/logger');

logger.info('Hello', { world: 'test' });
logger.error('Failed', { error: 'details' });
```

### Scoped to Request
```javascript
const reqId = logger.generateId();
const reqLog = logger.child({ reqId });

reqLog.info('Processing request');
```

### Timing
```javascript
const timer = logger.startTimer('api_call');
// ... do work ...
timer.done({ status: 'success' });
```

## 📊 Log Levels

| Level | Severity | Output | When to Use |
|-------|----------|--------|------------|
| DEBUG | Lowest | ✓ | Development: detailed tracing |
| INFO | Low | ✓ | Important events |
| WARN | Medium | ✓ | Potential issues |
| ERROR | High | ✓ stderr | Failures |
| SILENT | Highest | ✗ | Disable all logs |

## 🎨 Output Formats

### Human-Readable (Default)
```
17:04:23.421 ✅ INFO  [req:a1b2c3d4] Message | key=value
17:04:24.145 ⚠️  WARN  [req:a1b2c3d4] Warning | key=value
17:04:25.678 ❌ ERROR [req:a1b2c3d4] Error | key=value
```

### JSON (LOG_JSON=true)
```json
{"ts":"2026-04-13T17:04:23.421Z","level":"INFO","reqId":"a1b2c3d4","msg":"Message","key":"value"}
```

## 🎯 Logger API

### Methods
- `logger.debug(msg, data)` - DEBUG level
- `logger.info(msg, data)` - INFO level
- `logger.warn(msg, data)` - WARN level
- `logger.error(msg, data)` - ERROR level
- `logger.child(context)` - Create scoped logger
- `logger.startTimer(name)` - Start performance timer
- `logger.generateId()` - Generate 8-char ID

### Timers
```javascript
const timer = logger.startTimer('operation');
timer.done({ extra: 'data' });      // Logs with duration
timer.elapsed();                     // Returns ms without logging
```

## ✅ Current Implementation Status

**Working:**
- ✅ Custom structured logging
- ✅ Multiple log levels
- ✅ Request ID tracking
- ✅ Performance timing
- ✅ Context inheritance
- ✅ Human-readable + JSON output

**Not Implemented:**
- ❌ File persistence
- ❌ Log rotation
- ❌ Log archival
- ❌ Dedicated logs/ directory

## 📍 Output Destinations

| Stream | Use | Format |
|--------|-----|--------|
| stdout | DEBUG, INFO, WARN | Console visible |
| stderr | ERROR | Error stream |

## 🔍 Finding Logs

**Current logs:** Console only (stdout/stderr)
- Run: `npm start` to see live logs
- No persistent files to check
- Logs disappear when process exits

**Git history:** 
- Location: `.git/logs/HEAD`
- Recent commits: 20+
- Development actively logged

## 📌 Common Patterns

### Request Context
```javascript
const reqId = log.generateId();
const reqLog = log.child({ reqId });
// Now all logs include [req:reqId]
```

### Tool Execution
```javascript
const toolLog = reqLog.child({ tool: 'search' });
// Now all logs include [req:X] [tool:search]
```

### Performance Measurement
```javascript
const timer = reqLog.startTimer('db_query');
const result = await database.query();
timer.done({ rows: result.length });
// Logs: db_query 完成 | durationMs=123, duration=123ms, rows=42
```

## 🚀 Recommendations

1. **Development**: `LOG_LEVEL=debug npm start`
2. **Testing**: `LOG_LEVEL=info npm test`
3. **Production**: `LOG_LEVEL=warn LOG_JSON=true npm start`
4. **Debugging Issues**: `LOG_LEVEL=debug LOG_JSON=true npm start`

## 📚 Related Files

- Logger: `utils/logger.js`
- Usage: `server.js` (Line 17)
- Config: `.env`, `.env.example`
- Tests: `__tests__/`
- History: `.git/logs/`

---

**Last Updated:** 2026-04-13  
**Logger Status:** ✅ Fully Functional (Console-based)
