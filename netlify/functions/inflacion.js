/**
 * Netlify Function: inflacion.js
 * Obtiene los últimos 3 meses del IPC (nivel general nacional) del INDEC
 * y los guarda en Firestore hogares/sjpouiller/config/inflacion_indec
 *
 * Fuente: API pública del INDEC
 * Serie IPC nivel general nacional: id=101.1_I2N_2016_M_22
 * Docs: https://apis.datos.gob.ar/series/api/series/?ids=101.1_I2N_2016_M_22
 *
 * Disparado por:
 *   - POST /.netlify/functions/inflacion  (manual o desde la app)
 *   - Cron mensual (día 20 de cada mes, cuando INDEC ya publicó el dato)
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const SERIE_ID = '101.1_I2N_2016_M_22'; // IPC nivel general nacional (var% mensual)
const INDEC_API = `https://apis.datos.gob.ar/series/api/series/?ids=${SERIE_ID}&format=json&limit=6&sort=desc`;

// Fallback hardcodeado — actualizar manualmente si la API falla
// Formato: { mes: 'YYYY-MM', valor: número (% mensual) }
const FALLBACK_IPC = [
  { mes: '2026-06', valor: 1.9 },
  { mes: '2026-05', valor: 2.1 },
  { mes: '2026-04', valor: 2.6 },
];

function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)) });
  }
  return getFirestore();
}

async function fetchIndec() {
  const resp = await fetch(INDEC_API, { signal: AbortSignal.timeout(8000) });
  if (!resp.ok) throw new Error(`INDEC API error: ${resp.status}`);
  const json = await resp.json();

  const rows = json?.data || [];
  if (!rows.length) throw new Error('INDEC API: sin datos');

  // rows = [['YYYY-MM-DD', valor], ...] ordenados descendente
  const datos = rows
    .filter(r => r[1] !== null)
    .slice(0, 3)
    .map(r => ({
      mes: r[0].slice(0, 7), // 'YYYY-MM'
      valor: Math.round(r[1] * 10) / 10 // 1 decimal
    }));

  if (datos.length < 3) throw new Error('INDEC API: menos de 3 meses disponibles');
  return datos;
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  let datos;
  let fuente = 'indec';

  try {
    datos = await fetchIndec();
    console.log('INDEC datos obtenidos:', JSON.stringify(datos));
  } catch (e) {
    console.warn('INDEC API falló, usando fallback:', e.message);
    datos = FALLBACK_IPC;
    fuente = 'fallback';
  }

  const promedio = Math.round(datos.reduce((s, d) => s + d.valor, 0) / datos.length * 10) / 10;

  // Guardar en Firestore — en config global (no por hogar, es dato público)
  try {
    const db = getDb();
    await db.collection('config_global').doc('inflacion_indec').set({
      datos,
      promedio,
      fuente,
      actualizadoEn: FieldValue.serverTimestamp(),
      actualizadoEnMs: Date.now()
    });
    console.log(`Guardado: promedio=${promedio}%, fuente=${fuente}`);
  } catch (e) {
    console.error('Firestore write error:', e);
    // No falla el endpoint, devuelve los datos igual
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: true, datos, promedio, fuente })
  };
};
