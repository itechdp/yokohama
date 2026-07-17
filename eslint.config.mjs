import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", "node_modules"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs["recommended-latest"], reactRefresh.configs.vite],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      // Unused vars are a style nit, not a correctness bug — they must NEVER block a deployable
      // build. The agent occasionally emits large files (e.g. an icon registry) with stray unused
      // declarations; downgrading to "warn" lets the build+publish succeed instead of the whole
      // Host flow dead-ending on lint. Real type/logic errors still fail typecheck + the rest of lint.
      "@typescript-eslint/no-unused-vars": "warn",
      "no-unused-vars": "warn",
    },
  },
]);
