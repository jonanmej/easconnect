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
