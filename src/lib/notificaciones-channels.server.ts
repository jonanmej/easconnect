// Helpers de envío multi-canal (servidor). NO importar desde el cliente.
// Se usan tanto desde server functions (con sesión de usuario) como desde
// el cron /api/public/hooks/notificar-programaciones (con admin).

const GMAIL_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const TWILIO_URL = "https://connector-gateway.lovable.dev/twilio";

function b64url(str: string) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildRawEmail(opts: { from: string; to: string; subject: string; html: string }) {
  const boundary = "----=_Solaros_" + Math.random().toString(36).slice(2);
  const lines = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(opts.subject)))}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    opts.html,
    `--${boundary}--`,
  ].join("\r\n");
  return b64url(lines);
}

export async function sendEmail(opts: { from: string; to: string; subject: string; html: string }): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const gmailKey = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovableKey || !gmailKey) throw new Error("Conector Gmail no configurado");
  const raw = buildRawEmail(opts);
  const res = await fetch(`${GMAIL_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) throw new Error(`Gmail ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { id?: string };
  return j.id ?? null;
}

/** Envía un WhatsApp vía Twilio. Devuelve `null` si el conector no está configurado (no rompe). */
export async function sendWhatsApp(opts: { to: string; body: string; from?: string }): Promise<string | null> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const from = opts.from || process.env.TWILIO_WHATSAPP_FROM; // formato: 'whatsapp:+14155238886'
  if (!lovableKey || !twilioKey || !from) return null; // soft-skip
  const to = opts.to.startsWith("whatsapp:") ? opts.to : `whatsapp:${opts.to}`;
  const res = await fetch(`${TWILIO_URL}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": twilioKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: opts.body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { sid?: string };
  return j.sid ?? null;
}
