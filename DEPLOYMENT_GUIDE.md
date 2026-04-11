# Deployment & Setup Guide

**Last Updated:** 2026-04-11  
**Current Version:** 0.1.0  
**Status:** Ready for Testing & Deployment

---

## Quick Start (< 5 minutes)

### Prerequisites
- Node.js 18+
- npm 9+
- API key from OpenAI, Anthropic, or DeepSeek

### Setup Steps

```bash
# 1. Clone or navigate to project
cd /path/to/ai-travel-planner

# 2. Install dependencies
npm install

# 3. Start server
npm start

# 4. Open browser
# Automatically opens http://localhost:3000
# Or manually visit: http://localhost:3000

# 5. Configure API
# First time access shows settings panel
# Fill in your AI provider and API key
```

### Using start.sh (Recommended)
```bash
chmod +x start.sh
./start.sh
```

This script handles:
- Dependency installation
- Server startup
- Browser auto-open
- Port 3000 binding

---

## Environment Configuration

### API Key Setup (Frontend)
The application uses browser localStorage for API key storage:
- **Location:** Browser DevTools > Application > Local Storage
- **Keys stored:** `ai_provider`, `ai_model`, `api_key`, `base_url`
- **Security:** Keys stay in browser, never sent to server
- **Persistence:** Survives browser restart

### API Key Setup (Backend - Optional)
For server-side API calls, set environment variables:

```bash
# OpenAI
export OPENAI_API_KEY=sk-...

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# DeepSeek
export DEEPSEEK_API_KEY=sk-...
```

### Configuration Panel
Access via browser settings icon (top-right):

| Field | Required | Format |
|-------|----------|--------|
| AI Provider | Yes | `openai` / `anthropic` / `deepseek` |
| Model | Yes | e.g., `gpt-4o`, `claude-sonnet-4-latest` |
| API Key | Yes | Your provider's API key |
| Base URL | No | Custom endpoint (e.g., for proxies) |

---

## Server Architecture

### Port Configuration
- **Default:** 3000
- **Environment Variable:** `PORT`

```bash
PORT=8000 npm start
```

### Process Management

#### Development
```bash
npm start
```

#### Production
```bash
NODE_ENV=production npm start
```

#### With PM2
```bash
# Install PM2
npm install -g pm2

# Start
pm2 start server.js --name "travel-planner"

# Monitor
pm2 monit

# Restart
pm2 restart travel-planner

# Stop
pm2 stop travel-planner
```

#### With Docker
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t ai-travel-planner .
docker run -p 3000:3000 ai-travel-planner
```

---

## Data Storage

### Session Persistence
- **Location:** Browser localStorage
- **Format:** JSON
- **Size Limit:** 5-10 MB (browser dependent)
- **TTL:** Persists until browser clear

### Trip Data (TripBook)
- **Format:** JSON in browser memory
- **Persistence:** Saved to localStorage as `tripBook_${sessionId}`
- **Restoration:** Automatic on page reload

### Destination Knowledge Cache
- **Location:** `data/dest-cache.json` (local file system)
- **Format:** JSON key-value store
- **TTL:** 30 days per entry
- **Auto-cleanup:** Expired entries removed on startup

### File Structure
```
data/
├── dest-cache.json          # Cached destination data
└── [other runtime files]

.claude/
├── settings.local.json      # Local development settings
└── [claude workspace files]
```

---

## Troubleshooting

### Server Won't Start
```bash
# Check port availability
lsof -i :3000

# Kill process on port 3000
kill -9 <PID>

# Try different port
PORT=3001 npm start
```

### API Key Issues
- **Error:** "Invalid API key"
  - Verify key is correct in settings
  - Check key hasn't expired
  - Ensure key has proper permissions

- **Error:** "API rate limit exceeded"
  - Wait a few minutes
  - Check provider's rate limits
  - Consider implementing request batching

### Browser Storage Issues
```javascript
// Clear all local storage
localStorage.clear();

// Clear specific keys
localStorage.removeItem('tripBook_*');
localStorage.removeItem('ai_provider');
```

### Destination Cache Issues
```bash
# Clear cache
rm data/dest-cache.json

# Check cache contents
cat data/dest-cache.json | jq .

# View cache age
node -e "
const data = require('./data/dest-cache.json');
Object.entries(data).forEach(([k,v]) => {
  const age = (Date.now() - v.saved_at) / 86400000;
  console.log(\`\${k}: \${age.toFixed(1)} days\`);
});
"
```

---

## Performance Optimization

### Recommended Settings
- **Node.js:** Use Node 18+ (better performance)
- **Port:** Use 3000 (standard web port)
- **Memory:** Monitor with `npm start 2>&1 | grep "memory"`

### Caching Strategy
1. **Destination knowledge** - Cached 30 days
2. **Weather data** - Cached during conversation
3. **Exchange rates** - Cached during conversation
4. **Web search results** - Not cached (always fresh)

### Request Batching
Parallel tool calls are already implemented:
- Multiple flights searches run in parallel
- Weather + exchange rate queries batch together
- POI searches can be parallelized

### Browser Performance
- Modern browsers handle 1000+ DOM nodes
- Timeline rendering efficient with CSS Grid
- Scrollbar custom styling applied
- No known memory leaks

---

## Monitoring & Logging

### Server Logs
```bash
# Start with verbose logging
DEBUG=* npm start

# Monitor specific module
DEBUG=express:* npm start

# Monitor tool execution
DEBUG=tool:* npm start
```

### Browser DevTools
1. Open DevTools: F12
2. **Console Tab:**
   - View error messages
   - Check tool execution
   - Monitor API calls

3. **Network Tab:**
   - Monitor SSE stream
   - Check tool response times
   - Verify data payloads

4. **Application Tab:**
   - View localStorage
   - Check session storage
   - Monitor cache size

### Performance Metrics
```javascript
// Check panel rendering time
console.time('renderItinerary');
renderItinerary();
console.timeEnd('renderItinerary');

// Monitor state size
console.log(JSON.stringify(itineraryState).length);

// Check expanded days
console.log('Expanded:', Array.from(expandedDays));
```

---

## Scaling Considerations

### Current Limitations
- Single browser tab per session
- localStorage limits ~5-10 MB
- Real-time API call timeout ~30 seconds
- Max 10,000 destination cache entries

### Scaling Path
1. **Phase 1 (Now):** Single-user, browser-based
2. **Phase 2:** Session management, multiple tabs
3. **Phase 3:** Persistent database (MongoDB/PostgreSQL)
4. **Phase 4:** Multi-user, authentication, team sharing
5. **Phase 5:** Cloud deployment, API tier, analytics

---

## Testing Deployment

### Local Testing
```bash
# Terminal 1: Start server
npm start

# Terminal 2: Run tests
npm test
```

### Manual Testing Scenarios
1. **New Session:**
   - Clear localStorage
   - Visit http://localhost:3000
   - Configure API key
   - Start planning

2. **Cached Destinations:**
   - Plan trip to Japan
   - Wait for knowledge cache
   - Plan trip to Thailand
   - Verify cache used

3. **Large Itinerary:**
   - Request 14-day trip
   - Expand all days
   - Monitor performance
   - Check browser memory

4. **Error Handling:**
   - Disable internet
   - Trigger tool call
   - Verify error message
   - Check recovery

---

## Security Checklist

- [x] API keys stored locally, not in localStorage headers
- [x] No sensitive data in URLs
- [x] SSE stream properly escaped
- [x] HTML injection prevention (escItinHtml)
- [x] No eval() or dynamic code execution
- [x] CORS not required (same-origin)
- [x] No hardcoded credentials

### Additional Security (Recommended)
- [ ] Add HTTPS/TLS for production
- [ ] Implement CSP headers
- [ ] Add rate limiting
- [ ] Validate all API responses
- [ ] Sanitize user input
- [ ] Add authentication layer
- [ ] Encrypt sensitive data
- [ ] Regular security audit

---

## Maintenance Schedule

### Daily
- Monitor error logs
- Check API rate limits
- Verify database connectivity

### Weekly
- Review destination cache size
- Check storage usage
- Performance metrics review

### Monthly
- Clear expired cache entries
- Database optimization
- Security audit
- Dependency updates

### Quarterly
- Major version update
- Performance benchmark
- Load testing
- Security assessment

---

## Deployment Checklist

- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Browser compatibility verified
- [ ] Performance acceptable
- [ ] Error handling tested
- [ ] Security reviewed
- [ ] Backup strategy in place
- [ ] Monitoring set up
- [ ] Rollback plan ready

---

## Support & Issues

### Getting Help
1. Check CURRENT_SESSION_PROGRESS.md
2. Review TESTING_CHECKLIST.md
3. Check project documentation
4. Review error logs
5. Check browser console

### Reporting Issues
Include:
- Node.js version
- Browser and version
- Steps to reproduce
- Error message
- Console output
- Network requests

---

## Quick Reference

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Start server | `npm start` |
| Clear cache | `rm data/dest-cache.json` |
| View logs | `npm start 2>&1 \| tail -100` |
| Kill server | `lsof -i :3000 \| kill -9` |
| Clear storage | `localStorage.clear()` |
| Check version | `npm list` |
| Update deps | `npm update` |

---

**Next Steps:** See [TESTING_CHECKLIST.md](./TESTING_CHECKLIST.md) for verification procedures.

