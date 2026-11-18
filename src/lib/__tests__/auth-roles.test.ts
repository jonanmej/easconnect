import { describe, expect, it } from "vitest";
import { requireRol, STAFF } from "@/lib/auth-roles";

function supabaseConRoles(roles: string[]) {
  return {
    from: (tabla: string) => {
      expect(tabla).toBe("user_roles");
      return {
        select: () => ({
          eq: async () => ({ data: roles.map((role) => ({ role })), error: null }),
        }),
      };
    },
  };
}

describe("control de rol para generación con IA", () => {
  it.each(["admin", "supervisor"])("permite a %s", async (rol) => {
    await expect(requireRol(supabaseConRoles([rol]), "usuario", STAFF)).resolves.toEqual([rol]);
  });

  it.each(["cliente", "tecnico"])("rechaza a %s antes de autorizar la operación", async (rol) => {
    await expect(requireRol(supabaseConRoles([rol]), "usuario", STAFF)).rejects.toThrow("No autorizado");
  });

  it("rechaza una cuenta sin rol de personal", async () => {
    await expect(requireRol(supabaseConRoles([]), "usuario", STAFF)).rejects.toThrow("No autorizado");
  });
});
