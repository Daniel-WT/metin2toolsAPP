// _worker.js — Metin2 Tools Worker (Bridge Version)
// Handles API proxying and scheduled tasks without legacy session auth.
import { connect } from 'cloudflare:sockets';

// ── Allowed IPs for server status checks ──
const ALLOWED_IPS = new Set([
  '79.110.92.72','79.110.92.77',        // Romania
  '79.110.92.80','79.110.92.81',        // Tara Romaneasca
  '79.110.92.86','79.110.92.87',        // Magyarország
  '79.110.92.88','79.110.92.89',        // Česko
  '79.110.92.90','79.110.92.91','79.110.92.101', // Polska
]);

// ── Firebase Auth helper (service account → access token) ──
async function getGoogleAccessToken(serviceAccountJson) {
  const sa = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const signingInput = b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  });
  const keyData = sa.private_key.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\n/g, '');
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(keyData), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput));
  const jwt = signingInput + '.' + btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  return (await res.json()).access_token;
}

// ── Discord dedup ──
const _discordSent = new Map();
const DEDUP_TTL = 3600000;
function discordDedup(key) {
  const now = Date.now();
  for (const [k, t] of _discordSent) {
    if (now - t > DEDUP_TTL) _discordSent.delete(k);
  }
  if (_discordSent.has(key)) return false;
  _discordSent.set(key, now);
  return true;
}

// ── Handler principal ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── GET /api/whoami ──
    if (request.method === 'GET' && url.pathname === '/api/whoami') {
      return new Response(JSON.stringify({ role: 'user', note: 'Use Firebase Auth' }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // ── POST /api/discord-notify ──
    if (request.method === 'POST' && url.pathname === '/api/discord-notify') {
      try {
        const body = await request.json();
        const webhookUrl = body.webhookUrl || env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) return new Response('No webhook', { status: 500 });
        const { itemName, account, category, alertType, expiresIn } = body;
        const dedupKey = (body.itemId || (itemName + '|' + account)) + '_' + alertType;
        if (!discordDedup(dedupKey)) return new Response(JSON.stringify({ ok: true, dedup: true }));

        const isUrgent = alertType === 'urgent';
        const color = isUrgent ? 0xff2020 : alertType === '1day' ? 0xe05252 : 0xc8962e;
        let title = isUrgent ? `🚨 URGENT — Expira in ${body.hoursLeft || '?'}h!` : '🔔 Alerta Expirare';

        const embed = {
          title: title,
          color: color,
          fields: [
            { name: 'Item', value: itemName || 'N/A', inline: true },
            { name: 'Cont', value: account || 'N/A', inline: true },
            { name: 'Categorie', value: category || 'N/A', inline: true },
            { name: 'Timp ramas', value: expiresIn || 'N/A', inline: true },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'Metin2 Tools' }
        };

        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] })
        });
        return new Response(JSON.stringify({ ok: true }));
      } catch (e) { return new Response(e.message, { status: 500 }); }
    }

    // ── GET /api/check-server ──
    if (request.method === 'GET' && url.pathname === '/api/check-server') {
      const ip = url.searchParams.get('ip');
      const port = parseInt(url.searchParams.get('port'));
      if (!ip || !port || !ALLOWED_IPS.has(ip)) return new Response('Invalid', { status: 400 });

      try {
        const socket = connect({ hostname: ip, port: port });
        const result = await Promise.race([
          socket.opened.then(() => true),
          new Promise(resolve => setTimeout(() => resolve(false), 2000))
        ]);
        try { socket.close(); } catch(e) {}
        return new Response(JSON.stringify({ online: result }));
      } catch(e) { return new Response(JSON.stringify({ online: false })); }
    }

    // ── POST /api/discord-server-status ──
    if (request.method === 'POST' && url.pathname === '/api/discord-server-status') {
      try {
        const body = await request.json();
        const webhookUrl = body.webhookUrl || env.DISCORD_SERVER_WEBHOOK_URL || env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) return new Response('No webhook', { status: 500 });
        const { server, channel, status } = body;
        const isOnline = status === 'online';
        const embed = {
          title: isOnline ? '🟢 Server Online' : '🔴 Server Offline',
          description: `**${server || 'Unknown'} ${channel || ''}** este acum **${isOnline ? 'ONLINE' : 'OFFLINE'}**`,
          color: isOnline ? 0x4caf82 : 0xe05252,
          timestamp: new Date().toISOString()
        };
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] })
        });
        return new Response(JSON.stringify({ ok: true }));
      } catch (e) { return new Response(e.message, { status: 500 }); }
    }

    // ── GET /api/time ──
    if (request.method === 'GET' && url.pathname === '/api/time') {
      return new Response(JSON.stringify({ utc: Date.now() }));
    }

    // ── POST /api/delete-user ──
    if (request.method === 'POST' && url.pathname === '/api/delete-user') {
      if (!env.FIREBASE_SERVICE_ACCOUNT) {
        return new Response(JSON.stringify({ ok: false, error: 'Service account not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
      try {
        const { uid } = await request.json();
        if (!uid) return new Response(JSON.stringify({ ok: false, error: 'Missing uid' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        const accessToken = await getGoogleAccessToken(env.FIREBASE_SERVICE_ACCOUNT);
        const authRes = await fetch(
          `https://identitytoolkit.googleapis.com/v1/projects/${env.FB_PROJECT_ID}/accounts:batchDelete`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ localIds: [uid], force: true })
          }
        );
        if (!authRes.ok) {
          const err = await authRes.text();
          return new Response(JSON.stringify({ ok: false, error: err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
        const fbBase = env.FB_DATABASE_URL.replace(/\/$/, '');
        const fbAuth = `auth=${env.FB_DATABASE_SECRET}`;
        await fetch(`${fbBase}/users/${uid}.json?${fbAuth}`, { method: 'DELETE' });
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }
    }

    // ── GET /firebase-config ──
    if (request.method === 'GET' && url.pathname === '/firebase-config') {
      return new Response(JSON.stringify({
        apiKey:      env.FB_API_KEY,
        authDomain:  `${env.FB_PROJECT_ID}.firebaseapp.com`,
        databaseURL: env.FB_DATABASE_URL,
        projectId:   env.FB_PROJECT_ID,
        appId:       env.FB_APP_ID,
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // ── POST /api/trigger-scrape ──
    if (request.method === 'POST' && url.pathname === '/api/trigger-scrape') {
      if (!env.GH_TOKEN) {
        return new Response(JSON.stringify({ ok: false, error: 'GH_TOKEN not configured' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      try {
        const body = await request.json().catch(() => ({}));
        const mode = body.mode || '';
        const forceAfter = body.force_after ? 'true' : 'false';
        const ghRes = await fetch(
          'https://api.github.com/repos/Daniel-WT/metin2tools/actions/workflows/transfer-tracking.yml/dispatches',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${env.GH_TOKEN}`,
              'Accept': 'application/vnd.github+json',
              'Content-Type': 'application/json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'metin2tools-worker'
            },
            body: JSON.stringify({
              ref: 'fix/m2tools',
              inputs: { mode, force_after: forceAfter }
            })
          }
        );
        if (!ghRes.ok) {
          const txt = await ghRes.text().catch(() => 'Unknown error');
          return new Response(JSON.stringify({ ok: false, error: 'GitHub: ' + txt }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // ── Serve Static Assets ──
    return env.ASSETS.fetch(request);
  },

  // ── Scheduled Tasks (Cron) — runs every hour ──
  async scheduled(event, env, ctx) {
    if (!env.FB_DATABASE_URL || !env.FB_DATABASE_SECRET) {
      console.log('[Cron] Missing FB config, skipping.');
      return;
    }

    const fbBase = env.FB_DATABASE_URL.replace(/\/$/, '');
    const fbAuth = `auth=${env.FB_DATABASE_SECRET}`;

    const fbGet = async (path) => {
      const sep = path.includes('?') ? '&' : '?';
      const res = await fetch(`${fbBase}/${path}${sep}${fbAuth}`);
      if (!res.ok) return null;
      return res.json().catch(() => null);
    };

    const fbPatch = async (path, data) => {
      await fetch(`${fbBase}/${path}?${fbAuth}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    };

    const now = Date.now();

    // ── Auto-scrape scheduling ──
    if (env.GH_TOKEN) {
      try {
        const scrapeSettings = await fbGet('meta/scrapeSettings.json');
        const scanDay = (scrapeSettings?.scanDay != null) ? scrapeSettings.scanDay : 3; // default Wed
        const nowDate = new Date(now);
        const currentDay = nowDate.getUTCDay();
        const currentHour = nowDate.getUTCHours();
        const todayStr = nowDate.toISOString().slice(0, 10);

        if (currentDay === scanDay) {
          const lastTrigger = await fbGet('meta/scrapeLastTrigger.json') || {};

          const ghDispatch = async (mode, forceAfter) => {
            await fetch(
              'https://api.github.com/repos/Daniel-WT/metin2tools/actions/workflows/transfer-tracking.yml/dispatches',
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${env.GH_TOKEN}`,
                  'Accept': 'application/vnd.github+json',
                  'Content-Type': 'application/json',
                  'X-GitHub-Api-Version': '2022-11-28',
                  'User-Agent': 'metin2tools-worker'
                },
                body: JSON.stringify({ ref: 'fix/m2tools', inputs: { mode, force_after: String(forceAfter) } })
              }
            );
            console.log(`[Cron] Dispatched GitHub Actions: mode=${mode}`);
          };

          // Before: 07:00 UTC (09:00 Romania EET)
          if (currentHour === 7 && lastTrigger.beforeDate !== todayStr) {
            await ghDispatch('before', false);
            await fbPatch('meta/scrapeLastTrigger.json', { beforeDate: todayStr, beforeAt: now });
          }

          // After: 09:00–21:00 UTC, once per hour (script auto-checks timestamps)
          if (currentHour >= 9 && currentHour <= 21 &&
              (lastTrigger.afterDate !== todayStr || lastTrigger.afterLastHour !== currentHour)) {
            await ghDispatch('after', false);
            await fbPatch('meta/scrapeLastTrigger.json', { afterDate: todayStr, afterLastHour: currentHour });
          }
        }
      } catch(e) {
        console.log('[Cron] Scrape scheduling error:', e.message);
      }
    }

    const DAY_MS = 86400000;
    const FOUR_DAY_MS = 345600000;
    const SIX_HOUR_MS = 21600000;
    const URGENT_CATS = ['skin-arma', 'costum', 'frizura', 'insotitor'];
    const PERS_CATS = ['skin-arma', 'costum', 'frizura'];

    const msToDisplay = (ms) => {
      const d = Math.floor(ms / DAY_MS);
      const h = Math.floor((ms % DAY_MS) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      return d > 0 ? `${d}z ${h}h ${m}m` : `${h}h ${m}m`;
    };

    console.log('[Cron] Starting hourly alert check...');

    // Get all team IDs (shallow=true returns { teamId: true, ... })
    const teamsShallow = await fbGet('teams.json?shallow=true');
    if (!teamsShallow || typeof teamsShallow !== 'object') {
      console.log('[Cron] No teams found.');
      return;
    }

    const teamIds = Object.keys(teamsShallow).slice(0, 10);
    console.log(`[Cron] Processing ${teamIds.length} team(s)...`);

    for (const teamId of teamIds) {
      try {
        const [skinData, notified, settings] = await Promise.all([
          fbGet(`teams/${teamId}/skinReminder/items.json`),
          fbGet(`teams/${teamId}/discordNotified.json`),
          fbGet(`teams/${teamId}/settings.json`)
        ]);

        const webhookUrl = settings?.discordWebhookSkin || env.DISCORD_WEBHOOK_URL;
        if (!webhookUrl) continue;

        const dedup = {
          day1:   notified?.day1   || {},
          day4:   notified?.day4   || {},
          hourly: notified?.hourly || {}
        };
        let dedupChanged = false;

        const allItems = Object.values(skinData || {}).filter(Boolean);

        const sendEmbed = async (item, alertType, hourSlot) => {
          const remaining = item.expiresAt - now;
          const expiresIn = alertType === 'urgent'
            ? `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m`
            : msToDisplay(remaining);
          const color = alertType === 'urgent' ? 0xff2020 : alertType === '1day' ? 0xe05252 : 0xc8962e;
          const title = alertType === 'urgent' ? `🚨 URGENT — Expira in ${hourSlot}h!` : '🔔 Alerta Expirare';
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embeds: [{
                title,
                color,
                fields: [
                  { name: 'Item',      value: item.name     || 'N/A', inline: true },
                  { name: 'Cont',      value: item.account  || 'N/A', inline: true },
                  { name: 'Categorie', value: item.category || 'N/A', inline: true },
                  { name: 'Timp ramas', value: expiresIn,              inline: true }
                ],
                timestamp: new Date().toISOString(),
                footer: { text: 'Metin2 Tools' }
              }]
            })
          });
        };

        for (const item of allItems) {
          if (!item.id || !item.expiresAt || item.category === 'sase-sapte') continue;
          const remaining = item.expiresAt - now;
          if (remaining <= 0) continue;

          // Urgent hourly (< 6h, important categories only)
          if (remaining < SIX_HOUR_MS && URGENT_CATS.includes(item.category)) {
            const hourSlot = Math.ceil(remaining / 3600000);
            const key = item.id + '_h' + hourSlot;
            if (!dedup.hourly[key]) {
              try { await sendEmbed(item, 'urgent', hourSlot); dedup.hourly[key] = true; dedupChanged = true; } catch(e) {}
            }
          }

          // 1-day alert
          if (remaining < DAY_MS && !dedup.day1[item.id]) {
            try { await sendEmbed(item, '1day'); dedup.day1[item.id] = true; dedupChanged = true; } catch(e) {}
          }

          // 4-day alert (personalized items only)
          if (remaining < FOUR_DAY_MS && PERS_CATS.includes(item.category) && item.personalized && !dedup.day4[item.id]) {
            try { await sendEmbed(item, '4day'); dedup.day4[item.id] = true; dedupChanged = true; } catch(e) {}
          }
        }

        if (dedupChanged) {
          await fbPatch(`teams/${teamId}/discordNotified.json`, dedup);
          console.log(`[Cron] Updated dedup for team ${teamId}`);
        }

      } catch (e) {
        console.error(`[Cron] Error for team ${teamId}:`, e.message);
      }
    }

    console.log('[Cron] Done.');
  }
};
