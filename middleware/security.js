const helmet = require('helmet');
const cors = require('cors');

/**
 * Security middleware configuration
 */

/**
 * Configure helmet for security headers
 * Protects against common web vulnerabilities
 */
function getHelmetConfig() {
  return helmet({
    // Content Security Policy - prevent XSS attacks
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        scriptSrcAttr: ["'unsafe-inline'"],   // 允许 inline onclick 等事件属性
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      }
    },
    // X-Frame-Options - prevent clickjacking
    frameguard: { action: 'deny' },
    // X-Content-Type-Options - prevent MIME sniffing
    noSniff: true,
    // X-XSS-Protection - enable XSS filtering
    xssFilter: true,
    // Remove X-Powered-By header
    hidePoweredBy: true,
    // HTTP Strict Transport Security
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  });
}

/**
 * Configure CORS for cross-origin requests
 * Restrict to whitelisted origins
 */
function getCorsConfig() {
  // Get allowed origins from environment variable or use default
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3002'];

  return {
    origin: function (origin, callback) {
      // Allow requests with no origin (e.g., mobile apps, curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else if (process.env.NODE_ENV === 'development') {
        // In development, allow all origins
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'X-Base-URL', 'X-Skip-Rate-Limit'],
    maxAge: 86400, // 24 hours
    optionsSuccessStatus: 200
  };
}

/**
 * Additional security headers middleware
 */
function additionalSecurityHeaders() {
  return (req, res, next) => {
    // Prevent browsers from MIME-sniffing a response away from the declared Content-Type
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Deny framing
    res.setHeader('X-Frame-Options', 'DENY');

    // Prevent browsers from following MIME type sniffing in some cases
    res.setHeader('X-UA-Compatible', 'IE=edge');

    // Disallow cross-site tracking
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
  };
}

/**
 * Rate limit error handler
 * Returns proper error format for rate limit errors
 */
function rateLimitErrorHandler() {
  return (err, req, res, next) => {
    if (err.status === 429) {
      return res.status(429).json({
        error: '请求过于频繁',
        details: 'Too many requests, please try again later',
        retryAfter: err.retryAfter || 60
      });
    }
    next(err);
  };
}

/**
 * Validation error handler
 * Formats validation errors properly
 */
function validationErrorHandler() {
  return (err, req, res, next) => {
    if (err.message && err.message.includes('validation')) {
      return res.status(400).json({
        error: '请求验证失败',
        details: err.message
      });
    }
    next(err);
  };
}

/**
 * Global error handler
 * Should be last middleware
 */
function globalErrorHandler() {
  return (err, req, res, next) => {
    console.error('Global error:', err);

    // Don't leak error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    const message = isDevelopment ? err.message : '内部服务器错误';

    res.status(err.status || 500).json({
      error: message,
      ...(isDevelopment && { stack: err.stack })
    });
  };
}

module.exports = {
  getHelmetConfig,
  getCorsConfig,
  additionalSecurityHeaders,
  rateLimitErrorHandler,
  validationErrorHandler,
  globalErrorHandler
};
