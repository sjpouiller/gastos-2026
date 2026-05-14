// Netlify function: bank-import
// Parser genérico para extractos de cualquier banco argentino
// Usa Claude para parsear y categorizar inteligentemente

const CATEGORIAS = {
  'Ingreso': ['Aguinaldo','Freelance','Lanusses','Otros ingresos','Sueldo','Sueldo USD','Venta USD','Venta activos'],
  'Gasto fijo': ['ABL / ARBA','Agua envasada','Colegio','CUBA','Cuotas préstamos','Cuotas tarjetas de crédito','Empleada doméstica','Expensas','Impuestos','Impuestos Municipales','Internet','Jardinero/Piletero','Obra social / Prepaga','Otros fijos','Psicólogo','Seguro auto','Seguro hogar','Servicios - Agua','Servicios - Gas','Servicios - Luz','Servicios - Movistar','Servicios - Streaming (Netflix, Disney, Spotify, etc)'],
  'Gasto variable': ['Almuerzos','Bienestar','Cafe','Carniceria','Colegios / útiles','Comida con amigos','Cosas casa','Delivery','Estacionamiento','Farmacia','Gimnasio','Kiosco','Librería','Limpieza','Mantenimiento auto','Nafta','Otros','Peajes','Regalos','Ropa','Salidas a comer','Salidas con los chicos','Supermercado','Suscripciones','Uber / Taxi','Vacaciones','Verduleria','Viajes'],
  'Ahorro': ['Ahorro general','Compra USD','Fondo emergencia','Inversiones']
};

const CATS_TEXTO = Object.entries(CATEGORIAS)
  .map(([tipo, cats]) => `- ${tipo}: ${cats.join(', ')}`)
  .join('\n');

exports.handler = async function(event) {
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { texto, pdf_base64, banco, fecha_hoy } = JSON.parse(event.body || '{}');

    if(!texto && !pdf_base64){
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta texto o PDF' }) };
    }

    const PROMPT_SISTEMA = `Sos un parser experto de extractos bancarios argentinos para una app de finanzas personales.
${fecha_hoy ? `La fecha de hoy es ${fecha_hoy}. Usá esta fecha cuando el texto no especifique una fecha exacta (ej: "hoy", "ayer", etc.).` : ''}

Tu tarea es extraer TODOS los movimientos y asignarle a cada uno el tipo y categoría más apropiada.

CATEGORÍAS DISPONIBLES:
${CATS_TEXTO}

Para cada movimiento extraé:
- fecha: string YYYY-MM-DD
- descripcion: nombre limpio del comercio o concepto (sin códigos internos del banco)
- monto: número positivo
- tipo: uno de "Ingreso", "Gasto fijo", "Gasto variable", "Ahorro"
- categoria: una de las categorías listadas arriba que corresponda al tipo
- moneda: "ARS" o "USD"
- es_debito: true si es un egreso/gasto, false si es ingreso/acreditación

CRITERIOS DE CATEGORIZACIÓN:
- Usá el nombre del comercio para inferir la categoría. Ej: "FARMACITY" → Farmacia, "YPF" → Nafta, "AUTOPISTA" → Peajes, "NETFLIX" → Servicios - Streaming, "OSDE" → Obra social / Prepaga
- Débitos automáticos de servicios (agua, gas, luz, internet) → Gasto fijo con la categoría específica
- Transferencias recibidas → Ingreso / Otros ingresos (salvo que diga "sueldo" o similar)
- Transferencias enviadas → Gasto variable / Otros
- Si no podés determinar con certeza, usá "Gasto variable" / "Otros"
- Para gastos en restaurantes, bares, cafeterías → "Salidas a comer" o "Cafe"
- Para supermercados (Coto, Carrefour, Disco, Jumbo, DIA) → Supermercado
- Para delivery (Rappi, PedidosYa, Glovo) → Delivery

FORMATO DE RESPUESTA — solo JSON válido, sin texto extra:
{
  "movimientos": [
    {
      "fecha": "2026-05-10",
      "descripcion": "Farmacity Palermo",
      "monto": 8500,
      "tipo": "Gasto variable",
      "categoria": "Farmacia",
      "moneda": "ARS",
      "es_debito": true
    }
  ],
  "total_encontrados": 1,
  "advertencias": []
}

Ignorá: saldos, totales, encabezados, números de cuenta, fechas de cierre.
Si no hay movimientos: { "movimientos": [], "total_encontrados": 0, "advertencias": ["No se encontraron movimientos"] }`;

    let messages;

    if(pdf_base64){
      messages = [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf_base64 } },
          { type: 'text', text: `Extraé todos los movimientos de este extracto bancario${banco ? ' de ' + banco : ''} y devolvé el JSON.` }
        ]
      }];
    } else {
      messages = [{
        role: 'user',
        content: `Extraé todos los movimientos de este extracto bancario${banco ? ' de ' + banco : ''}:\n\n${texto}`
      }];
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        system: PROMPT_SISTEMA,
        messages
      })
    });

    const data = await res.json();
    const texto_respuesta = data.content?.[0]?.text || '';

    const jsonMatch = texto_respuesta.match(/\{[\s\S]*\}/);
    if(!jsonMatch){
      return {
        statusCode: 200,
        body: JSON.stringify({ movimientos: [], total_encontrados: 0, advertencias: ['No se pudo parsear la respuesta'] })
      };
    }

    const resultado = JSON.parse(jsonMatch[0]);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resultado)
    };

  } catch(e) {
    console.error('bank-import error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
