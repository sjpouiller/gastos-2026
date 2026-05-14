// migrate.js — Migración a estructura multi-tenant
// Ejecutar UNA SOLA VEZ: GOOGLE_SERVICE_ACCOUNT='...' node migrate.js
// O con .env local: node -r dotenv/config migrate.js

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
  console.error('❌ Falta GOOGLE_SERVICE_ACCOUNT como env var');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT.replace(/\t/g, ' '));
initializeApp({ credential: cert(credentials) });
const db = getFirestore();

const HOGAR_ID = 'sjpouiller';

async function migrate() {
  console.log('🚀 Iniciando migración a multi-tenant...\n');

  // ─── 1. Migrar gastos/ → hogares/sjpouiller/gastos/ ───
  console.log('📦 Leyendo gastos...');
  const gastosSnap = await db.collection('gastos').get();
  console.log(`   Encontrados: ${gastosSnap.size} documentos`);

  let lote = db.batch();
  let count = 0;
  for (const docSnap of gastosSnap.docs) {
    const dest = db.collection('hogares').doc(HOGAR_ID).collection('gastos').doc(docSnap.id);
    lote.set(dest, docSnap.data());
    count++;
    if (count % 499 === 0) {
      await lote.commit();
      lote = db.batch();
      console.log(`   Commiteados ${count}...`);
    }
  }
  await lote.commit();
  console.log(`   ✓ ${count} gastos migrados\n`);

  // ─── 2. Migrar config/presupuestos ───
  console.log('📋 Migrando presupuestos...');
  const presSnap = await db.doc('config/presupuestos').get();
  if (presSnap.exists) {
    await db.doc(`hogares/${HOGAR_ID}/presupuestos/config`).set(presSnap.data());
    console.log('   ✓ Presupuestos migrados\n');
  } else {
    console.log('   — No había presupuestos\n');
  }

  // ─── 3. Migrar config/plan_lista ───
  console.log('📋 Migrando plan_lista...');
  const planSnap = await db.doc('config/plan_lista').get();
  if (planSnap.exists) {
    await db.doc(`hogares/${HOGAR_ID}/plan_lista/config`).set(planSnap.data());
    console.log('   ✓ Plan lista migrado\n');
  } else {
    console.log('   — No había plan_lista\n');
  }

  // ─── 4. Migrar resto de config/ (inflacion, perfil, cuotas, etc.) ───
  console.log('⚙️  Migrando config extra...');
  const configSnap = await db.collection('config').get();
  for (const docSnap of configSnap.docs) {
    if (['presupuestos', 'plan_lista'].includes(docSnap.id)) continue;
    await db.doc(`hogares/${HOGAR_ID}/config/${docSnap.id}`).set(docSnap.data());
    console.log(`   ✓ config/${docSnap.id}`);
  }
  console.log('');

  // ─── 5. Crear metadata del hogar ───
  console.log('🏠 Creando metadata del hogar...');
  await db.doc(`hogares/${HOGAR_ID}/metadata/info`).set({
    nombre: 'Sebas & Male',
    creadoPor: 'sjpouiller@gmail.com',
    coUsuarios: ['malelanusse@odiseaswimwear.com.ar'],
    objetivoAhorro: 20,
    creadoEn: FieldValue.serverTimestamp()
  });
  console.log('   ✓ Metadata creada\n');

  console.log('✅ Migración completada.\n');
  console.log('⚠️  PRÓXIMOS PASOS:');
  console.log('   1. Verificar en Firebase Console: hogares/sjpouiller/gastos/ tiene los datos');
  console.log('   2. NO borrar la colección gastos/ original hasta que la app funcione OK');
  console.log('   3. Deployar la nueva versión de la app y verificar con tu usuario');

  process.exit(0);
}

migrate().catch(e => { console.error('❌ Error:', e); process.exit(1); });
