import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

const BUCKET = "firmas-clientes";

function randomToken(len = 32) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Staff genera un token de aprobación con TTL 7 días. */
export const solicitarAprobacion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trabajo_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const [{ data: isAdmin }, { data: isSup }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
    ]);
    if (!isAdmin && !isSup) throw new Error("Solo supervisores y admin pueden solicitar firma");

    const token = randomToken(24);
    const { data: ins, error } = await context.supabase
      .from("trabajo_aprobaciones")
      .insert({ trabajo_id: data.trabajo_id, token, creado_por: context.userId })
      .select("id, token, expira_at, trabajo_id")
      .single();
    if (error) throw new Error(error.message);

    const origin =
      process.env.PUBLIC_APP_URL ||
      process.env.LOVABLE_APP_URL ||
      `https://easconnect.lovable.app`;
    const link = `${origin.replace(/\/$/, "")}/aprobar/${token}`;
    return { ...ins, link };
  });

/** Staff lista aprobaciones (todas) o cliente las suyas (vía RLS). */
export const listAprobaciones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trabajo_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    let q = context.supabase
      .from("trabajo_aprobaciones")
      .select("id, trabajo_id, token, expira_at, firmado_at, firmante_nombre, created_at")
      .order("created_at", { ascending: false });
    if (data.trabajo_id) q = q.eq("trabajo_id", data.trabajo_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Vista pública: valida token y devuelve datos del trabajo. */
export const validarTokenAprobacion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("validar_token_aprobacion", { _token: data.token });
    if (error) throw new Error(error.message);
    const row = (rows as any[] | null)?.[0];
    if (!row) throw new Error("El enlace de aprobación es inválido o ha expirado.");
    return row;
  });

/** Vista pública: firma el trabajo. Recibe PNG base64. */
export const firmarAprobacion = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      token: z.string().min(8),
      firmante_nombre: z.string().min(2).max(120),
      firmante_rut: z.string().max(40).optional(),
      firma_png_base64: z.string().min(100), // data URL completo permitido
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Decodificar PNG
    const b64 = data.firma_png_base64.includes(",")
      ? data.firma_png_base64.split(",")[1]
      : data.firma_png_base64;
    const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (binary.length > 500_000) throw new Error("La firma excede 500 KB");

    // 2. Path único
    const path = `aprobaciones/${data.token.slice(0, 16)}-${Date.now()}.png`;
    const { error: upErr } = await supabaseAdmin.storage.from(BUCKET).upload(path, binary, {
      contentType: "image/png",
      upsert: false,
    });
    if (upErr) throw new Error(`Subiendo firma: ${upErr.message}`);

    // 3. Marcar aprobación
    const ip = getRequestIP({ xForwardedFor: true }) ?? null;
    const ua = getRequestHeader("user-agent") ?? null;
    const { data: rows, error } = await supabaseAdmin.rpc("firmar_aprobacion", {
      _token: data.token,
      _firmante_nombre: data.firmante_nombre,
      _firmante_rut: data.firmante_rut ?? null,
      _firma_storage_path: path,
      _ip: ip,
      _user_agent: ua,
    });
    if (error) {
      // limpiar firma huérfana
      await supabaseAdmin.storage.from(BUCKET).remove([path]).catch(() => {});
      throw new Error(error.message);
    }
    const r = (rows as any[] | null)?.[0];
    return { ok: true, trabajo_id: r?.trabajo_id, folio: r?.folio };
  });