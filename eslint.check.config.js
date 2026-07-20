// Configuración mínima y estricta que se ejecuta antes del build (`bun run
// check:redeclare`). Su propósito es cortar el build si aparece una
// redeclaración o duplicación como la de `diarios` que rompió el PDF del
// reporte ejecutivo, sin depender del resto de reglas de estilo/prettier.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", "node_modules", "src/routeTree.gen.ts"] },
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      // Registrado como stub para que las directivas inline
      // `eslint-disable react-hooks/*` de la base actual no fallen esta
      // verificación mínima; no habilitamos sus reglas aquí.
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      "no-redeclare": "off",
      "@typescript-eslint/no-redeclare": ["error", { ignoreDeclarationMerge: true }],
      "no-dupe-keys": "error",
      "no-dupe-args": "error",
      "no-dupe-else-if": "error",
      "no-dupe-class-members": "off",
      "@typescript-eslint/no-dupe-class-members": "error",
      "no-func-assign": "error",
      "no-import-assign": "error",
      "no-var": "error",
    },
  },
);