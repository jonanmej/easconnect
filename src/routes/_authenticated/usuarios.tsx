import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ResponsiveTable, type ResponsiveColumn } from "@/components/ResponsiveTable";
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
  head: () => ({
    meta: [
      { title: "Usuarios y roles · EA Service Connect" },
      {
        name: "description",
        content:
          "Administración de usuarios del sistema: asignación de roles de administrador, supervisor, técnico y cliente, con control de permisos.",
      },
      { property: "og:title", content: "Usuarios y roles · EA Service Connect" },
      {
        property: "og:description",
        content:
          "Gestiona el acceso al sistema y los roles de cada usuario: administrador, supervisor, técnico y cliente.",
      },
    ],
  }),
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
    <div className="p-4 md:p-8 max-w-6xl w-full">
      <PageHeader
        title="Usuarios y Roles"
        description="Invita miembros del equipo o clientes y controla sus permisos por rol."
      />

      <section className="border border-border rounded-lg bg-card p-5 mb-8">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="size-4 text-primary" />
          Invitar usuario
        </h2>
        <form onSubmit={onInvite} className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <input
            type="email"
            required
            placeholder="correo@empresa.cl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full min-w-0 bg-secondary border border-border rounded-md px-3 py-2 text-sm min-h-11 sm:min-h-9"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
            className="w-full min-w-0 bg-secondary border border-border rounded-md px-3 py-2 text-sm min-h-11 sm:min-h-9"
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
            className="w-full min-w-0 min-h-11 sm:min-h-9 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
          >
            {invite.isPending ? "Creando…" : "Crear cuenta"}
          </button>
          {role === "cliente" && (
            <select
              value={inviteClienteId}
              onChange={(e) => setInviteClienteId(e.target.value)}
              className="w-full min-w-0 bg-secondary border border-border rounded-md px-3 py-2 text-sm min-h-11 sm:min-h-9 sm:col-span-3"
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
        <p className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <Mail className="size-3.5 text-primary" />
          La contraseña se genera automáticamente según la política activa y se envía por correo al usuario. Se le pedirá cambiarla en su primer ingreso.
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
        <ResponsiveTable
          className="px-0"
          data={(resets.data ?? []) as any[]}
          rowKey={(s: any) => s.id}
          emptyMessage={resets.isLoading ? "Cargando…" : "Sin solicitudes."}
          columns={[
            {
              key: "email",
              header: "Email",
              primary: true,
              cell: (s: any) => s.email,
            },
            {
              key: "fecha",
              header: "Fecha",
              secondary: true,
              cell: (s: any) => new Date(s.created_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" }),
            },
            {
              key: "mensaje",
              header: "Mensaje / IP",
              hideOnMobile: true,
              cell: (s: any) => (
                <div className="text-muted-foreground max-w-[260px] truncate" title={s.mensaje ?? ""}>
                  <div className="truncate">{s.mensaje ?? "—"}</div>
                  {s.ip && <div className="text-[10px] font-mono">IP: {s.ip}</div>}
                  {(s.reenvios ?? 0) > 0 && (
                    <div className="text-[10px] text-primary">Reenviada {s.reenvios}×</div>
                  )}
                </div>
              ),
            },
            {
              key: "expira",
              header: "Expira",
              hideOnMobile: true,
              cell: (s: any) => (
                <span className="text-[10px] font-mono text-muted-foreground">
                  {s.expira_at ? new Date(s.expira_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" }) : "—"}
                </span>
              ),
            },
            {
              key: "estado",
              header: "Estado",
              cell: (s: any) => (
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
              ),
            },
          ]}
          rowActions={(s: any) => (
            <>
              {s.estado === "pendiente" && s.user_id && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`¿Generar y enviar una nueva contraseña temporal a ${s.email}?`)) {
                      resetPass.mutate({ userId: s.user_id, solicitudId: s.id });
                    }
                  }}
                  disabled={resetPass.isPending}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  <Mail className="size-3.5" />
                  <span className="hidden sm:inline">Enviar nueva clave</span>
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
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md border border-border bg-secondary hover:bg-secondary/70 disabled:opacity-60"
                  title="Regenera la clave temporal y reenvía el correo"
                >
                  <Send className="size-3.5" />
                  <span className="hidden sm:inline">Reenviar</span>
                </button>
              )}
              {s.estado === "pendiente" && !s.user_id && (
                <span className="text-[10px] text-destructive">Sin cuenta</span>
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
            </>
          )}
        />
      </section>

      <section className="border border-border rounded-lg bg-card overflow-hidden">
        <div className="p-3 md:p-0">
        <ResponsiveTable
          data={(data ?? []) as any[]}
          rowKey={(u: any) => u.id}
          emptyMessage={isLoading ? "Cargando…" : "Sin usuarios."}
          columns={[
            {
              key: "email",
              header: "Email",
              primary: true,
              cell: (u: any) => u.email,
            },
            {
              key: "id",
              header: "ID",
              secondary: true,
              mobileLabel: "ID",
              cell: (u: any) => u.id.slice(0, 8),
            },
            {
              key: "cliente",
              header: "Cliente",
              cell: (u: any) => {
                const isCliente = u.roles.includes("cliente");
                const missingCliente = isCliente && !u.cliente_id;
                if (!isCliente) return <span className="text-xs text-muted-foreground">—</span>;
                return (
                  <div className="flex items-center gap-2">
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
                        "bg-secondary border rounded-md px-2 py-1.5 text-xs min-w-0 w-full max-w-[220px] " +
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
                        <AlertTriangle className="size-4 text-destructive shrink-0" />
                      </span>
                    )}
                  </div>
                );
              },
            },
            {
              key: "roles",
              header: "Roles",
              mobileLabel: "Roles",
              cell: (u: any) => (
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {ALL_ROLES.map((r) => {
                    const enabled = u.roles.includes(r);
                    return (
                      <label key={r} className="inline-flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={toggle.isPending}
                          onChange={(e) =>
                            toggle.mutate({ userId: u.id, role: r, enabled: e.target.checked })
                          }
                          className="accent-primary size-4"
                        />
                        {ROLE_LABEL[r]}
                      </label>
                    );
                  })}
                </div>
              ),
            },
          ]}
          rowActions={(u: any) => (
            <>
              <button
                onClick={() => {
                  if (confirm(`¿Generar y enviar una nueva contraseña a ${u.email}?`)) {
                    resetPass.mutate({ userId: u.id });
                  }
                }}
                disabled={resetPass.isPending}
                className="text-muted-foreground hover:text-primary"
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
            </>
          )}
        />
        </div>
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
        <div className="p-3 md:p-0">
        <ResponsiveTable
          data={(audit.data ?? []) as any[]}
          rowKey={(l: any) => l.id}
          emptyMessage={audit.isLoading ? "Cargando…" : "Sin eventos registrados."}
          columns={[
            {
              key: "usuario",
              header: "Usuario afectado",
              primary: true,
              cell: (l: any) => l.target_email,
            },
            {
              key: "fecha",
              header: "Fecha",
              secondary: true,
              cell: (l: any) => new Date(l.created_at).toLocaleString("es-SV", { timeZone: "America/El_Salvador" }),
            },
            {
              key: "accion",
              header: "Acción",
              cell: (l: any) => (
                <span className={
                  "text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded " +
                  (l.action === "granted"
                    ? "bg-accent/10 text-accent"
                    : "bg-destructive/10 text-destructive")
                }>
                  {l.action === "granted" ? "Asignado" : "Revocado"}
                </span>
              ),
            },
            {
              key: "rol",
              header: "Rol",
              cell: (l: any) => ROLE_LABEL[l.role as AppRole] ?? l.role,
            },
            {
              key: "por",
              header: "Realizado por",
              cell: (l: any) => <span className="text-muted-foreground">{l.performed_by_email}</span>,
            },
          ]}
        />
        </div>
      </section>
    </div>
  );
}