import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

/**
 * IDE-only Vitest config (WebStorm right-click / gutter "Run test").
 *
 * Le chemin CI/CLI est `ng test` → `@angular/build:unit-test`, qui génère sa
 * propre config Vitest à la volée et ne lit jamais ce fichier. WebStorm lance le
 * binaire `vitest` directement et a besoin d'une config sur disque qui compile
 * Angular — c'est ce que fournit `@analogjs/vite-plugin-angular`.
 */
export default defineConfig({
  plugins: [angular()],
  optimizeDeps: { entries: ['src/**/*.spec.ts'] },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.spec.ts'],
    isolate: true,
  },
});
