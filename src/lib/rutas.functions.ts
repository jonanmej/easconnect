import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/mapbox";

/** Oficina EA Service & Consulting — punto de salida fijo. */
export const OFICINA_ORIGEN = {
  label: "Boulevard Venezuela #2731, Colonia Luz, San Salvador",
  lat: 13.691649,
  lng: -89.217841,
} as const;

export type RutaAlternativa = {
  index: number;
  resumen: string;
  distanciaMetros: number;
  distanciaTexto: string;
  duracionSegundos: number;
  duracionTexto: string;
  /** Trazado de la ruta como pares [lng, lat]. */
  coordenadas: [number, number][];
  warnings: string[];
};

export type ComputeRutasResult = {
  origen: { lat: number; lng: number; label: string };
  destino: { lat: number; lng: number; label: string };
  rutas: RutaAlternativa[];
};

function fmtDistancia(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function fmtDuracion(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

function requireKeys() {
  const lovable = process.env.LOVABLE_API_KEY;
  const mapbox = process.env.MAPBOX_API_KEY;
  if (!lovable || !mapbox) {
    throw new Error("Credenciales de Mapbox no disponibles en el servidor");
  }
  return { lovable, mapbox };
}

/** Perfil de enrutamiento de Mapbox equivalente a cada medio de transporte. */
const PERFIL_MAPBOX: Record<string, string> = {
  DRIVE: "driving-traffic",
  TWO_WHEELER: "driving",
  WALK: "walking",
  BICYCLE: "cycling",
};

const inputSchema = z
  .object({
    destinoTexto: z.string().trim().min(3).max(300).optional(),
    destinoLat: z.number().gte(-90).lte(90).optional(),
    destinoLng: z.number().gte(-180).lte(180).optional(),
    modo: z.enum(["DRIVE", "TWO_WHEELER", "WALK", "BICYCLE"]).default("DRIVE"),
  })
  .refine(
    (v) => Boolean(v.destinoTexto) || (typeof v.destinoLat === "number" && typeof v.destinoLng === "number"),
    { message: "Indica una dirección o coordenadas de destino" },
  );

export const computeRutas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ComputeRutasResult> => {
    const { lovable, mapbox } = requireKeys();
    const headers = {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": mapbox,
    };

    // 1) Resolver destino (geocoding de Mapbox si vino como texto)
    let destLat = data.destinoLat;
    let destLng = data.destinoLng;
    let destLabel = data.destinoTexto ?? "";

    if (typeof destLat !== "number" || typeof destLng !== "number") {
      const q = new URLSearchParams({
        q: data.destinoTexto ?? "",
        country: "sv",
        language: "es",
        limit: "1",
        proximity: `${OFICINA_ORIGEN.lng},${OFICINA_ORIGEN.lat}`,
      });
      const geoResp = await fetch(`${GATEWAY_URL}/search/geocode/v6/forward?${q.toString()}`, { headers });
      if (!geoResp.ok) {
        const text = await geoResp.text();
        throw new Error(`Geocoding falló (${geoResp.status}): ${text.slice(0, 200)}`);
      }
      const geo = (await geoResp.json()) as {
        features?: Array<{
          properties?: { full_address?: string; name?: string; place_formatted?: string };
          geometry?: { coordinates?: [number, number] };
        }>;
      };
      const top = geo.features?.[0];
      const coords = top?.geometry?.coordinates;
      if (!top || !coords) throw new Error("No se encontró la dirección de destino");
      destLng = Number(coords[0]);
      destLat = Number(coords[1]);
      destLabel =
        top.properties?.full_address ||
        [top.properties?.name, top.properties?.place_formatted].filter(Boolean).join(", ") ||
        destLabel;
    }

    // 2) Directions API — rutas alternativas
    const perfil = PERFIL_MAPBOX[data.modo] ?? "driving";
    const coordsPath = `${OFICINA_ORIGEN.lng},${OFICINA_ORIGEN.lat};${destLng},${destLat}`;
    const rq = new URLSearchParams({
      alternatives: "true",
      geometries: "geojson",
      overview: "full",
      language: "es",
      steps: "false",
    });
    const routesResp = await fetch(
      `${GATEWAY_URL}/directions/v5/mapbox/${perfil}/${coordsPath}?${rq.toString()}`,
      { headers },
    );
    if (!routesResp.ok) {
      const text = await routesResp.text();
      throw new Error(`Directions API falló (${routesResp.status}): ${text.slice(0, 300)}`);
    }

    const payload = (await routesResp.json()) as {
      code?: string;
      message?: string;
      routes?: Array<{
        distance?: number;
        duration?: number;
        weight_name?: string;
        geometry?: { coordinates?: [number, number][] };
        legs?: Array<{ summary?: string }>;
      }>;
    };
    if (payload.code && payload.code !== "Ok") {
      throw new Error(payload.message || `Directions API: ${payload.code}`);
    }

    const rutas: RutaAlternativa[] = (payload.routes ?? [])
      .filter((r) => (r.geometry?.coordinates?.length ?? 0) > 1)
      .map((r, i) => {
        const secs = Math.round(Number(r.duration ?? 0));
        const meters = Math.round(Number(r.distance ?? 0));
        const summary = (r.legs ?? []).map((l) => l.summary).filter(Boolean).join(" · ");
        return {
          index: i,
          resumen: summary || (i === 0 ? "Ruta recomendada" : `Alternativa ${i}`),
          distanciaMetros: meters,
          distanciaTexto: fmtDistancia(meters),
          duracionSegundos: secs,
          duracionTexto: fmtDuracion(secs),
          coordenadas: r.geometry!.coordinates! as [number, number][],
          warnings: [],
        };
      });

    if (!rutas.length) {
      throw new Error(
        `No se encontraron rutas ${
          data.modo === "DRIVE" || data.modo === "TWO_WHEELER" ? "terrestres" : ""
        } desde la oficina hacia "${destLabel}" en modo ${data.modo}. ` +
        "Verifica que el destino sea accesible desde El Salvador por el medio de transporte elegido.",
      );
    }

    return {
      origen: { lat: OFICINA_ORIGEN.lat, lng: OFICINA_ORIGEN.lng, label: OFICINA_ORIGEN.label },
      destino: { lat: destLat, lng: destLng, label: destLabel },
      rutas,
    };
  });

// =============================================================
// Destinos a partir de OTs en estado "en_progreso"
// =============================================================

export type DestinoOT = {
  trabajoId: string;
  folio: string;
  servicio: string;
  plantaId: string;
  plantaNombre: string;
  ubicacion: string | null;
  latitud: number | null;
  longitud: number | null;
  clienteId: string;
  clienteNombre: string;
  tecnicoId: string | null;
  tecnicoNombre: string | null;
};

export const listDestinosOTs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DestinoOT[]> => {
    const { data, error } = await context.supabase
      .from("trabajos")
      .select(
        "id, folio, servicio, tecnico_id, plantas!inner(id, nombre, ubicacion, latitud, longitud, clientes!inner(id, nombre))"
      )
      .eq("estado", "en_progreso")
      .order("fecha_programada", { ascending: false });
    if (error) throw new Error(error.message);

    const tecnicoIds = Array.from(
      new Set((data ?? []).map((r: any) => r.tecnico_id).filter(Boolean) as string[]),
    );
    const tecnicos = new Map<string, string>();
    if (tecnicoIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, display_name, nombres, apellidos")
        .in("id", tecnicoIds);
      (profs ?? []).forEach((p: any) => {
        const nombre =
          [p.nombres, p.apellidos].filter(Boolean).join(" ").trim() || p.display_name || "";
        tecnicos.set(p.id, nombre);
      });
    }

    return (data ?? []).map((r: any) => ({
      trabajoId: r.id,
      folio: r.folio,
      servicio: r.servicio,
      plantaId: r.plantas.id,
      plantaNombre: r.plantas.nombre,
      ubicacion: r.plantas.ubicacion,
      latitud: r.plantas.latitud != null ? Number(r.plantas.latitud) : null,
      longitud: r.plantas.longitud != null ? Number(r.plantas.longitud) : null,
      clienteId: r.plantas.clientes.id,
      clienteNombre: r.plantas.clientes.nombre,
      tecnicoId: r.tecnico_id,
      tecnicoNombre: r.tecnico_id ? tecnicos.get(r.tecnico_id) ?? null : null,
    }));
  });

// =============================================================
// Destinatarios para compartir una ruta (técnico asignado + supervisores + admins)
// =============================================================

export type RecipienteRuta = {
  userId: string;
  nombre: string;
  email: string | null;
  rol: "tecnico" | "supervisor" | "admin";
};

export const listRecipientesRuta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ trabajoId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RecipienteRuta[]> => {
    // Solo admin/supervisor pueden listar destinatarios (incluye emails)
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: isSup } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "supervisor",
    });
    const { data: isTec } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "tecnico",
    });
    if (!isAdmin && !isSup && !isTec) throw new Error("No autorizado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Roles relevantes
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "supervisor"]);
    if (roleErr) throw new Error(roleErr.message);

    const ids = new Set<string>((roleRows ?? []).map((r: any) => r.user_id));
    const rolMap = new Map<string, "admin" | "supervisor" | "tecnico">();
    (roleRows ?? []).forEach((r: any) => {
      // Admin gana sobre supervisor
      const prev = rolMap.get(r.user_id);
      if (!prev || (prev === "supervisor" && r.role === "admin")) {
        rolMap.set(r.user_id, r.role);
      }
    });

    // Técnico asignado a esta OT
    let tecnicoId: string | null = null;
    if (data.trabajoId) {
      const { data: t } = await context.supabase
        .from("trabajos")
        .select("tecnico_id")
        .eq("id", data.trabajoId)
        .maybeSingle();
      tecnicoId = (t?.tecnico_id as string | null) ?? null;
      if (tecnicoId && !rolMap.has(tecnicoId)) {
        rolMap.set(tecnicoId, "tecnico");
        ids.add(tecnicoId);
      }
    }

    if (!ids.size) return [];

    // Nombres desde profiles
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, nombres, apellidos")
      .in("id", Array.from(ids));
    const nombreMap = new Map<string, string>();
    (profs ?? []).forEach((p: any) => {
      const n =
        [p.nombres, p.apellidos].filter(Boolean).join(" ").trim() || p.display_name || "";
      nombreMap.set(p.id, n);
    });

    // Emails desde auth.users (paginado)
    const emailMap = new Map<string, string>();
    let page = 1;
    for (;;) {
      const { data: u, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      u.users.forEach((usr) => {
        if (ids.has(usr.id) && usr.email) emailMap.set(usr.id, usr.email);
      });
      if (u.users.length < 200) break;
      page++;
      if (page > 20) break;
    }

    return Array.from(ids).map((id) => ({
      userId: id,
      nombre: nombreMap.get(id) || "(sin nombre)",
      email: emailMap.get(id) ?? null,
      rol: rolMap.get(id) ?? "tecnico",
    }));
  });

// =============================================================
// Enviar ruta por correo (Gmail del workspace, plantilla EA)
// =============================================================

export const enviarRutaEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      destinatarios: z.array(z.string().email()).min(1).max(20),
      asunto: z.string().min(3).max(200),
      origenLabel: z.string().min(1),
      destinoLabel: z.string().min(1),
      modoLabel: z.string().min(1),
      rutaResumen: z.string().min(1),
      duracionTexto: z.string().min(1),
      distanciaTexto: z.string().min(1),
      gmapsUrl: z.string().url(),
      ot: z
        .object({
          folio: z.string(),
          servicio: z.string(),
          clienteNombre: z.string(),
          plantaNombre: z.string(),
          tecnicoNombre: z.string().nullable().optional(),
        })
        .nullable()
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Solo admin/supervisor/tecnico pueden enviar
    const [{ data: isAdmin }, { data: isSup }, { data: isTec }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "supervisor" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "tecnico" }),
    ]);
    if (!isAdmin && !isSup && !isTec) throw new Error("No autorizado");

    const { sendGmail, emailLayout } = await import("./notifications.server");

    const otBlock = data.ot
      ? `
        <table cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;width:100%;">
          <tr><td style="font-size:13px;color:#0f172a;">
            <p style="margin:0 0 4px;"><strong>OT ${data.ot.folio}</strong> — ${data.ot.servicio}</p>
            <p style="margin:0;color:#475569;">Cliente: ${data.ot.clienteNombre}</p>
            <p style="margin:0;color:#475569;">Planta: ${data.ot.plantaNombre}</p>
            ${data.ot.tecnicoNombre ? `<p style="margin:0;color:#475569;">Técnico asignado: ${data.ot.tecnicoNombre}</p>` : ""}
          </td></tr>
        </table>`
      : "";

    const html = emailLayout(
      "Ruta de trabajo asignada",
      `
        <p style="margin:0 0 12px;font-size:14px;color:#0f172a;">
          Te compartimos la ruta sugerida para esta visita técnica.
        </p>
        ${otBlock}
        <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;color:#0f172a;margin:0 0 16px;">
          <tr><td style="color:#64748b;">Origen</td><td>${data.origenLabel}</td></tr>
          <tr><td style="color:#64748b;">Destino</td><td>${data.destinoLabel}</td></tr>
          <tr><td style="color:#64748b;">Modo</td><td>${data.modoLabel}</td></tr>
          <tr><td style="color:#64748b;">Ruta</td><td>${data.rutaResumen}</td></tr>
          <tr><td style="color:#64748b;">Tiempo</td><td>${data.duracionTexto}</td></tr>
          <tr><td style="color:#64748b;">Distancia</td><td>${data.distanciaTexto}</td></tr>
        </table>
        <p style="margin:16px 0;">
          <a href="${data.gmapsUrl}" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600;display:inline-block;">
            Abrir en Google Maps
          </a>
        </p>
      `,
    );

    const resultados = await Promise.all(
      data.destinatarios.map((to) => sendGmail({ to, subject: data.asunto, html, categoria: "rutas" })),
    );
    const enviados = resultados.filter((r) => r.ok).length;
    const fallidos = resultados.length - enviados;
    if (enviados === 0) {
      throw new Error("No se pudo enviar el correo. Revisa la configuración de Gmail.");
    }
    return { enviados, fallidos };
  });