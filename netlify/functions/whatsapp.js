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
  // Fecha Argentina (UTC-3)
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0];
}

function mesDesFecha(fecha) { return fecha.slice(0, 7); }

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
  if (!r.ok) throw new Error(`Claude error: ${JSON.stringify(d)}`);
  return d.content?.[0]?.text || '';
}

async function transcribirAudio(mediaUrl) {
  const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const audioResp = await fetch(mediaUrl, { headers: { Authorization: authHeader } });
  if (!audioResp.ok) throw new Error(`Audio download failed: ${audioResp.status}`);

  const audioBuffer = Buffer.from(await audioResp.arrayBuffer());
  const contentType = audioResp.headers.get('content-type') || 'audio/ogg';

  // Usar multipart/form-data manual con Buffer (más compatible en Node.js)
  const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
  const filename = contentType.includes('mp4') ? 'audio.mp4' : contentType.includes('mpeg') ? 'audio.mp3' : 'audio.ogg';

  const bodyParts = [
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1`,
    `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nes`,
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  ];

  const prefix = Buffer.from(bodyParts.join('\r\n') + '\r\n');
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([prefix, audioBuffer, suffix]);

  const whisperResp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });
  const wd = await whisperResp.json();
  if (!whisperResp.ok) throw new Error(`Whisper error: ${JSON.stringify(wd)}`);
  return wd.text || '';
}

async function fetchImagenBase64(mediaUrl, mimeType) {
  const authHeader = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const resp = await fetch(mediaUrl, { headers: { Authorization: authHeader } });
  if (!resp.ok) throw new Error(`Image download failed: ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  return { data: buf.toString('base64'), mimeType: mimeType.split(';')[0] };
}

function buildPrompt() {
  const cats = Object.entries(CATEGORIAS).map(([t, cs]) => `${t}: ${cs.join(', ')}`).join('\n');
  return `Sos un asistente que extrae datos de gastos/ingresos de mensajes en español argentino.
Devolvé SOLO un JSON válido, sin texto extra ni bloques de código markdown.

Campos requeridos:
- tipo: "Gasto fijo" | "Gasto variable" | "Ingreso" | "Ahorro"
- categoria: exactamente como aparece en la lista
- monto: número en ARS (solo dígitos, sin símbolos ni puntos)
- formaPago: exactamente como aparece en la lista
- fecha: "YYYY-MM-DD" (hoy si no se especifica: ${hoy()})
- descripcion: string breve opcional (puede ser "")

Categorías disponibles:
${cats}

Formas de pago disponibles: ${FORMAS_PAGO.join(', ')}

Reglas de interpretación:
- "débito" → "Tarjeta Debito"
- "crédito" sin especificar → "Tarjeta Credito - VISA Sebas"
- sin forma de pago mencionada → "Efectivo"
- "k" o "K" en montos = miles (ej: "30k" = 30000)
- Si hay imagen de ticket, extraé el total y el comercio más probable
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
  console.log('WA message from:', phone, '| body:', body, '| media:', mediaType);

  // Buscar usuario por teléfono en Firestore
  let usuario, hogarId;
  try {
    const db = getDb();
    const snap = await db.collection('usuarios').where('telefono', '==', phone).get();
    if (snap.empty) {
      console.log('Usuario no encontrado para:', phone);
      return twimlReply('No encontré tu usuario en Fina 🤔\n\nRegistrá tu número en la app:\nConfiguración → Mi cuenta → Perfil → Teléfono');
    }
    usuario = snap.docs[0].data();
    hogarId = usuario.hogarId;
    console.log('Usuario encontrado:', usuario.email, '| hogarId:', hogarId);
  } catch (e) {
    console.error('DB lookup error:', e);
    return twimlReply('Error interno al buscar tu usuario. Intentá de nuevo.');
  }

  const quien = usuario.nombre || usuario.email || phone;
  let texto = body;
  let imagenPayload = null;

  // Audio → Whisper
  if (mediaType.startsWith('audio/')) {
    if (!process.env.OPENAI_API_KEY) {
      return twimlReply('Los audios no están configurados todavía. Mandá el gasto como texto por ahora 👍');
    }
    try {
      console.log('Transcribiendo audio:', mediaUrl, mediaType);
      texto = await transcribirAudio(mediaUrl);
      console.log('Transcripción:', texto);
      if (!texto) return twimlReply('No entendí el audio. Probá hablando más claro o mandá un texto.');
    } catch (e) {
      console.error('Whisper error:', e);
      return twimlReply(`Error procesando audio: ${e.message}\nMandá el gasto como texto.`);
    }
  }

  // Imagen → base64
  if (mediaType.startsWith('image/')) {
    try {
      imagenPayload = await fetchImagenBase64(mediaUrl, mediaType);
    } catch (e) {
      console.error('Image error:', e);
      return twimlReply('No pude leer la imagen. Mandá el gasto como texto.');
    }
  }

  if (!texto && !imagenPayload) {
    return twimlReply('Mandame un texto, audio o foto de un ticket 💸\n\nEjemplos:\n• "nafta 30k débito"\n• "super 18500 efectivo"\n• "delivery 8500"');
  }

  // Armar mensaje para Claude
  let messages;
  if (imagenPayload) {
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imagenPayload.mimeType, data: imagenPayload.data } },
        { type: 'text', text: texto ? `Contexto: ${texto}` : 'Extraé el gasto de este ticket.' }
      ]
    }];
  } else {
    messages = [{ role: 'user', content: texto }];
  }

  // Llamar a Claude
  let gasto;
  try {
    const respuesta = await llamarClaude(messages, buildPrompt());
    console.log('Claude raw:', respuesta);
    const cleaned = respuesta.replace(/```(?:json)?\n?|\n?```/g, '').trim();
    gasto = JSON.parse(cleaned);
  } catch (e) {
    console.error('Claude parse error:', e);
    return twimlReply('No entendí el gasto 🤷\n\nProbá con:\n• "nafta 30k débito"\n• "super 18500 efectivo"\n• "delivery 8500"');
  }

  if (gasto.error) {
    return twimlReply(`No pude extraer el gasto: ${gasto.error}\n\nEjemplos:\n• "nafta 30k débito"\n• "super 18500"\n• foto del ticket`);
  }

  // Validar campos mínimos
  if (!gasto.monto || isNaN(Number(gasto.monto))) {
    return twimlReply('No encontré el monto en tu mensaje. Intentá de nuevo incluyendo el monto.\n\nEj: "nafta 30000 débito"');
  }

  // Guardar en Firestore
  const fecha = gasto.fecha || hoy();
  const mes = mesDesFecha(fecha);
  const cat = gasto.categoria || 'Otros';
  const tipo = gasto.tipo || 'Gasto variable';
  const monto = Number(gasto.monto);

  try {
    const db = getDb();
    const docData = {
      fecha,
      mes,
      tipo,
      categoria: tipo !== 'Ingreso' ? cat : '',
      tipoIngreso: tipo === 'Ingreso' ? cat : '',
      monto,
      formaPago: gasto.formaPago || 'Efectivo',
      pago: quien,
      comentario: gasto.descripcion || '',
      fuente: 'whatsapp',
      usuario: usuario.email || phone,
      creadoEn: FieldValue.serverTimestamp()
    };
    console.log('Guardando en Firestore:', JSON.stringify(docData));
    await db.collection('hogares').doc(hogarId).collection('gastos').add(docData);
    console.log('Guardado OK');
  } catch (e) {
    console.error('Firestore write error:', e);
    return twimlReply(`Error al guardar: ${e.message}`);
  }

  const emoji = tipo === 'Ingreso' ? '💰' : tipo === 'Ahorro' ? '🏦' : '✅';
  const lineas = [
    `${emoji} Guardado en Fina!`,
    `📂 ${cat}`,
    `💵 $${formatMonto(monto)}`,
    `💳 ${gasto.formaPago || 'Efectivo'}`,
    `📅 ${fecha}`
  ];
  if (gasto.descripcion) lineas.push(`💬 ${gasto.descripcion}`);

  return twimlReply(lineas.join('\n'));
};
