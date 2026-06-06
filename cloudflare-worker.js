/**
 * Canvas + Calendar CORS Proxy — Cloudflare Worker
 *
 * Endpoints:
 *  GET /* with X-Canvas-Token header   → proxies to bristolcc.instructure.com (Canvas API)
 *  GET /calendar with X-Calendar-URL  → proxies .ics feeds from whitelisted calendar hosts
 */

const CANVAS_BASE = 'https://bristolcc.instructure.com';

const CALENDAR_ALLOWED_HOSTS = [
  'calendar.google.com',
  'wildewoodeducation.teachworks.com',
];

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Only GET requests are supported' }), {
        status: 405,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const incoming = new URL(request.url);

    // ── Calendar proxy ──────────────────────────────────────────
    if (incoming.pathname === '/calendar') {
      const calUrl = request.headers.get('X-Calendar-URL');
      if (!calUrl) {
        return new Response(JSON.stringify({ error: 'Missing X-Calendar-URL header' }), {
          status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

      let parsed;
      try { parsed = new URL(calUrl); } catch {
        return new Response(JSON.stringify({ error: 'Invalid calendar URL' }), {
          status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

      if (!CALENDAR_ALLOWED_HOSTS.includes(parsed.hostname)) {
        return new Response(JSON.stringify({ error: 'Calendar host not allowed: ' + parsed.hostname }), {
          status: 403, headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

      try {
        const calRes = await fetch(calUrl, { headers: { 'Accept': 'text/calendar, */*' } });
        const body = await calRes.text();
        return new Response(body, {
          status: calRes.status,
          headers: { ...corsHeaders(), 'Content-Type': 'text/calendar; charset=utf-8' },
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Failed to fetch calendar: ' + err.message }), {
          status: 502, headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }
    }

    // ── Canvas proxy ────────────────────────────────────────────
    const token = request.headers.get('X-Canvas-Token');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing X-Canvas-Token header' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const canvasUrl = CANVAS_BASE + incoming.pathname + incoming.search;

    let canvasRes;
    try {
      canvasRes = await fetch(canvasUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to reach Canvas: ' + err.message }), {
        status: 502,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders = new Headers(corsHeaders());
    responseHeaders.set('Content-Type', canvasRes.headers.get('Content-Type') || 'application/json');

    const linkHeader = canvasRes.headers.get('Link');
    if (linkHeader) {
      const rewritten = linkHeader.replace(/https:\/\/bristolcc\.instructure\.com/g, incoming.origin);
      responseHeaders.set('Link', rewritten);
    }

    const body = await canvasRes.arrayBuffer();
    return new Response(body, { status: canvasRes.status, headers: responseHeaders });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'X-Canvas-Token, X-Calendar-URL, Content-Type',
    'Access-Control-Expose-Headers': 'Link',
  };
}
