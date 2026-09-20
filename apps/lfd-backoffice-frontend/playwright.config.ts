import { defineConfig, devices } from '@playwright/test';

/**
 * Le port des e2e — **différent** du 7317 du dev quotidien. Un run ne doit ni
 * s'appuyer sur le serveur ouvert à côté (qui, lui, porte la vraie
 * configuration Auth0 et montrerait sa porte), ni le lui prendre.
 */
const PORT = 4317;

/**
 * Tests **navigateur** du back-office.
 *
 * Ce que Vitest ne peut pas prouver : un vrai focus qui quitte un champ, un
 * `<select>` natif qu'on ouvre, une navigation entre deux écrans. Nos tests
 * unitaires ont déjà menti là-dessus une fois — un `blur` émis dans la même
 * micro-tâche que la frappe, séquence qu'aucun navigateur ne produit. C'est
 * cette classe d'erreur que ce socle attrape.
 *
 * L'API est **doublée dans la page** (`page.route`) : ces tests portent sur
 * l'écran, pas sur le serveur — celui-ci a ses propres e2e sur un vrai Postgres.
 * Rien à démarrer, donc, ni base ni backend : un `pnpm test:e2e` suffit.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Un `.only` oublié ferait passer une CI verte en n'ayant rien testé.
  forbidOnly: Boolean(process.env['CI']),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // La trace du premier échec : sans elle, un test rouge en CI n'est qu'un nom.
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Configuration `e2e` : mêmes remplacements que le dev, plus une
    // configuration Auth0 vide — l'app se sait alors non configurée et ne
    // demande pas de connexion (cf. `auth.env.e2e.ts`).
    command: `pnpm exec ng serve --configuration e2e --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    // Jamais réutiliser : le serveur voisin ne tourne pas dans cette
    // configuration, et le run le croirait sur parole.
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'pipe',
  },
});
