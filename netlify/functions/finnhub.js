// Proxy seguro para Finnhub API
// La API key nunca llega al frontend

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const BASE = 'https://finnhub.io/api/v1';

// Caché en memoria: { symbol: { data, ts } }
const quoteCache = {};
const searchCache = {};
const CACHE_TTL = 60000; // 60 seg

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!FINNHUB_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Finnhub no configurado' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch(e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { action, symbol, query } = body;

  // ── QUOTE ──
  if (action === 'quote' && symbol) {
    const sym = symbol.toUpperCase();
    const cached = quoteCache[sym];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cached.data) };
    }
    try {
      const res = await fetch(`${BASE}/quote?symbol=${encodeURIComponent(sym)}&token=${FINNHUB_KEY}`);
      if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: 'Finnhub error' }) };
      const d = await res.json();
      const result = { symbol: sym, price: d.c, change: d.d, changePercent: d.dp, high: d.h, low: d.l, prevClose: d.pc };
      quoteCache[sym] = { data: result, ts: Date.now() };
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    } catch(e) {
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  // ── SEARCH ──
  if (action === 'search' && query) {
    const q = query.trim();
    const cached = searchCache[q];
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cached.data) };
    }
    try {
      const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&token=${FINNHUB_KEY}`);
      if (!res.ok) return { statusCode: res.status, body: JSON.stringify({ error: 'Finnhub error' }) };
      const d = await res.json();
      const result = (d.result || [])
        .filter(r => r.type === 'Common Stock' || r.type === 'ETP')
        .slice(0, 8)
        .map(r => ({ symbol: r.symbol, name: r.description, type: r.type }));
      searchCache[q] = { data: result, ts: Date.now() };
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result) };
    } catch(e) {
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Acción inválida. Usar action: "quote" o "search"' }) };
};
