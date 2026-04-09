const { google } = require('googleapis');

const SPREADSHEET_ID = '1S6CNMsnqbjEy7zu21RWCAWYeiIOdgDI0h7y2CuVETPM';
const SHEET_NAME = 'Gastos';

exports.handler = async function(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method Not Allowed' };

  try {
    const gasto = JSON.parse(event.body);
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    const newId = `APP-${Date.now()}`;
    const fecha = gasto.fecha || '';
    const [year, month, day] = fecha.split('-');
    const fechaFormateada = `${parseInt(day)}/${parseInt(month)}/${year}`;
    const mesFormateado = `1/${parseInt(month)}/${year}`;
    const montoFormateado = ` $${parseInt(gasto.monto).toLocaleString('es-AR')}`;

    const nuevaFila = [
      newId,
      fechaFormateada,
      gasto.tipo || '',
      gasto.tipoIngreso || '',
      gasto.categoria || '',
      montoFormateado,
      gasto.formaPago || '',
      gasto.pago || '',
      mesFormateado,
      parseInt(gasto.monto) || 0,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A:J`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [nuevaFila] },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: newId }) };
  } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
