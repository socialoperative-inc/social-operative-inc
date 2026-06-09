const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const config = require('./config');
const log = require('./utils/logger');
const apiKeyAuth = require('./middleware/auth');
const { apiLimiter, healthLimiter } = require('./middleware/rate-limit');
const { shutdown: shutdownBrowser } = require('./scrapers/browser-pool');

const app = express();

// --- Security Middleware ---
app.set('trust proxy', 1);

// Enhanced helmet configuration for production security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xFrameOptions: { action: 'deny' },
  xContentTypeOptions: true,
  xDnsPrefetchControl: { allow: false },
  xDownloadOptions: true,
  xPermittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

app.use(express.json({ limit: '128kb' }));
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

const corsOpts = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error('Not allowed by CORS: ' + origin));
  },
  credentials: false,
};
app.use(cors(corsOpts));

// --- Routes ---
app.use('/health', healthLimiter, require('./routes/health'));
app.use(apiKeyAuth); // Protected routes below
app.use('/ads', require('./routes/ads'));
app.use('/advertiser', require('./routes/advertiser'));
app.use('/cache', apiLimiter, require('./routes/cache'));

app.get('/', (req, res) =>
  res.json({
    service: 'metaads-scraper',
    version: '1.0.0',
    docs: 'GET /health · GET /ads?q=... · GET /advertiser/:pageId · GET /cache/stats',
    security: 'Rate-limited, validated, and secured',
  })
);

app.use((req, res) => res.status(404).json({ error: 'Not found', path: req.path }));

// Global error handler - never expose stack traces in production
app.use((err, req, res, next) => {
  log.error('[server] uncaught', { err: err?.message, stack: err?.stack });
  
  if (config.env === 'production') {
    res.status(500).json({ 
      error: 'Internal server error', 
      code: 'SERVER_ERROR',
      requestId: req.id || 'unknown',
    });
  } else {
    res.status(500).json({ 
      error: 'Internal server error', 
      detail: err?.message,
      stack: err?.stack,
    });
  }
});

const server = app.listen(config.port, () => {
  log.info(`metaads-scraper listening on :${config.port}`, { env: config.env });
});

// --- Graceful shutdown ---
async function gracefulShutdown(signal) {
  log.info(`received ${signal}, shutting down...`);
  server.close(() => log.info('http server closed'));
  await shutdownBrowser();
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('unhandledRejection', (r) => log.error('unhandledRejection', { err: r?.message || String(r) }));
process.on('uncaughtException', (e) => log.error('uncaughtException', { err: e?.message }));
