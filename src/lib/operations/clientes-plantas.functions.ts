import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ClienteEstado } from "./helpers";

export const listClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clientes")
      .select("id, nombre, contacto, email, telefono, capacidad, capacidad_kwp, estado, contrato_om, solo_capacitacion, cuota_preventivos, cuota_correctivos, cuota_menores, cuota_medios, cuota_mayores, cuota_limpiezas, color_acento, created_at")
      .order("nombre");
    if (error) throw new Error(error.message);
    // include planta count
    const { data: plantas } = await context.supabase
      .from("plantas")
      .select("cliente_id");
    const counts = new Map<string, number>();
    (plantas ?? []).forEach((p) => counts.set(p.cliente_id, (counts.get(p.cliente_id) ?? 0) + 1));
    return (data ?? []).map((c) => ({ ...c, plantas_count: counts.get(c.id) ?? 0 }));
  });

export const upsertCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nombre: z.string().min(1),
      rut: z.string().nullable().optional(),
      contacto: z.string().nullable().optional(),
      email: z.string().email().nullable().optional().or(z.literal("")),
      telefono: z.string().nullable().optional(),
      capacidad: z.string().nullable().optional(),
      capacidad_kwp: z.coerce.number().min(0).nullable().optional(),
      estado: ClienteEstado,
      contrato_om: z.coerce.boolean().optional(),
      solo_capacitacion: z.coerce.boolean().optional(),
      cuota_preventivos: z.coerce.number().int().min(0).optional(),
      cuota_correctivos: z.coerce.number().int().min(0).optional(),
      cuota_menores: z.coerce.number().int().min(0).optional(),
      cuota_medios: z.coerce.number().int().min(0).optional(),
      cuota_mayores: z.coerce.number().int().min(0).optional(),
      cuota_limpiezas: z.coerce.number().int().min(0).optional(),
      color_acento: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, email, color_acento, ...rest } = data;
    const payload: any = { ...rest, email: email || null, color_acento: color_acento || null };
    const q = id
      ? context.supabase.from("clientes").update(payload).eq("id", id).select().single()
      : context.supabase.from("clientes").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("clientes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Plantas ============

export const listPlantas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("plantas")
      .select("id, nombre, ubicacion, paneles, capacidad, capacidad_kwp, eficiencia, ultima_limpieza, cliente_id, notificaciones_completado, email_notificaciones, sla_horas_respuesta, sla_horas_resolucion, latitud, longitud, clientes(nombre, color_acento)")
      .order("nombre");
    if (error) throw new Error(error.message);
    return (data ?? []).map((p: any) => ({
      ...p,
      cliente_nombre: p.clientes?.nombre ?? "—",
      cliente_color: p.clientes?.color_acento ?? null,
    }));
  });

export const upsertPlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      nombre: z.string().min(1),
      cliente_id: z.string().uuid(),
      ubicacion: z.string().nullable().optional(),
      paneles: z.coerce.number().int().min(0).default(0),
      capacidad: z.string().nullable().optional(),
      capacidad_kwp: z.coerce.number().min(0).nullable().optional(),
      eficiencia: z.coerce.number().min(0).max(100).nullable().optional(),
      notificaciones_completado: z.coerce.boolean().optional(),
      email_notificaciones: z.string().email().nullable().optional().or(z.literal("")),
      sla_horas_respuesta: z.coerce.number().int().min(0).nullable().optional(),
      sla_horas_resolucion: z.coerce.number().int().min(0).nullable().optional(),
      latitud: z.coerce.number().min(-90).max(90).nullable().optional(),
      longitud: z.coerce.number().min(-180).max(180).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { id, email_notificaciones, ...rest } = data;
    const payload: any = { ...rest };
    if (email_notificaciones !== undefined) payload.email_notificaciones = email_notificaciones || null;
    const q = id
      ? context.supabase.from("plantas").update(payload).eq("id", id).select().single()
      : context.supabase.from("plantas").insert(payload).select().single();
    const { data: row, error } = await q;
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePlanta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("plantas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ Importación masiva de plantas (CSV) ============

const PlantaImportRow = z.object({
  cliente: z.string().trim().min(1, "cliente requerido").max(200),
  planta: z.string().trim().min(1, "planta requerida").max(200),
  ubicacion: z.string().trim().max(300).optional().nullable(),
  paneles: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
  capacidad: z.string().trim().max(50).optional().nullable(),
  email_notificaciones: z
    .string()
    .trim()
    .email("email inválido")
    .max(255)
    .optional()
    .nullable()
    .or(z.literal("")),
});

export const importPlantasCSV = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    // Solo staff (admin / supervisor) puede importar
    const [{ data: isAdmin }, { data: isSup }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
    ]);
    if (!isAdmin && !isSup) throw new Error("Solo admin o supervisor pueden importar plantas");

    const { data: clientes, error: ec } = await context.supabase
      .from("clientes")
      .select("id, nombre");
    if (ec) throw new Error(ec.message);
    const clientesByName = new Map<string, string>();
    (clientes ?? []).forEach((c) => clientesByName.set(c.nombre.trim().toLowerCase(), c.id));

    const { data: plantasExist, error: ep } = await context.supabase
      .from("plantas")
      .select("id, nombre, cliente_id");
    if (ep) throw new Error(ep.message);
    const plantaKey = (cliente_id: string, nombre: string) =>
      `${cliente_id}::${nombre.trim().toLowerCase()}`;
    const plantasMap = new Map<string, string>();
    (plantasExist ?? []).forEach((p: any) =>
      plantasMap.set(plantaKey(p.cliente_id, p.nombre), p.id),
    );

    const errores: { fila: number; error: string }[] = [];
    const insertar: any[] = [];
    const actualizar: { id: string; payload: any }[] = [];

    data.rows.forEach((raw, idx) => {
      const fila = idx + 2; // +1 header, +1 base-1
      // Normaliza claves (case-insensitive, sin acentos)
      const norm: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        norm[k.trim().toLowerCase()] = typeof v === "string" ? v.trim() : v;
      }
      const parsed = PlantaImportRow.safeParse({
        cliente: norm["cliente"],
        planta: norm["planta"],
        ubicacion: norm["ubicacion"] || null,
        paneles: norm["paneles"] === "" || norm["paneles"] == null ? null : norm["paneles"],
        capacidad: norm["capacidad"] || null,
        email_notificaciones: norm["email_notificaciones"] || norm["email"] || null,
      });
      if (!parsed.success) {
        errores.push({ fila, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        return;
      }
      const row = parsed.data;
      const cliId = clientesByName.get(row.cliente.toLowerCase());
      if (!cliId) {
        errores.push({ fila, error: `Cliente no encontrado: "${row.cliente}"` });
        return;
      }
      const existId = plantasMap.get(plantaKey(cliId, row.planta));
      const payload: any = {
        nombre: row.planta,
        cliente_id: cliId,
        ubicacion: row.ubicacion || null,
        paneles: row.paneles ?? 0,
        capacidad: row.capacidad || null,
        email_notificaciones: row.email_notificaciones || null,
      };
      if (existId) {
        actualizar.push({ id: existId, payload });
      } else {
        insertar.push(payload);
      }
    });

    let creadas = 0;
    let actualizadas = 0;

    if (insertar.length) {
      const { error: ei, data: ins } = await context.supabase
        .from("plantas")
        .insert(insertar)
        .select("id");
      if (ei) throw new Error(`Error al insertar: ${ei.message}`);
      creadas = ins?.length ?? insertar.length;
    }
    for (const u of actualizar) {
      const { error: eu } = await context.supabase
        .from("plantas")
        .update(u.payload)
        .eq("id", u.id);
      if (eu) {
        errores.push({ fila: 0, error: `Update ${u.id}: ${eu.message}` });
      } else {
        actualizadas++;
      }
    }

    return {
      total: data.rows.length,
      creadas,
      actualizadas,
      errores,
    };
  });

// ============ Equipos ============
