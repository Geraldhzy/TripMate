const Joi = require('joi');
const log = require('../utils/logger');

/**
 * Input validation schemas for API endpoints
 */

// Chat request validation schema
const chatRequestSchema = Joi.object({
  messages: Joi.array()
    .items(
      Joi.object({
        role: Joi.string()
          .valid('user', 'assistant')
          .required(),
        content: Joi.string()
          .max(50000)
          .required()
      })
    )
    .required()
    .min(1),
  
  provider: Joi.string()
    .valid('openai', 'anthropic', 'deepseek')
    .default('openai'),
  
  model: Joi.string()
    .max(100)
    .optional(),

  tripBookSnapshot: Joi.object()
    .unknown(true)
    .optional()
});

/**
 * Validation middleware factory
 * @param {Joi.Schema} schema - The validation schema
 * @param {string} source - Where to validate ('body', 'query', 'headers', etc.)
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
        type: d.type
      }));

      log.warn('请求验证失败', { errors });

      return res.status(400).json({
        error: '请求参数验证失败',
        details: errors
      });
    }

    // Replace req[source] with validated and sanitized value
    req[source] = value;
    next();
  };
}

/**
 * Middleware to validate header presence and format
 */
function validateHeaders() {
  return (req, res, next) => {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
      return res.status(401).json({
        error: '缺少 API Key',
        details: { header: 'x-api-key 是必需的' }
      });
    }

    if (typeof apiKey !== 'string' || apiKey.length < 10) {
      return res.status(400).json({
        error: 'API Key 格式无效',
        details: { header: 'x-api-key 必须是有效的字符串' }
      });
    }

    next();
  };
}

/**
 * Sanitize string inputs (prevent XSS and injection attacks)
 */
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim();
}

/**
 * Middleware to sanitize all string inputs in request body
 */
function sanitizeBody() {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return next();
    }

    const sanitizeObj = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObj(item));
      }

      if (obj !== null && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObj(value);
        }
        return sanitized;
      }

      if (typeof obj === 'string') {
        return sanitizeInput(obj);
      }

      return obj;
    };

    req.body = sanitizeObj(req.body);
    next();
  };
}

module.exports = {
  chatRequestSchema,
  validate,
  validateHeaders,
  sanitizeInput,
  sanitizeBody
};
