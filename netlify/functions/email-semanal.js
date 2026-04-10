// Cron: todos los lunes a las 9am Argentina (12:00 UTC)
// En netlify.toml agregar:
// [functions."email-semanal"]
//   schedule = "0 12 * * 1"

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let dbInstance = null;
function getDB() {
  if (!dbInstance) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(credentials) }, 'email-app-' + Date.now());
    dbInstance = getFirestore();
  }
  return dbInstance;
}

const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-AR');
const fmtK = n => Math.abs(n) >= 1000000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000000).toFixed(1) + 'M' : fmt(n);

async function getGastosUltimaSemana() {
  try {
    const db = getDB();
    const hoy = new Date();
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - hoy.getDay() - 6); // lunes pasado
    const lunesStr = lunes.toISOString().slice(0, 10);
    const snapshot = await db.collection('gastos')
      .where('fecha', '>=', lunesStr)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Error getting gastos:', e);
    return [];
  }
}

async function generarAnalisisIA(gastos) {
  const totalGastos = gastos.filter(g => g.tipo !== 'Ingreso' && g.tipo !== 'Ahorro').reduce((s, g) => s + (g.monto || 0), 0);
  const totalIngresos = gastos.filter(g => g.tipo === 'Ingreso').reduce((s, g) => s + (g.monto || 0), 0);
  const porCategoria = gastos.filter(g => g.tipo !== 'Ingreso' && g.tipo !== 'Ahorro')
    .reduce((a, g) => { const k = g.categoria || g.tipoIngreso || '?'; a[k] = (a[k] || 0) + (g.monto || 0); return a; }, {});
  const top5 = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([c, v]) => `${c}: ${fmtK(v)}`).join(', ');

  const prompt = `Sos el agente financiero de Sebas y Male, pareja argentina.
Datos de la última semana:
- Total gastos: ${fmtK(totalGastos)}
- Total ingresos: ${fmtK(totalIngresos)}
- Top categorías: ${top5}
- Cantidad de movimientos: ${gastos.length}

Escribí un resumen semanal para el email familiar. Formato:
1. Una línea de introducción friendly
2. 3-4 bullets con los puntos más importantes (números reales)
3. Una recomendación concreta para la semana que empieza

Escribí en español rioplatense, directo, máximo 150 palabras. Sin saludos ni firmas.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await res.json();
  return data.content?.[0]?.text || 'No se pudo generar el análisis.';
}

async function enviarEmail(asunto, cuerpo) {
  const hoy = new Date();
  const fechaStr = hoy.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f3;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e0">
    <div style="background:#1a1a1a;padding:24px 28px">
      <div style="font-size:24px;margin-bottom:4px">💰</div>
      <div style="color:#fff;font-size:18px;font-weight:700">${asunto}</div>
      <div style="color:#888;font-size:13px;margin-top:4px">${fechaStr}</div>
    </div>
    <div style="padding:28px;font-size:14px;line-height:1.8;color:#333;white-space:pre-wrap">${cuerpo}</div>
    <div style="padding:16px 28px;border-top:1px solid #e5e5e0;font-size:11px;color:#aaa;text-align:center">
      Gastos 2026 · Sebas & Male · <a href="https://exquisite-starship-4e153a.netlify.app" style="color:#aaa">Abrir app</a>
    </div>
  </div>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'Gastos 2026 <onboarding@resend.dev>',
      to: ['sjpouiller@gmail.com', 'malelanusse@odiseaswimwear.com.ar'],
      subject: asunto,
      html
    })
  });
  return res.json();
}

exports.handler = async function(event) {
  try {
    const gastos = await getGastosUltimaSemana();
    const analisis = await generarAnalisisIA(gastos);
    const result = await enviarEmail('📊 Recap semanal de gastos', analisis);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
