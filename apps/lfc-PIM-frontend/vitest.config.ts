import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

/**
 * IDE-only Vitest config (WebStorm right-click / gutter "Run test").
 *
 * The CI/CLI path is `ng test` → `@angular/build:unit-test`, which generates
 * its own Vitest config on the fly and never reads this file. WebStorm spawns
 * the `vitest` binary directly and needs an on-disk config that compiles
 * Angular — that is what `@analogjs/vite-plugin-angular` provides here.
 *
 * Kept behaviourally aligned with angular.json's test target: jsdom env,
 * zoneless TestBed (see vitest.setup.ts), per-file isolation.
 */
export default defineConfig({
  plugins: [angular()],
  // Confine dependency discovery to the specs so Vite never crawls build
  // artefacts under dist/ (which reference hashed, unresolvable entry chunks).
  optimizeDeps: { entries: ['src/**/*.spec.ts'] },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.spec.ts'],
    isolate: true,
  },
});
