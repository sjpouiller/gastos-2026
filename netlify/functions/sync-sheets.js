const { google } = require('googleapis');

const SPREADSHEET_ID = '1S6CNMsnqbjEy7zu21RWCAWYeiIOdgDI0h7y2CuVETPM';
const SHEET_NAME = 'Cargas_App';

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

    // Primero obtener las hojas disponibles para verificar el nombre exacto
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    const sheetNames = spreadsheet.data.sheets.map(s => s.properties.title);
    console.log('Available sheets:', sheetNames);

    // Buscar la hoja correcta (Cargas_App o similar)
    const targetSheet = sheetNames.find(n => n.toLowerCase().includes('carga')) || sheetNames[0];
    console.log('Using sheet:', targetSheet);

    const newId = `APP-${Date.now()}`;
    const fecha = gasto.fecha || '';
    const [year, month, day] = fecha.split('-');
    const fechaFormateada = `${parseInt(day)}/${parseInt(month)}/${year}`;
    const mesFormateado = `1/${parseInt(month)}/${year}`;
    const montoNum = parseInt(gasto.monto) || 0;

    const nuevaFila = [
      newId,
      fechaFormateada,
      gasto.tipo || '',
      gasto.tipoIngreso || '',
      gasto.categoria || '',
      `$${montoNum.toLocaleString('es-AR')}`,
      gasto.formaPago || '',
      gasto.pago || '',
      mesFormateado,
      montoNum,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${targetSheet}'!A:J`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [nuevaFila] },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: newId, sheet: targetSheet }) };
  } catch(e) {
    console.error('Sync error:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
