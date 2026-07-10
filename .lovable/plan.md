## 1. Ajuste visual del logo PVSTOP

En `src/components/BrandLogo.tsx`, calibrar `THEME_SCALE.pvstop` (actualmente `{ light: 1.0, dark: 1.0 }`) para que el wordmark se vea del mismo tamaño en ambos temas. Los PNG `pvstop-light.png` (26.8 KB) y `pvstop-dark.png` (100.3 KB) tienen diferentes márgenes/ratio internos, así que subiré el factor del tema más pequeño (típicamente el light, que aparece más chico) mediante prueba visual con Playwright.

## 2. Nuevo módulo "Jornada laboral"

### 2.1 Base de datos — tabla `jornadas_laborales`

Migración con columnas:
- `id`, `tecnico_id` (uuid), `fecha` (date, `El_Salvador`)
- `hora_inicio` (timestamptz), `hora_fin` (timestamptz, null)
- `almuerzo_inicio` (timestamptz, null), `almuerzo_fin` (timestamptz, null)
- `almuerzo_excedido` (bool, default false), `minutos_almuerzo` (int, generado)
- `horas_efectivas` (numeric, generado en app)
- `notas` (text)
- Índice único parcial por `(tecnico_id, fecha)` para una jornada abierta por día
- RLS: técnico ve/edita solo la suya; admin/supervisor ven todas
- GRANT completo `authenticated`/`service_role`

### 2.2 Server functions (`src/lib/jornadas.functions.ts`)

- `iniciarJornada()` → crea fila, dispara correo "Inicio de jornada"
- `iniciarAlmuerzo()` / `finalizarAlmuerzo()` → marca timestamps y calcula si excedió 60 min. Si excede, notifica staff con alerta destacada
- `finalizarJornada({ notas })` → cierra fila, calcula horas efectivas (fin - inicio - almuerzo), dispara correo "Fin de jornada" con resumen (inicio, fin, almuerzo, horas efectivas, sobrepaso si aplica)
- `getJornadaHoy()` → estado actual del técnico
- `getJornadasStaff({ fecha })` → para el resumen consolidado

### 2.3 UI en Mis trabajos

Nuevo componente `<JornadaControl />` fijo arriba de la lista de trabajos en `src/routes/_authenticated/mis-trabajos.tsx`. Estados:

```text
[ Iniciar jornada ]  ← estado inicial
  ↓
[ En jornada · 07:15 · Iniciar almuerzo | Finalizar jornada ]
  ↓
[ Almorzando · 12:00 (⏱ 45 min) · Regresar de almuerzo ]  ← chip amarillo si >55min, rojo si >60min
  ↓
[ En jornada · retorno 13:05 · Finalizar jornada ]
  ↓
[ Jornada finalizada · 07:15 – 16:20 · 8h 05m efectivas ]
```

Timer en vivo (updates cada minuto), badge de exceso de almuerzo, botón deshabilitado si ya finalizó.

### 2.4 Autocompletar reporte diario

En `ReportesDiariosSection.tsx`, al abrir el formulario para "hoy", pre-cargar `hora_inicio`, `hora_fin` y `horas_trabajadas` desde `getJornadaHoy()` si existe una jornada cerrada. Los campos siguen editables.

### 2.5 Correos a administradores

Reutilizar `notificarStaff` en `src/lib/notificaciones-staff.server.ts`. Añadir tipos:
- `jornada_iniciada` (asunto: "Inicio jornada · [técnico]")
- `jornada_finalizada` (asunto con horas efectivas y sobrepaso)
- `almuerzo_excedido` (alerta destacada roja)

### 2.6 Resumen diario consolidado

Endpoint `src/routes/api/public/hooks/resumen-jornadas-diario.ts` protegido por `apikey`, invocado por pg_cron a las 18:00 hora local (23:00 UTC — Chile no tiene DST relevante aquí; usar 23:00 UTC = 17:00 SV, verificaré con `America/El_Salvador`). Envía un solo correo a admins/supervisores con tabla por técnico:

| Técnico | Inicio | Fin | Almuerzo | Horas efectivas | Estado |

### 2.7 Cron

Migración SQL con `cron.schedule('resumen-jornadas-diario', '0 23 * * *', ...)` que hace `net.http_post` al hook con `apikey`.

## Detalles técnicos

- **Archivos nuevos:** `src/lib/jornadas.functions.ts`, `src/components/JornadaControl.tsx`, `src/routes/api/public/hooks/resumen-jornadas-diario.ts`
- **Archivos editados:** `src/components/BrandLogo.tsx`, `src/routes/_authenticated/mis-trabajos.tsx`, `src/components/ReportesDiariosSection.tsx`, `src/lib/notificaciones-staff.server.ts` (nuevos tipos)
- **Migraciones:** crear `jornadas_laborales` con RLS/GRANT + agendar cron del resumen diario
- **Reutiliza:** `notificarStaff`, `emailLayout`, `sendGmail`, `has_role`

## Confirmación previa

Sólo una pregunta antes de implementar: el **resumen diario consolidado** — ¿lo mando a las **17:00 hora El Salvador** (fin de jornada estándar), o prefieres otra hora?