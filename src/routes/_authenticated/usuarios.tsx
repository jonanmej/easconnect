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
} from "@/lib/users.functions";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";
import { Trash2, UserPlus, History, AlertTriangle } from "lucide-react";

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

  const invite = useMutation({
    mutationFn: (vars: { email: string; password: string; role: AppRole }) =>
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

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("tecnico");

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    invite.mutate(
      { email, password, role },
      {
        onSuccess: () => {
          setEmail("");
          setPassword("");
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
        </form>
        {invite.error && (
          <p className="text-xs text-destructive mt-2">
            {(invite.error as Error).message}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground mt-3 uppercase tracking-widest">
          Si dejas la contraseña en blanco, se enviará un correo de invitación para que el usuario fije la suya. Si la completas, deberás entregársela por un canal seguro (no se envía correo).
        </p>
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