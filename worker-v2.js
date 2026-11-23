// VIMI TREND — Cloudflare Worker short order links
// KV binding: VIMI_TREND_ORDERS
const SITE_BASE = 'https://vimitrend.github.io';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(data, status) {
  if (status === undefined) status = 200;
  return new Response(JSON.stringify(data), {
    status: status,
    headers: Object.assign({}, cors, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    })
  });
}

function makeId() {
  var b = new Uint8Array(9);
  crypto.getRandomValues(b);
  return Array.from(b, function(x) { return x.toString(16).padStart(2, '0'); }).join('');
}

function base64UrlUtf8(value) {
  var bytes = new TextEncoder().encode(value);
  var binary = '';
  for (var i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, service: 'VIMI TREND short links' });
    }

    if (url.pathname === '/api/shorten' && request.method === 'POST') {
      if (!env.VIMI_TREND_ORDERS) {
        return json({ error: 'KV binding missing' }, 500);
      }
      var body;
      try {
        body = await request.json();
      } catch (e) {
        return json({ error: 'Invalid JSON' }, 400);
      }
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 500) {
        return json({ error: 'items must be 1 to 500' }, 400);
      }
      var payload = JSON.stringify(body.items);
      if (payload.length > 900000) {
        return json({ error: 'Order too large' }, 413);
      }
      var id = makeId();
      await env.VIMI_TREND_ORDERS.put(id, payload, { expirationTtl: 31536000 });
      var shortUrl = new URL('/o/' + id, request.url).toString();
      return json({ ok: true, shortUrl: shortUrl, id: id, expiresInDays: 365 });
    }

    if (url.pathname.startsWith('/o/') && request.method === 'GET') {
      if (!env.VIMI_TREND_ORDERS) {
        return new Response('Storage not configured.', { status: 500 });
      }
      var id2 = url.pathname.slice(3).replace(/[^a-f0-9]/gi, '');
      if (!id2 || id2.length !== 18) {
        return new Response('Invalid link.', { status: 400 });
      }
      var stored = await env.VIMI_TREND_ORDERS.get(id2);
      if (!stored) {
        return new Response('Link expired or unavailable.', { status: 404 });
      }
      var encoded = base64UrlUtf8(stored);
      return Response.redirect(SITE_BASE + '/p.html#order=' + encoded, 302);
    }

    return json({ error: 'Not found' }, 404);
  }
};
