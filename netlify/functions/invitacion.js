exports.handler = async function(event) {
  if(event.httpMethod !== 'POST'){
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { emailInvitado, nombreInvitante, nombreHogar, link } = JSON.parse(event.body || '{}');
    if(!emailInvitado || !link) return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos' }) };

    const html = `<!DOCTYPE html><html><body style="margin:0;font-family:-apple-system,sans-serif;background:#f5f5f3">
  <div style="max-width:520px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="background:#1a1a1a;padding:24px 28px">
      <div style="color:#fff;font-size:22px;font-weight:700">💰 Fina</div>
      <div style="color:#aaa;font-size:13px;margin-top:4px">Invitación para unirte a un hogar</div>
    </div>
    <div style="padding:28px;font-size:14px;color:#333;line-height:1.8">
      <p style="margin:0 0 16px"><strong>${nombreInvitante}</strong> te invitó a unirte al hogar <strong>${nombreHogar}</strong> en Fina, la app para gestionar gastos en pareja o familia.</p>
      <a href="${link}" style="display:block;text-align:center;background:#1a1a1a;color:#fff;padding:15px 24px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;margin:24px 0">Unirme al hogar →</a>
      <p style="font-size:12px;color:#aaa;margin:0">Este link expira en 7 días. Si no esperabas esta invitación, podés ignorar este email.</p>
    </div>
    <div style="padding:16px 28px;border-top:1px solid #e5e5e0;font-size:11px;color:#aaa;text-align:center">
      Fina · <a href="https://plataclara.netlify.app" style="color:#aaa">plataclara.netlify.app</a>
    </div>
  </div>
</body></html>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: 'Fina <onboarding@resend.dev>',
        to: [emailInvitado],
        subject: `💰 ${nombreInvitante} te invitó a Fina`,
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
