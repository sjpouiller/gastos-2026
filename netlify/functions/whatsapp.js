const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

function getDb() {
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT)) });
  }
  return getFirestore();
}

const CATEGORIAS = {
  'Gasto fijo': ['ABL/ARBA','Agua envasada','Colegio','CUBA','Cuotas préstamos','Cuotas tarjetas de crédito','Empleada doméstica','Expensas','Impuestos','Internet','Jardinero/Piletero','Obra social/Prepaga','Psicólogo','Seguro auto','Seguro hogar','Servicios - Agua','Servicios - Gas','Servicios - Luz','Servicios - Movistar','Servicios - Streaming','Otros fijos'],
  'Gasto variable': ['Almuerzos','Bienestar','Cafe','Carniceria','Colegios/útiles','Comida con amigos','Cosas casa','Delivery','Estacionamiento','Farmacia','Gimnasio','Kiosco','Librería','Limpieza','Mantenimiento auto','Nafta','Otros','Peajes','Regalos','Ropa','Salidas a comer','Salidas con los chicos','Supermercado','Suscripciones','Uber/Taxi','Vacaciones','Verduleria','Viajes'],
  'Ingreso': ['Aguinaldo','Freelance','Lanusses','Otros ingresos','Sueldo','Sueldo USD','Venta USD','Venta activos'],
  'Ahorro': ['Ahorro general','Compra USD','Fondo emergencia','Inversiones']
};

const FORMAS_PAGO = ['Transferencia','Efectivo','Tarjeta Credito - VISA Sebas','Tarjeta Credito - MASTER Sebas','Tarjeta Credito - VISA Male','Tarjeta Credito - MASTER Male','Tarjeta Debito','Tarjeta Credito CUOTAS'];

function twimlReply(msg) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/xml' },
    body: `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg}</Message></Response>`
  };
}

function hoy() {
  return new Date().toISOString().split('T')[0];
}

function mesDesFecha(fecha) {
  return fecha.slice(0, 7);
}

function formatMonto(n) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n);
}

async function llamarClaude(messages, system) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, system, messages })
  });
  const d = await r.json();
  return d.content?.[0]?.text || '';
}

async function transcribirAudio(mediaUrl) {
  const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const audioResp = await fetch(mediaUrl, { headers: { Authorization: authHeader } });
  if (!audioResp.ok) throw new Error('No pude descargar el audio');
  const audioBuffer = await audioResp.arrayBuffer();

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'audio.ogg');
  formData.append('model', 'whisper-1');
  formData.append('language', 'es');

  const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: formData
  });
  const wd = await whisperResp.json();
  if (!whisperResp.ok) throw new Error(wd.error?.message || 'Error Whisper');
  return wd.text || '';
}

async function fetchImagenBase64(mediaUrl, mimeType) {
  const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const resp = await fetch(mediaUrl, { headers: { Authorization: authHeader } });
  if (!resp.ok) throw new Error('No pude descargar la imagen');
  const buf = await resp.arrayBuffer();
  return { data: Buffer.from(buf).toString('base64'), mimeType };
}

function buildPrompt() {
  const cats = Object.entries(CATEGORIAS).map(([t, cs]) => `${t}: ${cs.join(', ')}`).join('\n');
  return `Sos un asistente que extrae datos de gastos/ingresos de mensajes en español argentino (Rio de la Plata).
Devolvé SOLO un JSON válido, sin texto extra ni bloques de código.

Campos requeridos:
- tipo: "Gasto fijo" | "Gasto variable" | "Ingreso" | "Ahorro"
- categoria: exactamente como aparece en la lista
- monto: número en ARS (sin símbolos, sin puntos de miles)
- formaPago: exactamente como aparece en la lista
- fecha: "YYYY-MM-DD" (hoy si no se especifica: ${hoy()})
- descripcion: string breve opcional (puede ser "")

Categorías:
${cats}

Formas de pago: ${FORMAS_PAGO.join(', ')}

Reglas:
- "débito" → "Tarjeta Debito"
- "crédito" sin especificar → "Tarjeta Credito - VISA Sebas"
- sin forma de pago mencionada → "Efectivo"
- "k" o "K" en montos = miles (ej: "30k" = 30000)
- Si hay texto sobre la imagen (ticket, recibo), extraé el total y el comercio/rubro más probable
- Si no podés extraer un gasto válido → {"error": "razón breve"}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  const params = new URLSearchParams(event.body);
  const from = params.get('From') || '';
  const body = (params.get('Body') || '').trim();
  const numMedia = parseInt(params.get('NumMedia') || '0');
  const mediaUrl = numMedia > 0 ? params.get('MediaUrl0') : null;
  const mediaType = numMedia > 0 ? (params.get('MediaContentType0') || '') : '';

  const phone = from.replace('whatsapp:', '');

  // Buscar usuario por teléfono en Firestore
  let usuario, hogarId;
  try {
    const db = getDb();
    const snap = await db.collection('usuarios').where('telefono', '==', phone).get();
    if (snap.empty) {
      return twimlReply('No encontré tu usuario en Fina 🤔\n\nRegistrá tu número en la app:\nConfiguración → Mi cuenta → Perfil → Teléfono');
    }
    usuario = snap.docs[0].data();
    hogarId = usuario.hogarId;
  } catch (e) {
    console.error('DB lookup:', e);
    return twimlReply('Error interno. Intentá de nuevo en unos segundos.');
  }

  const quien = usuario.nombre || usuario.email || phone;
  let texto = body;
  let imagenPayload = null;

  // Audio → Whisper
  if (mediaType.startsWith('audio/')) {
    try {
      texto = await transcribirAudio(mediaUrl);
      if (!texto) return twimlReply('No entendí el audio. Probá hablando más claro o mandá un mensaje de texto.');
    } catch (e) {
      console.error('Whisper:', e);
      return twimlReply('No pude procesar el audio. Probá mandando un mensaje de texto por ahora.');
    }
  }

  // Imagen → base64 para Claude Vision
  if (mediaType.startsWith('image/')) {
    try {
      imagenPayload = await fetchImagenBase64(mediaUrl, mediaType);
    } catch (e) {
      console.error('Imagen:', e);
      return twimlReply('No pude leer la imagen. Probá mandando el gasto como texto.');
    }
  }

  if (!texto && !imagenPayload) {
    return twimlReply('Mandame un texto, audio o foto de un ticket para cargar un gasto 💸');
  }

  // Armar mensaje para Claude
  let messages;
  if (imagenPayload) {
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imagenPayload.mimeType, data: imagenPayload.data } },
        { type: 'text', text: texto ? `Contexto adicional: ${texto}` : 'Extraé el gasto de este ticket.' }
      ]
    }];
  } else {
    messages = [{ role: 'user', content: texto }];
  }

  // Llamar a Claude
  let gasto;
  try {
    const respuesta = await llamarClaude(messages, buildPrompt());
    gasto = JSON.parse(respuesta.replace(/```(?:json)?\n?|\n?```/g, '').trim());
  } catch (e) {
    console.error('Claude parse:', e);
    return twimlReply('No entendí el gasto 🤷\nProbá con algo como:\n"nafta 30000 débito"\n"super 18500 efectivo"\nO mandá una foto del ticket.');
  }

  if (gasto.error) {
    return twimlReply(`No pude extraer el gasto: ${gasto.error}\n\nEjemplos:\n• "nafta 30k débito"\n• "delivery 8500 efectivo"\n• foto del ticket`);
  }

  // Guardar en Firestore
  const fecha = gasto.fecha || hoy();
  const mes = mesDesFecha(fecha);
  const cat = gasto.categoria || 'Otros';
  const tipo = gasto.tipo || 'Gasto variable';

  try {
    const db = getDb();
    await db.collection('hogares').doc(hogarId).collection('gastos').add({
      fecha,
      mes,
      tipo,
      categoria: tipo !== 'Ingreso' ? cat : '',
      tipoIngreso: tipo === 'Ingreso' ? cat : '',
      monto: gasto.monto,
      formaPago: gasto.formaPago || 'Efectivo',
      pago: quien,
      descripcion: gasto.descripcion || '',
      comentario: gasto.descripcion || '',
      fuente: 'whatsapp',
      usuario: usuario.email || phone,
      creadoEn: FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.error('Firestore write:', e);
    return twimlReply('Error al guardar. Intentá de nuevo.');
  }

  const emoji = tipo === 'Ingreso' ? '💰' : tipo === 'Ahorro' ? '🏦' : '✅';
  const lineas = [
    `${emoji} Guardado en Fina!`,
    `📂 ${cat}`,
    `💵 $${formatMonto(gasto.monto)}`,
    `💳 ${gasto.formaPago || 'Efectivo'}`,
    `📅 ${fecha}`
  ];
  if (gasto.descripcion) lineas.push(`💬 ${gasto.descripcion}`);

  return twimlReply(lineas.join('\n'));
};
