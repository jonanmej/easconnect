import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const PasswordPolicySchema = z.object({
  longitud: z.coerce.number().int().min(8).max(64),
  requiere_mayusculas: z.boolean(),
  requiere_minusculas: z.boolean(),
  requiere_digitos: z.boolean(),
  requiere_simbolos: z.boolean(),
  excluir_ambiguos: z.boolean(),
});
export type PasswordPolicy = z.infer<typeof PasswordPolicySchema>;

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  longitud: 16,
  requiere_mayusculas: true,
  requiere_minusculas: true,
  requiere_digitos: true,
  requiere_simbolos: true,
  excluir_ambiguos: true,
};

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!data) throw new Error("Forbidden: requiere rol admin");
}

export const getPasswordPolicy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("system_config")
      .select("value")
      .eq("key", "password_policy")
      .maybeSingle();
    const parsed = PasswordPolicySchema.safeParse(data?.value);
    return parsed.success ? parsed.data : DEFAULT_PASSWORD_POLICY;
  });

export const setPasswordPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PasswordPolicySchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("system_config")
      .upsert(
        {
          key: "password_policy",
          value: data as any,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("auditoria_log").insert({
      entidad: "system_config",
      accion: "update",
      despues: { key: "password_policy", value: data } as any,
      actor: context.userId,
    });
    return { ok: true };
  });