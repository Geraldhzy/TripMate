const Joi = require('joi');

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
          .max(5000)
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
  
  knownRates: Joi.array()
    .items(
      Joi.object({
        from: Joi.string().length(3).required(),
        to: Joi.string().length(3).required(),
        rate: Joi.number().positive().required(),
        fetched_at: Joi.number().optional(),
        last_updated: Joi.number().optional()
      })
    )
    .optional(),
  
  knownWeather: Joi.array()
    .items(
      Joi.object({
        city: Joi.string().max(100).required(),
        current: Joi.object().optional(),
        forecast: Joi.array().optional(),
        fetched_at: Joi.number().optional()
      })
    )
    .optional(),
  
  tripBookSnapshot: Joi.object()
    .optional()
});

// Weather search validation schema
const weatherSearchSchema = Joi.object({
  city: Joi.string()
    .max(100)
    .required(),
  
  lang: Joi.string()
    .max(10)
    .default('en')
});

// Exchange rate validation schema
const exchangeRateSchema = Joi.object({
  from: Joi.string()
    .length(3)
    .uppercase()
    .required(),
  
  to: Joi.string()
    .length(3)
    .uppercase()
    .required()
});

// POI search validation schema
const poiSearchSchema = Joi.object({
  destination: Joi.string()
    .max(200)
    .required(),
  
  category: Joi.string()
    .max(100)
    .optional(),
  
  limit: Joi.number()
    .integer()
    .min(1)
    .max(50)
    .default(10)
});

// Web search validation schema
const webSearchSchema = Joi.object({
  query: Joi.string()
    .max(500)
    .required(),
  
  language: Joi.string()
    .max(10)
    .default('zh-CN')
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
  weatherSearchSchema,
  exchangeRateSchema,
  poiSearchSchema,
  webSearchSchema,
  validate,
  validateHeaders,
  sanitizeInput,
  sanitizeBody
};
