// description: Configuración de Vitest del frontend: entorno node, tests de `src/**` y nada de red.
// context: La suite es pura (lógica y contratos, sin DOM) y así la descubren igual `npm test`, el
// Explorador de pruebas de VS Code y `vitest run` desde la raíz del monorepo (vitest.rootConfig).

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
