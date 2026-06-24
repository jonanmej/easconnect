import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";

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
  polyline: string;
  warnings: string[];
};

export type ComputeRutasResult = {
  origen: { lat: number; lng: number; label: string };
  destino: { lat: number; lng: number; label: string };
  rutas: RutaAlternativa[];
};

function fmtDistancia(m: number): string {
  if (m < 1000) return `${m} m`;
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
  const gmaps = process.env.GOOGLE_MAPS_API_KEY;
  if (!lovable || !gmaps) {
    throw new Error("Credenciales de Google Maps no disponibles en el servidor");
  }
  return { lovable, gmaps };
}

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
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<ComputeRutasResult> => {
    const { lovable, gmaps } = requireKeys();

    // 1) Resolver destino (geocoding si vino como texto)
    let destLat = data.destinoLat;
    let destLng = data.destinoLng;
    let destLabel = data.destinoTexto ?? "";

    if (typeof destLat !== "number" || typeof destLng !== "number") {
      const geoResp = await fetch(
        `${GATEWAY_URL}/maps/api/geocode/json?address=${encodeURIComponent(
          data.destinoTexto ?? "",
        )}&region=sv&language=es`,
        {
          headers: {
            Authorization: `Bearer ${lovable}`,
            "X-Connection-Api-Key": gmaps,
          },
        },
      );
      if (!geoResp.ok) {
        const text = await geoResp.text();
        throw new Error(`Geocoding falló (${geoResp.status}): ${text.slice(0, 200)}`);
      }
      const geo = (await geoResp.json()) as {
        status: string;
        results: Array<{
          formatted_address: string;
          geometry: { location: { lat: number; lng: number } };
        }>;
      };
      if (geo.status !== "OK" || !geo.results.length) {
        throw new Error("No se encontró la dirección de destino");
      }
      const top = geo.results[0];
      destLat = top.geometry.location.lat;
      destLng = top.geometry.location.lng;
      destLabel = top.formatted_address;
    }

    // 2) Routes API — pedir rutas alternativas
    const routesResp = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": gmaps,
        "Content-Type": "application/json",
        "X-Goog-FieldMask":
          "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.description,routes.warnings,routes.routeLabels",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: OFICINA_ORIGEN.lat, longitude: OFICINA_ORIGEN.lng } } },
        destination: { location: { latLng: { latitude: destLat, longitude: destLng } } },
        travelMode: data.modo,
        routingPreference: data.modo === "DRIVE" ? "TRAFFIC_AWARE" : undefined,
        computeAlternativeRoutes: true,
        languageCode: "es-SV",
        units: "METRIC",
      }),
    });

    if (!routesResp.ok) {
      const text = await routesResp.text();
      throw new Error(`Routes API falló (${routesResp.status}): ${text.slice(0, 300)}`);
    }

    const payload = (await routesResp.json()) as {
      routes?: Array<{
        distanceMeters?: number;
        duration?: string;
        polyline?: { encodedPolyline?: string };
        description?: string;
        warnings?: string[];
        routeLabels?: string[];
      }>;
    };

    const rutas: RutaAlternativa[] = (payload.routes ?? [])
      .filter((r) => r.polyline?.encodedPolyline)
      .map((r, i) => {
        const secs = r.duration ? parseInt(String(r.duration).replace("s", ""), 10) || 0 : 0;
        const meters = r.distanceMeters ?? 0;
        const labels = r.routeLabels ?? [];
        const isDefault = labels.includes("DEFAULT_ROUTE");
        const resumen = r.description || (isDefault ? "Ruta recomendada" : `Alternativa ${i}`);
        return {
          index: i,
          resumen,
          distanciaMetros: meters,
          distanciaTexto: fmtDistancia(meters),
          duracionSegundos: secs,
          duracionTexto: fmtDuracion(secs),
          polyline: r.polyline!.encodedPolyline!,
          warnings: r.warnings ?? [],
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