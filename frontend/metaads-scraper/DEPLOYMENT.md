# 🚀 Meta Ads Scraper — Production Deployment Guide

## Overview

This backend service scrapes Meta Ads Library and provides enriched competitor intelligence data. It should be deployed on a **Hostinger VPS** or similar cloud provider with sufficient resources for Playwright/Chromium.

## Prerequisites

- **VPS Requirements**:
  - 2+ CPU cores
  - 4GB+ RAM
  - 20GB+ storage
  - Ubuntu 20.04/22.04 LTS or Debian 11+

- **Domain/DNS**:
  - Subdomain pointing to your VPS (e.g., `api.yourapp.com`)
  - SSL certificate (via Let's Encrypt)

## 🔧 VPS Setup (Ubuntu/Debian)

### 1. Initial Server Setup

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Create deploy user
adduser deploy
usermod -aG sudo deploy
su - deploy
```

### 2. Install Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Should be v20.x
```

### 3. Install Yarn

```bash
sudo npm install -g yarn pm2
```

### 4. Install Playwright Dependencies

```bash
sudo apt install -y \
  wget ca-certificates fonts-liberation \
  libasound2 libatk-bridge2.0-0 libatk1.0-0 \
  libatspi2.0-0 libcups2 libdbus-1-3 libdrm2 \
  libgbm1 libgtk-3-0 libnspr4 libnss3 \
  libxcomposite1 libxdamage1 libxfixes3 \
  libxkbcommon0 libxrandr2 xdg-utils
```

### 5. Clone and Setup Application

```bash
cd /home/deploy
git clone YOUR_REPO_URL metaads-scraper
cd metaads-scraper

# Install dependencies
yarn install --production

# Install Playwright Chromium
npx playwright install chromium
```

### 6. Configure Environment Variables

```bash
cp .env.example .env
nano .env
```

Set:

```env
NODE_ENV=production
PORT=8080
SCRAPER_API_KEY=your-generated-secret-key-here
CORS_ORIGINS=https://yourfrontend.vercel.app
MONGO_URL=mongodb+srv://user:pass@cluster.mongodb.net/metaads_cache
DB_NAME=metaads_cache
SCRAPER_HEADLESS=true
```

### 7. Start with PM2

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

### 8. Setup Nginx Reverse Proxy

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/metaads-scraper
```

Add:

```nginx
server {
    listen 80;
    server_name api.yourapp.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
        proxy_send_timeout 120s;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/metaads-scraper /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 9. Setup SSL with Let's Encrypt

```bash
sudo certbot --nginx -d api.yourapp.com
```

### 10. Configure Firewall

```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

## 🔄 Updates and Maintenance

### Update Application

```bash
cd /home/deploy/metaads-scraper
git pull
yarn install --production
pm2 restart metaads-scraper
```

### Monitor Logs

```bash
pm2 logs metaads-scraper
pm2 monit
```

### Check Status

```bash
pm2 status
curl https://api.yourapp.com/health
```

## 🔗 Frontend Integration

In your Next.js frontend `.env`:

```env
NEXT_PUBLIC_API_URL=https://api.yourapp.com
METAADS_SCRAPER_API_KEY=your-scraper-api-key
```

## 🐳 Docker Deployment (Alternative)

```bash
# Build image
docker build -t metaads-scraper .

# Run container
docker run -d \
  --name metaads-scraper \
  --restart unless-stopped \
  -p 8080:8080 \
  --env-file .env \
  metaads-scraper

# Check logs
docker logs -f metaads-scraper
```

## 📊 Monitoring

### PM2 Monitoring

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Health Checks

Setup external monitoring (UptimeRobot, Better Uptime) to ping:

```
https://api.yourapp.com/health
```

## 🔒 Security Checklist

- ✅ Environment variables secured
- ✅ API key authentication enabled
- ✅ HTTPS/SSL configured
- ✅ Firewall enabled
- ✅ Rate limiting active
- ✅ CORS properly configured
- ✅ Security headers via Helmet
- ✅ Input validation with Zod
- ✅ No hardcoded secrets
- ✅ Logs rotated
- ✅ Auto-restart on crashes

## 🆘 Troubleshooting

### Chromium Not Found

```bash
npx playwright install chromium
```

### Permission Denied

```bash
sudo chown -R deploy:deploy /home/deploy/metaads-scraper
```

### High Memory Usage

Adjust PM2 config:

```javascript
max_memory_restart: '1G'
instances: 1  // Reduce instances if needed
```

### Scraper Timeout

Increase timeouts in `.env`:

```env
SCRAPER_NAVIGATION_TIMEOUT_MS=90000
```

## 📝 Notes

- Scraper uses ~500MB-1GB RAM per instance
- Keep 2 instances for load balancing
- MongoDB cache reduces scraping load
- Rate limits prevent abuse
- Auto-restart on OOM errors
- Logs stored in `./logs/`
