import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Prevent redeclarations / shadowing like the `diarios` bug where a
      // block-scoped const re-declared an outer variable and silently broke
      // the executive PDF (photos + technician mapping). These must fail the
      // build early, before any PDF is generated.
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": ["error", { ignoreDeclarationMerge: true }],
      // Shadowing queda como warn para no romper llamadas legítimas de
      // callbacks (e, err, props, etc.) en la base actual, pero deja
      // visibles los casos peligrosos como el `diarios` en reportes.
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": [
        "warn",
        { hoist: "all", allow: ["_", "resolve", "reject", "done", "cb", "err", "error", "e", "props", "className", "config", "open", "paused", "d"] },
      ],
      "no-var": "error",
      "no-dupe-keys": "error",
      "no-dupe-class-members": "off",
      "@typescript-eslint/no-dupe-class-members": "error",
    },
  },
  eslintPluginPrettier,
);
