# metaads-scraper

USA-only **Meta Ads Library** scraper powering the **Meta Ads Intelligence** module of [Social Operative Inc.](https://social-operative-inc.vercel.app).

> ⚠️ This folder is the **separate backend repo** (`metaads-scraper`). It is **excluded** from the frontend repo's `.gitignore` and is meant to be deployed on a Hostinger VPS (or any Linux VPS / Docker host) — **not on Vercel** (Playwright needs a long-lived process and Chromium, which serverless can't provide).

---

## Architecture

```
┌─────────────────────────┐        HTTPS         ┌──────────────────────────┐
│  social-operative-inc   │ ───/api/intel/*───▶  │   metaads-scraper VPS    │
│  (Next.js on Vercel)    │ ◀───JSON ads────     │  (Express + Playwright)  │
└─────────────────────────┘                       └──────────────────────────┘
        ▲    │                                              │
        │    │                                              ▼
   Supabase  │                                       MongoDB Atlas
  (auth +    │                                      (raw ad cache)
   saved ads)│
        OpenRouter
       (AI analysis)
```

- **Cache strategy:** L1 in-process LRU (~10 min) → L2 MongoDB Atlas (`SCRAPER_CACHE_TTL_SECONDS`, default 1 h) → live scrape.
- **Country lock:** every request is hard-locked to `country=US`. There is no public parameter to bypass this.
- **Browser pool:** a single Chromium instance is reused across requests and recycled every 80 pages to control memory.
- **Auth:** the frontend must send `X-API-Key: $SCRAPER_API_KEY` on every request. `/health` is public.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Public health + cache/scraper info |
| `GET` | `/ads?q=skincare&limit=30&media=all` | Search USA active ads. `media` ∈ `all\|image\|video`. |
| `GET` | `/advertiser/:pageId?limit=30` | All active ads from a specific Facebook page ID. |
| `GET` | `/cache/stats` | Memory + Mongo cache stats. |
| `POST` | `/cache/clear` | Clear in-memory cache. |

All ad results are enriched with:

```json
{
  "enrichment": {
    "niche": "skincare",
    "hookTypes": ["question", "stat-shock"],
    "urgencyScore": 2,
    "ctaStrength": 9,
    "engagementScore": 78,
    "wordCount": 124,
    "hasVideo": true,
    "hasCarousel": false
  }
}
```

Heavy AI analysis (hook detection beyond patterns, emotional triggers, viral probability) lives on the **frontend backend** via OpenRouter — keeping concerns clean.

---

## Local development

```bash
cd metaads-scraper
cp .env.example .env
# edit .env — set SCRAPER_API_KEY at minimum
npm install
npm run install-chromium   # downloads Chromium binary
npm run dev                # nodemon on :8080
```

Smoke test:

```bash
curl http://localhost:8080/health
curl -H "X-API-Key: $SCRAPER_API_KEY" "http://localhost:8080/ads?q=skincare&limit=10"
```

---

## Production deployment — Hostinger VPS (Ubuntu 22.04)

### 1. Provision the VPS
- Hostinger → VPS → minimum **2 vCPU / 4 GB RAM / 50 GB SSD** (Chromium is hungry).
- Ubuntu 22.04 LTS.

### 2. Install Node 20 + system deps
```bash
ssh root@YOUR_VPS_IP
apt update && apt -y upgrade
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs git nginx ufw

# Chromium system libs that Playwright needs:
apt -y install libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2 libpangocairo-1.0-0 libpango-1.0-0 \
  libcairo2 libdrm2 libxshmfence1 fonts-liberation
```

### 3. Clone the scraper repo
```bash
adduser --disabled-password --gecos "" socialops
su - socialops
git clone https://github.com/socialoperative-inc/metaads-scraper.git
cd metaads-scraper
cp .env.example .env
nano .env       # fill SCRAPER_API_KEY, MONGO_URL, CORS_ORIGINS
npm ci
npx playwright install chromium
```

### 4. Install PM2 and launch
```bash
sudo npm i -g pm2
sudo mkdir -p /var/log/metaads-scraper && sudo chown -R socialops:socialops /var/log/metaads-scraper
pm2 start ecosystem.config.js
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u socialops --hp /home/socialops
```

Verify: `pm2 status` and `curl http://127.0.0.1:8080/health`.

### 5. Nginx reverse proxy (HTTPS)
```bash
sudo nano /etc/nginx/sites-available/metaads-scraper
```
```nginx
server {
    listen 80;
    server_name scraper.YOURDOMAIN.com;

    client_max_body_size 256k;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_connect_timeout 10s;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/metaads-scraper /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 'Nginx Full' && sudo ufw allow OpenSSH && sudo ufw enable
```

### 6. TLS with Let's Encrypt
```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d scraper.YOURDOMAIN.com
```

### 7. Connect the frontend
In Vercel → `social-operative-inc` → Settings → Environment Variables:

| Key | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://scraper.YOURDOMAIN.com` |
| `METAADS_SCRAPER_URL` | `https://scraper.YOURDOMAIN.com` (server-side fallback) |
| `METAADS_SCRAPER_API_KEY` | (the same value as `SCRAPER_API_KEY` on the VPS) |

Redeploy. The frontend dashboard auto-detects the scraper via `/api/intel/health`.

### 8. (Alternative) Docker deploy
```bash
docker build -t metaads-scraper .
docker run -d --name metaads --restart=always -p 8080:8080 --env-file .env metaads-scraper
```

---

## Operational notes

- **Meta DOM rotates often.** The extractor uses the visible `"Library ID: <digits>"` text marker as the primary anchor — far more stable than CSS classes. If selectors drift, update `extractAds()` in `src/scrapers/meta-ads-library.js`.
- **Login walls:** Meta sometimes prompts for login. The scraper auto-dismisses dialogs; if you see auth pages, rotate IP via VPN/proxy or wait for the soft block to expire.
- **Rate limiting:** the public app blocks 60 req/min per IP by default. Tune `RATE_LIMIT_MAX` in `.env`.
- **Headless detection:** Meta is generally OK with headless Chromium for the Ads Library. If detection ramps up, switch `SCRAPER_HEADLESS=false` or run on a residential-proxied VPS.
- **Memory:** browser auto-recycles every 80 pages. PM2 also restarts on `max_memory_restart: 1500M`.
- **Logs:** `pm2 logs metaads-scraper` or `/var/log/metaads-scraper/*.log`.

---

## License

Internal — Social Operative Inc.
