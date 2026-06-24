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

function buildRfc2822(to: string, subject: string, html: string, fromName = "SOLAROS Notificaciones") {
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

export function emailLayout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif;color:#1f2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="background:#0f766e;padding:20px 24px;color:#ffffff;font-size:18px;font-weight:bold;">SOLAROS</td></tr>
        <tr><td style="padding:24px;">
          <h2 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${title}</h2>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;">
          Este es un correo automático de SOLAROS. Si tienes consultas, contacta a tu supervisor asignado.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}