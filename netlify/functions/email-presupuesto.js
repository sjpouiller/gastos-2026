// Envía alerta por email cuando una persona cruza el 80% o 100% de su presupuesto
// Llamado desde guardar() en index.html después de cada gasto variable

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let dbInstance = null;
function getDB() {
  if (!dbInstance) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\t/g, ' '));
    const appName = 'email-presupuesto-app';
    const existing = getApps().find(a => a.name === appName);
    const app = existing || initializeApp({ credential: cert(credentials) }, appName);
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

const fmt = n => '$' + Math.round(n || 0).toLocaleString('es-AR');
const MESES = { '01':'enero','02':'febrero','03':'marzo','04':'abril','05':'mayo','06':'junio','07':'julio','08':'agosto','09':'septiembre','10':'octubre','11':'noviembre','12':'diciembre' };

async function getPresupuesto(hogarId, persona, categoria) {
  const db = getDB();
  const scope = persona.toLowerCase(); // 'sebas' o 'male'

  // 1. Intentar presupuesto personal
  const personalSnap = await db.doc(`hogares/${hogarId}/presupuestos/${scope}`).get();
  if (personalSnap.exists) {
    const val = personalSnap.data().montos?.[categoria];
    if (val > 0) return { presupuesto: val, fuente: 'personal' };
  }

  // 2. Fallback a presupuesto conjunto
  const conjuntoSnap = await db.doc(`hogares/${hogarId}/presupuestos/config`).get();
  if (conjuntoSnap.exists) {
    const val = conjuntoSnap.data().montos?.[categoria];
    if (val > 0) return { presupuesto: val, fuente: 'conjunto' };
  }

  return { presupuesto: 0, fuente: null };
}

async function generarMensaje(nivel, persona, categoria, mesNombre, totalNuevo, presupuesto) {
  const restante = presupuesto - totalNuevo;
  const pct = Math.round(totalNuevo / presupuesto * 100);

  let prompt;
  if (nivel === 'superado') {
    prompt = `Sos el asistente financiero de Sebas y Male, una pareja argentina. ${persona} acaba de superar el presupuesto mensual de "${categoria}" en ${mesNombre}: gastó ${fmt(totalNuevo)} contra un presupuesto de ${fmt(presupuesto)} (${pct}%). Escribí un mensaje corto (2-3 oraciones), directo y un poco incisivo — sin exceso de emojis ni frases de relleno — avisando que se pasaron y qué podrían hacer. En primera persona del plural (nosotros/ustedes al estilo rioplatense).`;
  } else {
    prompt = `Sos el asistente financiero de Sebas y Male, una pareja argentina. ${persona} acaba de llegar al ${pct}% del presupuesto mensual de "${categoria}" en ${mesNombre}: gastó ${fmt(totalNuevo)} de ${fmt(presupuesto)}, le quedan ${fmt(restante)}. Escribí un mensaje corto (1-2 oraciones), amigable pero claro, sin frases de relleno. En primera persona del plural, estilo rioplatense.`;
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    return data.content?.[0]?.text || null;
  } catch (e) {
    return null;
  }
}

async function enviarAlerta({ asunto, emoji, colorBg, colorBorder, persona, categoria, mesNombre, totalNuevo, presupuesto, pct, cuerpo }) {
  const restante = presupuesto - totalNuevo;
  const hoy = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long' });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f3;margin:0;padding:20px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e5e5e0">
    <div style="background:#1a1a1a;padding:22px 28px">
      <div style="font-size:22px;margin-bottom:4px">${emoji} Fina</div>
      <div style="color:#fff;font-size:17px;font-weight:700">${asunto}</div>
      <div style="color:#888;font-size:12px;margin-top:4px">${hoy}</div>
    </div>
    <div style="padding:24px 28px">
      <div style="background:${colorBg};border:1px solid ${colorBorder};border-radius:12px;padding:16px;margin-bottom:18px">
        <div style="font-size:13px;color:#555;margin-bottom:10px">${cuerpo}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:8px;border-top:1px solid ${colorBorder}">
          <span style="font-size:12px;color:#888">${persona} · ${categoria} · ${mesNombre}</span>
          <span style="font-size:15px;font-weight:800;color:#1a1a1a">${pct}%</span>
        </div>
        <div style="background:#e5e5e0;border-radius:4px;height:6px;margin-top:8px;overflow:hidden">
          <div style="background:${colorBorder};height:100%;width:${Math.min(pct, 100)}%;border-radius:4px"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#888;margin-top:4px">
          <span>Gastado: ${fmt(totalNuevo)}</span>
          <span>Presupuesto: ${fmt(presupuesto)}</span>
        </div>
        ${restante < 0 ? `<div style="font-size:11px;color:#dc2626;margin-top:4px;font-weight:600">Exceso: ${fmt(Math.abs(restante))}</div>` : `<div style="font-size:11px;color:#888;margin-top:4px">Disponible: ${fmt(restante)}</div>`}
      </div>
    </div>
    <div style="padding:14px 28px;border-top:1px solid #e5e5e0;font-size:11px;color:#aaa;text-align:center">
      Fina · Sebas & Male · <a href="https://usefina.netlify.app" style="color:#2563eb;text-decoration:none">Abrir app →</a>
    </div>
  </div>
</body>
</html>`;

  const DESTINATARIOS = ['sjpouiller@gmail.com', 'malelanusse@odiseaswimwear.com.ar'];
  const resultados = [];
  for (const to of DESTINATARIOS) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: 'Fina 💰 <onboarding@resend.dev>', to, subject: `${emoji} ${asunto}`, html })
    });
    const data = await res.json();
    console.log(`Resend [${to}]:`, JSON.stringify(data));
    resultados.push({ to, status: res.status, data });
  }
  return resultados;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200 };
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  try {
    const { persona, categoria, mes, monto, totalAntes, hogarId, tipo } = JSON.parse(event.body || '{}');

    // Solo gastos variables
    if (tipo !== 'Gasto variable') return { statusCode: 200, body: JSON.stringify({ skipped: 'not variable' }) };
    if (!hogarId || !persona || !categoria || !mes || !monto) return { statusCode: 400, body: JSON.stringify({ error: 'missing fields' }) };

    const { presupuesto } = await getPresupuesto(hogarId, persona, categoria);
    if (!presupuesto) return { statusCode: 200, body: JSON.stringify({ skipped: 'no presupuesto for ' + categoria }) };

    const totalNuevo = (totalAntes || 0) + monto;
    const pctAntes = (totalAntes || 0) / presupuesto * 100;
    const pctNuevo = totalNuevo / presupuesto * 100;

    // Solo si se acaba de cruzar el umbral (evita spam en gastos posteriores)
    let nivel = null;
    if (pctAntes < 100 && pctNuevo >= 100) nivel = 'superado';
    else if (pctAntes < 80 && pctNuevo >= 80) nivel = 'advertencia';
    if (!nivel) return { statusCode: 200, body: JSON.stringify({ skipped: 'no threshold crossed', pctNuevo: Math.round(pctNuevo) }) };

    const mesNombre = MESES[mes.slice(5)] || mes;
    const pct = Math.round(pctNuevo);
    const cuerpoIA = await generarMensaje(nivel, persona, categoria, mesNombre, totalNuevo, presupuesto);

    const config = nivel === 'superado'
      ? { emoji: '🔴', colorBg: '#fef2f2', colorBorder: '#fca5a5', asunto: `${persona} superó el presupuesto de ${categoria} (${pct}%)` }
      : { emoji: '🟡', colorBg: '#fffbeb', colorBorder: '#fcd34d', asunto: `${persona} llegó al ${pct}% del presupuesto en ${categoria}` };

    const cuerpo = cuerpoIA || (nivel === 'superado'
      ? `${persona} superó el presupuesto mensual de "${categoria}" en ${mesNombre}.`
      : `${persona} llegó al ${pct}% del presupuesto de "${categoria}" en ${mesNombre}. Quedan ${fmt(presupuesto - totalNuevo)}.`);

    const resendResult = await enviarAlerta({ ...config, persona, categoria, mesNombre, totalNuevo, presupuesto, pct, cuerpo });

    console.log(`Alerta enviada: ${nivel} | ${persona} | ${categoria} | ${pct}%`);
    return { statusCode: 200, body: JSON.stringify({ sent: true, nivel, pct, resend: resendResult }) };

  } catch (e) {
    console.error('email-presupuesto error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
