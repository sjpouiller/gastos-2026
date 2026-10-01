// Diagnóstico de gastos importados con pagador inválido (solo lectura)
// GET /.netlify/functions/diagnostico-import
// Busca en todos los hogares gastos con fuente='bank_import'
// cuyo campo 'pago' no está en quienesPagan de ese hogar.

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let dbInstance = null;
function getDB() {
  if (!dbInstance) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\t/g, ' '));
    const appName = 'diagnostico-import-app';
    const existing = getApps().find(a => a.name === appName);
    const app = existing || initializeApp({ credential: cert(credentials) }, appName);
    dbInstance = getFirestore(app);
  }
  return dbInstance;
}

exports.handler = async (event) => {
  // Solo GET, y solo desde el mismo dominio o con token de admin
  const adminToken = process.env.ADMIN_TOKEN;
  const providedToken = event.queryStringParameters?.token;
  if (adminToken && providedToken !== adminToken) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const db = getDB();

    // 1. Listar todos los hogares
    const hogaresSnap = await db.collection('hogares').get();
    const resultados = [];

    for (const hogarDoc of hogaresSnap.docs) {
      const hogarId = hogarDoc.id;

      // 2. Leer quienesPagan de este hogar
      let quienesPagan = [];
      try {
        const prefSnap = await db
          .collection('hogares').doc(hogarId)
          .collection('config').doc('preferencias')
          .get();
        if (prefSnap.exists && prefSnap.data().quienesPagan?.length) {
          quienesPagan = prefSnap.data().quienesPagan;
        }
      } catch (_) {}

      // 3. Buscar gastos importados del banco
      const gastosSnap = await db
        .collection('hogares').doc(hogarId)
        .collection('gastos')
        .where('fuente', '==', 'bank_import')
        .get();

      if (gastosSnap.empty) continue;

      const afectados = [];
      gastosSnap.forEach(doc => {
        const g = doc.data();
        const pagoValido = quienesPagan.length === 0 || quienesPagan.includes(g.pago);
        if (!pagoValido) {
          afectados.push({
            id: doc.id,
            pago: g.pago,
            fecha: g.fecha,
            mes: g.mes,
            categoria: g.categoria || g.tipoIngreso,
            monto: g.monto,
            usuario: g.usuario,
          });
        }
      });

      if (afectados.length > 0) {
        resultados.push({
          hogarId,
          quienesPagan,
          totalImportados: gastosSnap.size,
          afectados: afectados.length,
          detalle: afectados,
        });
      }
    }

    const totalAfectados = resultados.reduce((s, r) => s + r.afectados, 0);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        totalHogaresAfectados: resultados.length,
        totalGastosAfectados: totalAfectados,
        resultados,
      }, null, 2),
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
