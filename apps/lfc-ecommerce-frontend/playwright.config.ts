import { defineConfig, devices } from '@playwright/test';

/**
 * Le port de l'aperçu servi pour la porte axe — différent du 7318 du dev
 * quotidien : un run ne s'appuie jamais sur le serveur ouvert à côté.
 */
const PORT = 4318;

/**
 * **La porte d'accessibilité automatique de la boutique** (Hugo, 2026-10-26 —
 * `documentation/accessibilite/porte-axe.md`).
 *
 * Elle parcourt les scènes de l'APERÇU (`preview/`) : la vraie boutique,
 * démarrée sur un backend simulé dans la page — déterministe, sans réseau,
 * sans compte. Chaque scène écrit ses violations axe dans `tmp/axe-results/` ;
 * c'est `dev-toolbox/accessibilite/axe-gate.mjs` qui les compare à la
 * référence. Ne se lance pas seule : `pnpm a11y:axe` à la racine.
 */
export default defineConfig({
  testDir: './a11y',
  outputDir: './tmp/playwright',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // Les créneaux et les jours de la démonstration se calculent depuis
    // l'horloge du navigateur : fuseau et langue figés, comme l'heure (cf. la spec).
    timezoneId: 'Europe/Paris',
    locale: 'fr-FR',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Configuration `development` : elle accepte le back-office de dev
    // (`http://127.0.0.1:7317`) comme éditeur — l'origine que la spec simule.
    command: `pnpm exec ng serve lfc-ecommerce-preview --configuration development --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'pipe',
  },
});
