import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // Global ignores
  {
    ignores: ["dist/", "node_modules/", "src/_overlay.generated.ts"],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript files
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["src/**/*.ts"],
  })),
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // Browser IIFE (ES2017, var-based, no modules)
  // Uses `var` throughout (function-scoped), so no-redeclare fires on loop vars.
  {
    files: ["src/overlay.iife.js"],
    languageOptions: {
      ecmaVersion: 2017,
      sourceType: "script",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-var": "off",
      "no-redeclare": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },

  // Node scripts
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
);
