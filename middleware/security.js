const helmet = require('helmet');
const cors = require('cors');
const log = require('../utils/logger');

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
  return {
    origin: true, // 本地项目，允许所有来源
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
    // X-UA-Compatible for older IE browsers
    res.setHeader('X-UA-Compatible', 'IE=edge');

    // Disallow cross-site tracking
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    next();
  };
}

/**
 * Global error handler
 * Should be last middleware
 */
function globalErrorHandler() {
  return (err, req, res, next) => {
    log.error('全局未捕获错误', { error: err.message, stack: err.stack });

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
  globalErrorHandler
};
