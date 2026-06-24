// Server-only Gmail sender via Lovable connector gateway.
// Uses the workspace Gmail connection (builder's account) to send
// transactional notifications to clientes.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function toBase64Url(str: string) {
  // Buffer is available in the Worker runtime with nodejs_compat
  return Buffer.from(str, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function buildRfc2822(to: string, subject: string, html: string, fromName = "EA Service Connect") {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
  return [
    `To: ${to}`,
    `From: ${fromName} <me>`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    html,
  ].join("\r\n");
}

export async function sendGmail(opts: { to: string; subject: string; html: string }) {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) {
    console.warn("[notifications] Gmail no configurado (faltan claves), omitiendo envío");
    return { ok: false, skipped: true };
  }
  if (!opts.to || !/.+@.+\..+/.test(opts.to)) {
    return { ok: false, skipped: true, reason: "destinatario inválido" };
  }

  const raw = toBase64Url(buildRfc2822(opts.to, opts.subject, opts.html));
  try {
    const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gmailKey,
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[notifications] Gmail envío falló", res.status, body);
      return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[notifications] Error envío Gmail", err);
    return { ok: false, error: String(err) };
  }
}

export function formatFechaEs(d: Date) {
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" });
}

const LOGO_LIGHT =
  "https://easconnect.lovable.app/__l5e/assets-v1/ce7174da-fe38-403c-b5cf-5828b21ac9ad/ea-service-connect-logo-light.png";
const LOGO_DARK =
  "https://easconnect.lovable.app/__l5e/assets-v1/c67d929c-4ade-469e-9577-738073147367/ea-service-connect-logo-transparent.png";

export function emailLayout(title: string, bodyHtml: string) {
  const bg = "#0F172A";
  const card = "#FFFFFF";
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
.logo-dark{display:none !important;}
.logo-light{display:block !important;}
@media (prefers-color-scheme: dark){
  .logo-light{display:none !important;}
  .logo-dark{display:block !important;}
}
[data-ogsc] .logo-light{display:none !important;}
[data-ogsc] .logo-dark{display:block !important;}
</style></head>
<body style="margin:0;padding:0;background:${bg};font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${card};border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
      <tr><td style="padding:24px 28px;">
        <!--[if !mso]><!-->
        <img class="logo-light" src="${LOGO_LIGHT}" alt="EA Service Connect" width="160" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:160px;" />
        <img class="logo-dark" src="${LOGO_DARK}" alt="EA Service Connect" width="160" style="display:none;border:0;outline:none;text-decoration:none;height:auto;max-width:160px;" />
        <!--<![endif]-->
        <!--[if mso]>
        <img src="${LOGO_LIGHT}" alt="EA Service Connect" width="160" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:160px;" />
        <![endif]-->
      </td></tr>
      <tr><td style="padding:8px 28px 28px;">
        <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#0f172a;">${title}</h1>
        <div style="font-size:14px;line-height:1.55;color:#1f2937;">${bodyHtml}</div>
      </td></tr>
      <tr><td style="padding:18px 28px;background:#f8fafc;color:#94a3b8;font-size:11px;text-align:center;border-top:1px solid #e2e8f0;">
        Este mensaje fue enviado automáticamente por EA Service Connect · proyectos@easervice.app
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}