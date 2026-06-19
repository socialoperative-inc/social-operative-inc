// =============================================================================
// PM2 Process Manager Configuration for Production Deployment
// Usage: pm2 start ecosystem.config.js
// =============================================================================

module.exports = {
  apps: [
    {
      name: 'metaads-scraper',
      script: './src/server.js',
      instances: 2, // Run 2 instances for load balancing
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 8080,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 100,
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
