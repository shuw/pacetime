import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "shots/", "node_modules/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["scripts/**", "tests/**", "*.config.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser, slowlight: "readonly", Bun: "readonly" } },
  },
  {
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
