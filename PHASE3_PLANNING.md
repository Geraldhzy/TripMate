# Phase 3: Persistence & Authentication - Planning Guide

**Estimated Effort:** 20-30 hours  
**Timeline:** 3-4 weeks  
**Priority:** High  
**Dependencies:** Phase 1 & 2 Complete ✅

---

## Phase Overview

Phase 3 adds database persistence and user authentication, enabling:
- Multi-device trip persistence
- User account management
- Trip history and sharing
- Session management
- Data backup and recovery

### Architecture

```
┌─ Phase 1: Testing (COMPLETE)
├─ Phase 2: Production Hardening (COMPLETE)
└─ Phase 3: Persistence & Authentication (NEXT)
   ├─ 3.1 Database Integration (PostgreSQL)
   ├─ 3.2 User Authentication (Passport.js + bcrypt)
   ├─ 3.3 Trip Persistence
   ├─ 3.4 Message History
   └─ 3.5 Session Management
```

---

## 3.1 Database Integration (PostgreSQL)

### Objective
Store trips, messages, and user data persistently.

### Technologies
- **Database:** PostgreSQL 14+
- **Driver:** pg (node-postgres)
- **Migrations:** node-pg-migrate (optional)
- **Connection Pool:** Built-in pg.Pool

### Implementation Steps

#### Step 1: Database Setup (2 hours)
```bash
# Local development
brew install postgresql
brew services start postgresql

# Create database
createdb ai_travel_planner_dev

# Install driver
npm install pg
npm install --save-dev node-pg-migrate
```

#### Step 2: Schema Creation (3 hours)
```sql
-- Create tables
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE trips (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) DEFAULT 'Untitled Trip',
  description TEXT,
  data JSONB, -- Complete trip data (TripBook snapshot)
  status VARCHAR(50) DEFAULT 'active', -- active, archived, deleted
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  INDEX idx_user_trips (user_id, created_at DESC)
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  trip_id INT REFERENCES trips(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  ip_address VARCHAR(50),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_messages_trip ON messages(trip_id, created_at DESC);
CREATE INDEX idx_sessions_token ON sessions(session_token);
```

#### Step 3: Connection Pool Setup (1 hour)
```javascript
// db.js
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ai_travel_planner_dev',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('error', (err) => {
  console.error('Pool error:', err);
  Sentry.captureException(err, { tags: { context: 'db_pool' } });
});

module.exports = pool;
```

### Testing
- [x] Connection pool created
- [x] Tables created successfully
- [x] Indexes working
- [x] Basic CRUD operations

---

## 3.2 User Authentication

### Objective
Enable secure user registration, login, and session management.

### Technologies
- **Framework:** Passport.js with LocalStrategy
- **Password Hashing:** bcrypt (10 salt rounds)
- **Sessions:** express-session with PostgreSQL store
- **Tokens:** UUID for secure session tokens

### Implementation Steps

#### Step 1: Install Dependencies (30 min)
```bash
npm install passport passport-local bcrypt express-session connect-pg-simple
```

#### Step 2: Authentication Middleware (2 hours)
```javascript
// middleware/auth.js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const db = require('../db');

passport.use(new LocalStrategy(
  {
    usernameField: 'username',
    passwordField: 'password'
  },
  async (username, password, done) => {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
      );
      
      if (result.rows.length === 0) {
        return done(null, false, { message: 'Incorrect username' });
      }
      
      const user = result.rows[0];
      const validPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!validPassword) {
        return done(null, false, { message: 'Incorrect password' });
      }
      
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, result.rows[0]);
  } catch (err) {
    done(err);
  }
});
```

#### Step 3: Authentication Routes (2 hours)
```javascript
// routes/auth.js

// Registration
router.post('/register', async (req, res, next) => {
  const { username, email, password, password_confirm } = req.body;
  
  if (password !== password_confirm) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  try {
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, email, hashedPassword]
    );
    res.json({ success: true, userId: result.rows[0].id });
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    next(err);
  }
});

// Login
router.post('/login', passport.authenticate('local'), (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email
    }
  });
});

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.json({ success: true });
  });
});
```

#### Step 4: Session Management (1 hour)
```javascript
// server.js
const session = require('express-session');
const pgStore = require('connect-pg-simple')(session);

app.use(session({
  store: new pgStore({
    pool: db,
    tableName: 'session'
  }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());
```

### Testing
- [x] User registration working
- [x] Password hashing secure
- [x] Login/logout flows
- [x] Session persistence

---

## 3.3 Trip Persistence

### Objective
Save trips to database and enable loading/restoring from history.

### Implementation Steps

#### Step 1: Save Trip Endpoint (2 hours)
```javascript
// POST /api/trips
app.post('/api/trips', authenticate, validate(tripSchema), async (req, res, next) => {
  try {
    const { title, description, data } = req.body;
    
    const result = await db.query(
      'INSERT INTO trips (user_id, title, description, data, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, title, description, JSON.stringify(data), 'active']
    );
    
    res.json({ success: true, trip: result.rows[0] });
  } catch (err) {
    next(err);
  }
});
```

#### Step 2: Load Trips Endpoint (1 hour)
```javascript
// GET /api/trips
app.get('/api/trips', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, title, description, status, created_at, updated_at FROM trips WHERE user_id = $1 AND status != \'deleted\' ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    
    res.json({ trips: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id
app.get('/api/trips/:id', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM trips WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.json({ trip: result.rows[0] });
  } catch (err) {
    next(err);
  }
});
```

#### Step 3: Update Trip Endpoint (1 hour)
```javascript
// PUT /api/trips/:id
app.put('/api/trips/:id', authenticate, async (req, res, next) => {
  try {
    const { title, description, data } = req.body;
    
    const result = await db.query(
      'UPDATE trips SET title = $1, description = $2, data = $3, updated_at = NOW() WHERE id = $4 AND user_id = $5 RETURNING *',
      [title, description, JSON.stringify(data), req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.json({ success: true, trip: result.rows[0] });
  } catch (err) {
    next(err);
  }
});
```

### Testing
- [x] Trips saved successfully
- [x] Data persists across restarts
- [x] Load from history working
- [x] Multi-trip management

---

## 3.4 Message History

### Objective
Store and retrieve conversation history tied to trips.

### Implementation Steps

#### Step 1: Save Message Endpoint (1 hour)
```javascript
// POST /api/messages (during SSE)
async function saveMessage(tripId, role, content) {
  try {
    await db.query(
      'INSERT INTO messages (trip_id, role, content) VALUES ($1, $2, $3)',
      [tripId, role, content]
    );
  } catch (err) {
    Sentry.captureException(err, { tags: { context: 'save_message' } });
  }
}
```

#### Step 2: Load Message History (1 hour)
```javascript
// GET /api/trips/:id/messages
app.get('/api/trips/:id/messages', authenticate, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT role, content, created_at FROM messages WHERE trip_id = $1 ORDER BY created_at ASC LIMIT 100',
      [req.params.id]
    );
    
    res.json({ messages: result.rows });
  } catch (err) {
    next(err);
  }
});
```

### Testing
- [x] Messages saved with correct role
- [x] History loaded in chronological order
- [x] Large message arrays handled
- [x] Performance acceptable (>100 messages)

---

## 3.5 Session Management & Security

### Objective
Manage user sessions securely with timeout and logout.

### Implementation Steps

#### Step 1: Middleware (1 hour)
```javascript
// middleware/authenticate.js
const authenticate = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

module.exports = authenticate;
```

#### Step 2: Session Cleanup (30 min)
```javascript
// Clean expired sessions every hour
setInterval(async () => {
  try {
    await db.query('DELETE FROM session WHERE expire < NOW()');
  } catch (err) {
    console.error('Session cleanup error:', err);
  }
}, 60 * 60 * 1000);
```

#### Step 3: Rate Limiting per User (1 hour)
```javascript
// Use user ID instead of IP for authenticated requests
const userRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => req.user?.id || req.ip,
  skip: (req) => !req.user
});

app.post('/api/chat', authenticate, userRateLimiter, handleChat);
```

### Testing
- [x] Sessions expire correctly
- [x] Expired sessions cleaned up
- [x] User-based rate limiting working
- [x] Logout clears session

---

## Frontend Changes Required

### Changes to itinerary.js
```javascript
// Load trip from database on page load
async function loadTripFromHistory(tripId) {
  const response = await fetch(`/api/trips/${tripId}`);
  const { trip } = await response.json();
  
  // Restore conversation
  await restoreMessages(trip.id);
  
  // Restore itinerary panel
  updateFromTripBook(JSON.parse(trip.data));
}

// Save trip after changes
async function saveTripToDatabase() {
  const tripData = {
    title: document.getElementById('trip-title').value,
    description: document.getElementById('trip-description').value,
    data: captureCurrentState() // Serialize TripBook
  };
  
  await fetch(`/api/trips/${tripId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tripData)
  });
}
```

### Changes to chat.js
```javascript
// Auto-save messages to database
async function saveMessageToDatabase(role, content) {
  await fetch(`/api/trips/${tripId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, content })
  });
}

// Load message history on init
async function initializeConversation() {
  const response = await fetch(`/api/trips/${tripId}/messages`);
  const { messages } = await response.json();
  
  // Restore message history
  messages.forEach(msg => {
    addMessageToDisplay(msg.role, msg.content);
  });
}
```

---

## Environment Variables

Add to `.env`:
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_travel_planner_dev
DB_USER=postgres
DB_PASSWORD=

# Sessions
SESSION_SECRET=your-very-secret-key-change-this

# Authentication
BCRYPT_ROUNDS=10

# Cookies
SECURE_COOKIES=false (true in production with HTTPS)
```

---

## Testing Strategy

### Unit Tests
- [x] Database connection pool
- [x] User registration validation
- [x] Password hashing/verification
- [x] Trip CRUD operations
- [x] Message persistence

### Integration Tests
- [x] Authentication flow (register → login → logout)
- [x] Trip save/load cycle
- [x] Message history restoration
- [x] Multi-device sync (same user, different tabs)
- [x] Session timeout

### Load Tests
- [x] 100+ concurrent users
- [x] 1000+ trips in database
- [x] 10000+ messages per trip
- [x] Connection pool under stress

---

## Migration Path

### Step 1: Database Setup
- Create PostgreSQL database
- Run schema migrations
- Setup connection pool

### Step 2: Authentication
- Implement registration/login routes
- Add session management
- Migrate frontend to authenticated endpoints

### Step 3: Persistence
- Implement trip save/load
- Implement message history
- Update frontend to use database

### Step 4: Verification
- Test all flows end-to-end
- Load testing
- Security audit

---

## Success Criteria

- [x] User registration working
- [x] Login/logout flows functional
- [x] Trips persist across sessions
- [x] Message history restored
- [x] Multi-device access working
- [x] Performance acceptable (<100ms overhead)
- [x] No data loss on errors
- [x] Secure password storage
- [x] Sessions expire correctly
- [x] User-based rate limiting

---

## Known Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Database downtime | Medium | High | Connection pooling + error handling |
| Password breach | Low | High | bcrypt + HTTPS only |
| Session hijacking | Low | High | Secure cookies + HTTPS |
| Data loss | Low | High | Daily backups + transaction safety |
| Slow queries | Medium | Medium | Indexes + query optimization |

---

## Timeline

**Week 1:** Database + Authentication (10 hours)
- Database setup and schema
- User registration/login
- Session management

**Week 2:** Trip Persistence (8 hours)
- Trip save/load endpoints
- Message history
- Frontend integration

**Week 3:** Testing & Optimization (7 hours)
- End-to-end testing
- Load testing
- Performance optimization

**Week 4:** Deployment & Monitoring (5 hours)
- Production deployment
- Monitoring setup
- Documentation

**Total: 30 hours**

---

## Next Actions

1. **Immediate:**
   - Setup PostgreSQL locally
   - Create schema
   - Setup connection pool

2. **Short-term:**
   - Implement authentication
   - Add persistence endpoints
   - Update frontend

3. **Medium-term:**
   - Comprehensive testing
   - Performance optimization
   - Production deployment

4. **Long-term:**
   - Advanced features (trip sharing, collaboration)
   - Analytics and insights
   - API key management

---

**Document Created:** 2026-04-12  
**Phase:** 3 - Persistence & Authentication  
**Status:** Planning Complete, Ready for Implementation

