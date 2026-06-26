import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  listUsers,
  inviteUser,
  setUserRole,
  deleteUser,
  listRoleAudit,
  listClientesAdmin,
  setUserCliente,
  purgeOrphanUsers,
  resetPasswordUsuario,
  listResetSolicitudes,
  descartarResetSolicitud,
  reenviarPasswordTemporal,
} from "@/lib/users.functions";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { Trash2, UserPlus, History, AlertTriangle, Eraser, KeyRound, Mail, X, Send } from "lucide-react";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsersPage,
});

const ALL_ROLES: AppRole[] = ["admin", "supervisor", "tecnico", "cliente"];

function UsersPage() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const fetchInvite = useServerFn(inviteUser);
  const fetchSetRole = useServerFn(setUserRole);
  const fetchDelete = useServerFn(deleteUser);
  const fetchAudit = useServerFn(listRoleAudit);
  const fetchClientes = useServerFn(listClientesAdmin);
  const fetchSetCliente = useServerFn(setUserCliente);
  const fetchPurge = useServerFn(purgeOrphanUsers);
  const fetchResetPass = useServerFn(resetPasswordUsuario);
  const fetchResetSolicitudes = useServerFn(listResetSolicitudes);
  const fetchDescartar = useServerFn(descartarResetSolicitud);
  const fetchReenviar = useServerFn(reenviarPasswordTemporal);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
  });

  const clientes = useQuery({
    queryKey: ["admin-clientes"],
    queryFn: () => fetchClientes(),
  });

  const audit = useQuery({
    queryKey: ["role-audit"],
    queryFn: () => fetchAudit(),
  });

  const resets = useQuery({
    queryKey: ["password-resets"],
    queryFn: () => fetchResetSolicitudes(),
    refetchInterval: 30_000,
  });

  const invite = useMutation({
    mutationFn: (vars: { email: string; role: AppRole }) =>
      fetchInvite({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const toggle = useMutation({
    mutationFn: (vars: { userId: string; role: AppRole; enabled: boolean }) =>
      fetchSetRole({ data: vars }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["role-audit"] });
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => fetchDelete({ data: { userId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const setCliente = useMutation({
    mutationFn: (vars: { userId: string; clienteId: string | null }) =>
      fetchSetCliente({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const purge = useMutation({
    mutationFn: () => fetchPurge(),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["role-audit"] });
      alert(
        `Limpieza completa.\nRoles huérfanos eliminados: ${res?.rolesEliminados ?? 0}\nPerfiles huérfanos eliminados: ${res?.perfilesEliminados ?? 0}`,
      );
    },
    onError: (e: any) => alert(`Error en limpieza: ${e?.message ?? e}`),
  });

  const resetPass = useMutation({
    mutationFn: (vars: { userId: string; solicitudId?: string }) =>
      fetchResetPass({ data: vars }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["password-resets"] });
      alert(`Contraseña restablecida y enviada por correo a ${res?.email ?? ""}.`);
    },
    onError: (e: any) => alert(`Error: ${e?.message ?? e}`),
  });

  const descartar = useMutation({
    mutationFn: (id: string) => fetchDescartar({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["password-resets"] }),
  });

  const reenviar = useMutation({
    mutationFn: (solicitudId: string) => fetchReenviar({ data: { solicitudId } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["password-resets"] });
      alert(`Nueva contraseña temporal reenviada a ${res?.email ?? ""}.`);
    },
    onError: (e: Error) => alert(`Error al reenviar: ${e.message}`),
  });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("tecnico");
  const [inviteClienteId, setInviteClienteId] = useState<string>("");

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    invite.mutate(
      { email, role },
      {
        onSuccess: (created: any) => {
          if (role === "cliente" && inviteClienteId && created?.id) {
            setCliente.mutate({ userId: created.id, clienteId: inviteClienteId });
          }
          if (created?.correo_enviado) {
            alert(`Cuenta creada. Contraseña automática enviada por correo a ${created.email}. Se solicitará cambiarla al ingresar.`);
          } else if (created?.password) {
            alert(`Cuenta creada, pero el correo no se envió (${created.correo_error ?? "error"}).\n\nEntrega manualmente esta contraseña temporal:\n${created.password}`);
          }
          setEmail("");
          setInviteClienteId("");
        },
      },
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-destructive">
          No se pudo cargar la lista de usuarios: {(error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <PageHeader
        title="Usuarios y Roles"
        description="Invita miembros del equipo o clientes y controla sus permisos por rol."
      />

      <section className="border border-border rounded-lg bg-card p-5 mb-8">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="size-4 text-primary" />
          Invitar usuario
        </h2>
        <form onSubmit={onInvite} className="grid sm:grid-cols-4 gap-3 mt-4">
          <input
            type="email"
            required
            placeholder="correo@empresa.cl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
          />
          <input
            type="text"
            placeholder="Contraseña opcional (min. 8)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-secondary border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="bg-secondary border border-border rounded-md px-3 py-2 text-sm"
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={invite.isPending}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {invite.isPending ? "Creando…" : "Crear cuenta"}
          </button>
          {role === "cliente" && (
            <select
              value={inviteClienteId}
              onChange={(e) => setInviteClienteId(e.target.value)}
              className="bg-secondary border border-border rounded-md px-3 py-2 text-sm sm:col-span-4"
            >
              <option value="">— Selecciona el cliente al que pertenece —</option>
              {clientes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          )}
        </form>
        {invite.error && (
          <p className="text-xs text-destructive mt-2">
            {(invite.error as Error).message}
          </p>
        )}
        <label className="mt-4 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enviarPorCorreo}
            onChange={(e) => setEnviarPorCorreo(e.target.checked)}
            className="accent-primary size-4"
          />
          <Mail className="size-3.5 text-primary" />
          Enviar la contraseña por correo al usuario (requerirá cambiarla al ingresar)
        </label>
        <p className="text-[10px] text-muted-foreground mt-3 uppercase tracking-widest">
          Si dejas la contraseña en blanco, se enviará un correo de invitación para que el usuario fije la suya. Si la completas, deberás entregársela por un canal seguro (no se envía correo).
        </p>
      </section>

      <section className="border border-border rounded-lg bg-card overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Solicitudes de recuperación de contraseña</h2>
          <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-widest">
            {(resets.data ?? []).filter((s: any) => s.estado === "pendiente").length} pendientes
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-3">Fecha</th>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Mensaje / IP</th>
              <th className="text-left p-3">Expira</th>
              <th className="text-left p-3">Estado</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {resets.isLoading && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Cargando…</td></tr>
            )}
            {resets.data?.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">Sin solicitudes.</td></tr>
            )}
            {resets.data?.map((s: any) => (
              <tr key={s.id} className="border-t border-border">
                <td className="p-3 text-xs text-muted-foreground font-mono">
                  {new Date(s.created_at).toLocaleString()}
                </td>
                <td className="p-3 text-xs">{s.email}</td>
                <td className="p-3 text-xs text-muted-foreground max-w-[260px] truncate" title={s.mensaje ?? ""}>
                  <div className="truncate">{s.mensaje ?? "—"}</div>
                  {s.ip && <div className="text-[10px] font-mono">IP: {s.ip}</div>}
                  {(s.reenvios ?? 0) > 0 && (
                    <div className="text-[10px] text-primary">Reenviada {s.reenvios}×</div>
                  )}
                </td>
                <td className="p-3 text-[10px] font-mono text-muted-foreground">
                  {s.expira_at ? new Date(s.expira_at).toLocaleString() : "—"}
                </td>
                <td className="p-3">
                  <span className={
                    "text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded " +
                    (s.estado === "pendiente"
                      ? "bg-primary/15 text-primary"
                      : s.estado === "atendida"
                        ? "bg-accent/15 text-accent"
                        : s.estado === "caducada"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground")
                  }>
                    {s.estado}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {s.estado === "pendiente" && s.user_id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Generar y enviar una nueva contraseña temporal a ${s.email}?`)) {
                          resetPass.mutate({ userId: s.user_id, solicitudId: s.id });
                        }
                      }}
                      disabled={resetPass.isPending}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 mr-2"
                    >
                      <Mail className="size-3.5" />
                      Enviar nueva clave
                    </button>
                  )}
                  {s.estado === "atendida" && s.user_id && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Regenerar y reenviar una nueva contraseña temporal a ${s.email}? (caso "no me llegó el correo")`)) {
                          reenviar.mutate(s.id);
                        }
                      }}
                      disabled={reenviar.isPending}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-border bg-secondary hover:bg-secondary/70 disabled:opacity-60 mr-2"
                      title="Regenera la clave temporal y reenvía el correo"
                    >
                      <Send className="size-3.5" />
                      Reenviar
                    </button>
                  )}
                  {s.estado === "pendiente" && !s.user_id && (
                    <span className="text-[10px] text-destructive mr-2">Email sin cuenta registrada</span>
                  )}
                  {s.estado === "pendiente" && (
                    <button
                      type="button"
                      onClick={() => descartar.mutate(s.id)}
                      className="text-muted-foreground hover:text-destructive"
                      title="Descartar"
                      aria-label="Descartar"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="border border-border rounded-lg bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-3">Email</th>
              <th className="text-left p-3">Cliente</th>
              {ALL_ROLES.map((r) => (
                <th key={r} className="text-center p-3">
                  {ROLE_LABEL[r]}
                </th>
              ))}
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={ALL_ROLES.length + 3} className="p-6 text-center text-xs text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            )}
            {data?.map((u) => {
              const isCliente = u.roles.includes("cliente");
              const missingCliente = isCliente && !u.cliente_id;
              return (
              <tr key={u.id} className="border-t border-border">
                <td className="p-3">
                  <div className="font-medium">{u.email}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{u.id.slice(0, 8)}</div>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {isCliente ? (
                      <>
                      <select
                      value={u.cliente_id ?? ""}
                      disabled={setCliente.isPending || clientes.isLoading}
                      onChange={(e) =>
                        setCliente.mutate({
                          userId: u.id,
                          clienteId: e.target.value || null,
                        })
                      }
                      className={
                        "bg-secondary border rounded-md px-2 py-1.5 text-xs min-w-[180px] " +
                        (missingCliente ? "border-destructive" : "border-border")
                      }
                    >
                      <option value="">— Sin cliente —</option>
                      {clientes.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    {missingCliente && (
                      <span title="Usuario con rol cliente sin cliente asignado: no podrá ver sus plantas.">
                        <AlertTriangle className="size-4 text-destructive" />
                      </span>
                    )}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                {ALL_ROLES.map((r) => {
                  const enabled = u.roles.includes(r);
                  return (
                    <td key={r} className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={enabled}
                        disabled={toggle.isPending}
                        onChange={(e) =>
                          toggle.mutate({ userId: u.id, role: r, enabled: e.target.checked })
                        }
                        className="accent-primary size-4"
                      />
                    </td>
                  );
                })}
                <td className="p-3 text-right">
                  <button
                    onClick={() => {
                      if (confirm(`¿Generar y enviar una nueva contraseña a ${u.email}?`)) {
                        resetPass.mutate({ userId: u.id });
                      }
                    }}
                    disabled={resetPass.isPending}
                    className="text-muted-foreground hover:text-primary mr-3"
                    aria-label="Restablecer contraseña y enviar por correo"
                    title="Restablecer contraseña y enviar por correo"
                  >
                    <KeyRound className="size-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Eliminar la cuenta ${u.email}?`)) remove.mutate(u.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {setCliente.error && (
          <p className="text-xs text-destructive px-5 py-3 border-t border-border">
            {(setCliente.error as Error).message}
          </p>
        )}
      </section>

      <section className="border border-border rounded-lg bg-card overflow-hidden mt-8">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <History className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Bitácora de cambios de roles</h2>
          <span className="text-[10px] text-muted-foreground ml-auto uppercase tracking-widest">
            Últimos 100 eventos
          </span>
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  "¿Limpiar usuarios desvinculados?\nSe eliminarán roles y perfiles huérfanos (usuarios que ya no existen en el sistema de autenticación). Esta acción no se puede deshacer.",
                )
              ) {
                purge.mutate();
              }
            }}
            disabled={purge.isPending}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-border bg-secondary hover:bg-secondary/70 disabled:opacity-60"
            title="Elimina roles y perfiles de usuarios desvinculados de la app"
          >
            <Eraser className="size-3.5" />
            {purge.isPending ? "Limpiando…" : "Limpiar desvinculados"}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-3">Fecha</th>
              <th className="text-left p-3">Acción</th>
              <th className="text-left p-3">Rol</th>
              <th className="text-left p-3">Usuario afectado</th>
              <th className="text-left p-3">Realizado por</th>
            </tr>
          </thead>
          <tbody>
            {audit.isLoading && (
              <tr><td colSpan={5} className="p-6 text-center text-xs text-muted-foreground">Cargando…</td></tr>
            )}
            {audit.data?.length === 0 && (
              <tr><td colSpan={5} className="p-6 text-center text-xs text-muted-foreground">Sin eventos registrados.</td></tr>
            )}
            {audit.data?.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="p-3 text-xs text-muted-foreground font-mono">
                  {new Date(l.created_at).toLocaleString()}
                </td>
                <td className="p-3">
                  <span className={
                    "text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded " +
                    (l.action === "granted"
                      ? "bg-accent/10 text-accent"
                      : "bg-destructive/10 text-destructive")
                  }>
                    {l.action === "granted" ? "Asignado" : "Revocado"}
                  </span>
                </td>
                <td className="p-3">{ROLE_LABEL[l.role as AppRole] ?? l.role}</td>
                <td className="p-3 text-xs">{l.target_email}</td>
                <td className="p-3 text-xs text-muted-foreground">{l.performed_by_email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}