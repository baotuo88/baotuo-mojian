import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

// Flat config (ESLint v9). Historically the repo shipped a legacy .eslintrc.json
// that no script ever executed, so React Hooks bugs that tsc cannot catch
// (stale/unstable effect deps, conditional hooks) slipped through. This config
// is intentionally narrow: it lints the client for the React Hooks rules only,
// which is exactly the class of defect tsc misses. Broaden deliberately later.
export default [
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/*.d.ts",
    ],
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      // Flipped warn → error on 2026-09-25 after the 99-warning backlog was burned
      // down to 0. Now that client/src is clean, any newly-introduced stale/unstable
      // effect dep fails the lint gate instead of silently accumulating. Intentional
      // omissions are still allowed via a documented eslint-disable-next-line.
      "react-hooks/exhaustive-deps": "error",
    },
  },
];
