// ── Total Rewards Builder — Secure API Proxy Server ──
// Deploy to Railway: railway up
// Environment variables required:
//   ANTHROPIC_API_KEY   — your Anthropic API key (sk-ant-...)
//   APP_PASSWORD        — password to access the app (default: HRS26!)
//   PORT                — set automatically by Railway

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3579;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const APP_PASSWORD = process.env.APP_PASSWORD || 'HRS26!';

if (!ANTHROPIC_API_KEY) {
  console.warn('⚠  ANTHROPIC_API_KEY not set — AI features will fail');
}

// ── Simple in-memory rate limiter ──
// Limit: 20 AI requests per IP per hour
const rateLimitMap = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateLimitMap.set(ip, entry);
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Clean up old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 30 * 60 * 1000);

// ── Simple request logger ──
function log(ip, method, path, status, note = '') {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${method} ${path} — ${status} — ${ip}${note ? ' — ' + note : ''}`);
}

// ── Verify app password ──
function verifyPassword(req) {
  const auth = req.headers['x-app-password'] || '';
  return auth === APP_PASSWORD;
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-app-password');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ── Serve the main HTML app ──
  if (req.method === 'GET' && (parsed.pathname === '/' || parsed.pathname === '/index.html')) {
    try {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      log(ip, 'GET', '/', 200);
    } catch (e) {
      res.writeHead(500);
      res.end('Could not load app');
      log(ip, 'GET', '/', 500, e.message);
    }
    return;
  }

  // ── Health check ──
  if (req.method === 'GET' && parsed.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    return;
  }

  // ── Anthropic API proxy ──
  if (req.method === 'POST' && parsed.pathname === '/v1/messages') {

    // 1. Verify app password
    if (!verifyPassword(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Unauthorized — invalid app password' } }));
      log(ip, 'POST', '/v1/messages', 401, 'bad password');
      return;
    }

    // 2. Rate limit
    if (!checkRateLimit(ip)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Rate limit exceeded — max 20 requests/hour per user' } }));
      log(ip, 'POST', '/v1/messages', 429, 'rate limited');
      return;
    }

    // 3. Forward to Anthropic
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {

      // Validate it's reasonable JSON
      try { JSON.parse(body); } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON body' } }));
        return;
      }

      const options = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      };

      const proxyReq = https.request(options, proxyRes => {
        res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
        proxyRes.pipe(res);
        log(ip, 'POST', '/v1/messages', proxyRes.statusCode);
      });

      proxyReq.on('error', e => {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Upstream error: ' + e.message } }));
        log(ip, 'POST', '/v1/messages', 502, e.message);
      });

      proxyReq.setTimeout(30000, () => {
        proxyReq.destroy();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Request timed out' } }));
        log(ip, 'POST', '/v1/messages', 504, 'timeout');
      });

      proxyReq.write(body);
      proxyReq.end();
    });
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n✓ Total Rewards Builder running at http://localhost:${PORT}`);
  console.log(`  API key: ${ANTHROPIC_API_KEY ? '✓ set' : '✗ MISSING — set ANTHROPIC_API_KEY'}`);
  console.log(`  Password: ${APP_PASSWORD}`);
  console.log(`  Rate limit: ${RATE_LIMIT} AI requests/IP/hour\n`);
});
