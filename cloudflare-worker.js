/**
 * Canvas CORS Proxy — Cloudflare Worker
 *
 * Deploy steps:
 *  1. Sign up free at cloudflare.com
 *  2. Go to Workers & Pages → Create Application → Create Worker
 *  3. Paste this file and click Deploy
 *  4. Copy the worker URL shown (e.g. https://canvas-proxy.yourname.workers.dev)
 *  5. Paste that URL into the PROXY_URL constant at the top of canvas-todo.html
 *
 * How it works:
 *  - Browser sends GET requests to the worker with header X-Canvas-Token: <token>
 *  - Worker rewrites the request to bristolcc.instructure.com with a proper
 *    Authorization: Bearer header and returns the response with CORS headers
 *  - The token is never stored anywhere — one request in, one request out
 */

const CANVAS_BASE = 'https://bristolcc.instructure.com';

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

    const token = request.headers.get('X-Canvas-Token');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing X-Canvas-Token header' }), {
        status: 400,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const incoming = new URL(request.url);
    const canvasUrl = CANVAS_BASE + incoming.pathname + incoming.search;

    let canvasRes;
    try {
      canvasRes = await fetch(canvasUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to reach Canvas: ' + err.message }), {
        status: 502,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    const responseHeaders = new Headers(corsHeaders());
    const contentType = canvasRes.headers.get('Content-Type') || 'application/json';
    responseHeaders.set('Content-Type', contentType);

    // Rewrite Link header pagination URLs so the browser can follow them through the proxy
    const linkHeader = canvasRes.headers.get('Link');
    if (linkHeader) {
      const workerOrigin = incoming.origin;
      const rewritten = linkHeader.replace(/https:\/\/bristolcc\.instructure\.com/g, workerOrigin);
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
    'Access-Control-Allow-Headers': 'X-Canvas-Token, Content-Type',
    'Access-Control-Expose-Headers': 'Link',
  };
}
