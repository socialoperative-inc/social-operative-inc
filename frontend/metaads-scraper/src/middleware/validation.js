// =============================================================================
// Input validation middleware using Zod
// Sanitizes and validates all user inputs to prevent injection attacks
// =============================================================================

const { z } = require('zod');
const log = require('../utils/logger');

// Query parameter schemas
const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(80),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  media: z.enum(['all', 'image', 'video']).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  filterDtc: z.enum(['true', 'false']).optional(),
});

const advertiserQuerySchema = z.object({
  pageId: z.string().regex(/^\d+$/, 'Invalid page ID format'),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  country: z.string().length(2).toUpperCase().optional(),
});

// Validation middleware factory
function validateQuery(schema) {
  return (req, res, next) => {
    try {
      const validated = schema.parse(req.query);
      req.validatedQuery = validated;
      next();
    } catch (error) {
      log.warn('[validation] Invalid query params', { 
        path: req.path, 
        query: req.query, 
        errors: error.errors 
      });
      
      return res.status(400).json({
        error: 'Invalid request parameters',
        code: 'VALIDATION_ERROR',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }
  };
}

// Sanitize string to prevent XSS
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[<>'"]/g, '') // Remove potential HTML/JS injection chars
    .trim()
    .slice(0, 1000); // Max length cap
}

// Sanitize object recursively
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

module.exports = {
  validateQuery,
  searchQuerySchema,
  advertiserQuerySchema,
  sanitizeString,
  sanitizeObject,
};
