# Total Rewards Builder — Deployment Guide

## Deploy to Railway (5 minutes, free tier)

### 1. Push to GitHub
```bash
cd trbuilder
git init
git add .
git commit -m "Initial deploy"
# Create a new repo at github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/total-rewards-builder.git
git push -u origin main
```

### 2. Deploy on Railway
1. Go to **railway.app** → Sign in with GitHub
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `total-rewards-builder` repo
4. Railway auto-detects Node.js and deploys

### 3. Set Environment Variables
In Railway dashboard → your project → **Variables** tab, add:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (your key) |
| `APP_PASSWORD` | `HRS26!` (or choose a new one) |

Railway automatically sets `PORT`.

### 4. Get your URL
Railway gives you a URL like `https://total-rewards-builder-production.up.railway.app`

Share that URL with your team — they enter the password and the AI features work using your API key, without ever seeing it.

---

## Security features built in
- ✓ API key stored server-side only (never sent to browser)
- ✓ Password required for every AI call
- ✓ Rate limiting: 20 AI requests per IP per hour
- ✓ Request logging in Railway console
- ✓ Timeouts on all Anthropic requests

## Changing the password
Update `APP_PASSWORD` in Railway Variables tab — no redeploy needed.

## Monitoring usage
View logs in Railway dashboard → your project → **Logs** tab.
Each AI call is logged with timestamp and IP.

## Local development
```bash
ANTHROPIC_API_KEY=sk-ant-... APP_PASSWORD=HRS26! node server.js
```
