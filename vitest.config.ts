import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json sets compilerOptions.jsx to "preserve" (Next.js transforms
  // JSX itself); outside Next, .tsx test/component files need an actual JSX
  // transform. @vitejs/plugin-react scopes that transform to .jsx/.tsx only —
  // unlike a global `esbuild`/`oxc` jsx option, which was found to also alter
  // how plain .ts files parse (breaking `as`/`!` TS syntax repo-wide).
  plugins: [react()],
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Node environment by default — fast, no JSDOM overhead. Component tests
    // opt into JSDOM per-file with a `// @vitest-environment jsdom` pragma.
    environment: "node",
  },
});
