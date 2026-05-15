exports.handler = async function(event) {
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { asunto, mensaje, usuario } = JSON.parse(event.body || '{}');
    if(!mensaje?.trim()) return { statusCode: 400, body: JSON.stringify({ error: 'Falta mensaje' }) };

    const html = `<!DOCTYPE html><html><body style="margin:0;font-family:-apple-system,sans-serif;background:#f5f5f3">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1a1a1a;padding:24px 28px">
      <div style="color:#fff;font-size:20px;font-weight:700">💬 Plata Clara — Contacto</div>
      <div style="color:#aaa;font-size:13px;margin-top:4px">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}</div>
    </div>
    <div style="padding:28px;font-size:14px;color:#333;line-height:1.8">
      <div style="margin-bottom:8px"><strong>De:</strong> ${usuario||'Desconocido'}</div>
      <div style="margin-bottom:16px"><strong>Asunto:</strong> ${asunto||'Sin asunto'}</div>
      <div style="background:#f9f9f7;border-radius:10px;padding:16px;white-space:pre-wrap">${mensaje}</div>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #e5e5e0;font-size:11px;color:#aaa;text-align:center">
      Plata Clara · <a href="https://plataclara.netlify.app" style="color:#aaa">Abrir app</a>
    </div>
  </div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'Plata Clara <onboarding@resend.dev>',
        to: ['sjpouiller@gmail.com'],
        subject: `💬 [Plata Clara] ${asunto||'Mensaje'} — ${usuario||'Usuario'}`,
        html
      })
    });

    if(!res.ok) {
      const err = await res.text();
      return { statusCode: 500, body: JSON.stringify({ error: err }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
