// Cron: el 1 de cada mes a las 9am Argentina (12:00 UTC)
// En netlify.toml agregar:
// [functions."email-mensual"]
//   schedule = "0 12 1 * *"

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let dbInstance = null;
function getDB() {
  if (!dbInstance) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const app = initializeApp({ credential: cert(credentials) }, 'email-mensual-app');
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-AR');
const fmtK = n => Math.abs(n) >= 1000000 ? (n < 0 ? '-' : '') + '$' + (Math.abs(n) / 1000000).toFixed(1) + 'M' : fmt(n);

async function getGastosMes(mes) {
  try {
    const db = getDB();
    const snapshot = await db.collection('gastos').where('mes', '==', mes).get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Error:', e);
    return [];
  }
}

async function generarAnalisisMensualIA(mesPasado, mesActual, gastosPasado, gastosActual) {
  const resumen = (gastos) => {
    const ing = gastos.filter(g => g.tipo === 'Ingreso').reduce((s, g) => s + (g.monto || 0), 0);
    const fij = gastos.filter(g => g.tipo === 'Gasto fijo').reduce((s, g) => s + (g.monto || 0), 0);
    const vrs = gastos.filter(g => g.tipo === 'Gasto variable').reduce((s, g) => s + (g.monto || 0), 0);
    const por = gastos.filter(g => g.tipo !== 'Ingreso' && g.tipo !== 'Ahorro')
      .reduce((a, g) => { const k = g.categoria || '?'; a[k] = (a[k] || 0) + (g.monto || 0); return a; }, {});
    const top = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([c, v]) => `${c}: ${fmtK(v)}`).join(', ');
    return { ing, fij, vrs, saldo: ing - fij - vrs, ahorro: ing > 0 ? Math.round((ing - fij - vrs) / ing * 100) : 0, top };
  };

  const rP = resumen(gastosPasado);
  const rA = resumen(gastosActual);
  const MESES = { '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' };
  const nombreMesPasado = MESES[mesPasado.slice(5)] || mesPasado;
  const nombreMesActual = MESES[mesActual.slice(5)] || mesActual;

  const prompt = `Sos el agente financiero de Sebas y Male, pareja argentina.

Datos del mes que pasó (${nombreMesPasado}):
- Ingresos: ${fmtK(rP.ing)}, Fijos: ${fmtK(rP.fij)}, Variables: ${fmtK(rP.vrs)}, Saldo: ${fmtK(rP.saldo)}, Ahorro: ${rP.ahorro}%
- Top gastos: ${rP.top}

Datos del mes anterior (${nombreMesActual}):
- Ingresos: ${fmtK(rA.ing)}, Fijos: ${fmtK(rA.fij)}, Variables: ${fmtK(rA.vrs)}, Saldo: ${fmtK(rA.saldo)}, Ahorro: ${rA.ahorro}%
- Top gastos: ${rA.top}

Escribí el recap mensual para el email familiar. Estructura exacta:
**Resumen de ${nombreMesPasado}**
[Una línea con lo más importante del mes]

**Lo que mejoró:**
[2-3 bullets concretos con números]

**Lo que empeoró:**
[2-3 bullets concretos con números]

**Cambios urgentes para ${new Date().toLocaleDateString('es-AR', {month:'long'})}:**
[2-3 acciones concretas]

**Número del mes:**
[Un número clave que resume el mes]

Español rioplatense, directo, máximo 250 palabras.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await res.json();
  return data.content?.[0]?.text || 'No se pudo generar el análisis.';
}

async function enviarEmail(asunto, cuerpo) {
  const hoy = new Date();
  const fechaStr = hoy.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f3;margin:0;padding:20px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e0">
    <div style="background:#1a1a1a;padding:24px 28px">
      <div style="font-size:24px;margin-bottom:4px">📅</div>
      <div style="color:#fff;font-size:18px;font-weight:700">${asunto}</div>
      <div style="color:#888;font-size:13px;margin-top:4px">${fechaStr}</div>
    </div>
    <div style="padding:28px;font-size:14px;line-height:1.9;color:#333;white-space:pre-wrap">${cuerpo.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
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
    const hoy = new Date();
    const mesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    const mesAntePasado = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
    const pad = n => String(n).padStart(2, '0');
    const mesPasadoStr = `${mesPasado.getFullYear()}-${pad(mesPasado.getMonth() + 1)}`;
    const mesAntePasadoStr = `${mesAntePasado.getFullYear()}-${pad(mesAntePasado.getMonth() + 1)}`;
    const MESES = { '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril', '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto', '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre' };
    const nombreMes = MESES[mesPasadoStr.slice(5)] || mesPasadoStr;

    const [gastosPasado, gastosAntePasado] = await Promise.all([
      getGastosMes(mesPasadoStr),
      getGastosMes(mesAntePasadoStr)
    ]);

    const analisis = await generarAnalisisMensualIA(mesPasadoStr, mesAntePasadoStr, gastosPasado, gastosAntePasado);
    const result = await enviarEmail(`📅 Recap de ${nombreMes}`, analisis);
    return { statusCode: 200, body: JSON.stringify({ ok: true, result }) };
  } catch (e) {
    console.error(e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
