// Lightweight structured logger (avoids pulling in heavy deps).
const ts = () => new Date().toISOString();
const fmt = (level, msg, meta) => {
  const base = `[${ts()}] ${level.toUpperCase()} ${msg}`;
  if (!meta) return base;
  try {
    return `${base} ${JSON.stringify(meta)}`;
  } catch (_) {
    return base;
  }
};

module.exports = {
  info: (msg, meta) => console.log(fmt('info', msg, meta)),
  warn: (msg, meta) => console.warn(fmt('warn', msg, meta)),
  error: (msg, meta) => console.error(fmt('error', msg, meta)),
  debug: (msg, meta) => {
    if (process.env.LOG_LEVEL === 'debug') console.log(fmt('debug', msg, meta));
  },
};
