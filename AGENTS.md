<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules
- Server functions verify the caller's role with `requireRol` from `src/lib/auth-roles.ts` before any privileged (admin-client) work — one consistent, DB-backed check instead of per-file helpers.
- Clients change report status only through the `responder_reporte_cliente` DB function — clients have no direct UPDATE on `reportes`, so they cannot alter content.
- Account unification for payroll lives in the `colaborador_unificaciones` table (admin-only), not in code — so it can change without a deploy.
- Report emission fields (fecha_emision, codigo_documento, version_label) are set only by the `reportes_control_emision` trigger, which also locks content once a report is enviado/aprobado — corrections are new versions via reporte_padre_id.
- Report indicators are built by the system (`construirIndicadores` in src/lib/reporte-ia.ts) and stored in `reportes.indicadores`; AI only writes text, and numbers in that text are checked (`verificarCifras`) and flagged for review — so figures always come from data.
- Power values are formatted only through src/lib/potencia.ts; capacity is stored numerically in `capacidad_kwp` — one consistent W/kW/kWp/MWp rule across screens, PDFs and AI input.
- Client calendar availability comes only from the `disponibilidad_calendario` DB function (security definer, role-checked) — other clients' OTs are masked in the database, never via the admin client.
- ISO week numbers come only from `src/lib/semana-iso.ts` — one rule for all calendars and PDFs.
- Reports in enviado/aprobado cannot be deleted (trigger `reportes_bloquear_borrado`) — emitted documents are permanent under ISO 9001.
