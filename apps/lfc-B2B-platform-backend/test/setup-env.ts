/**
 * Env des tests — **le seul fichier de `test/` autorisé à lire `process.env`**
 * (allowlist explicite dans `eslint.config.mjs`). Les modules d'infra (DB, Auth)
 * échouent volontairement à l'amorçage si leur configuration manque : on la
 * fournit donc ici, une fois pour toutes les suites.
 *
 * `??=` partout : une valeur déjà présente dans l'environnement gagne, ce qui
 * permet à la CI de pointer une autre base sans toucher au code.
 */

/**
 * Base **jetable** des tests e2e : le conteneur de dev (`lfd-dev-postgres`,
 * port hôte 5433), mais une db à part — `lfc_b2b_test`, jamais `lfc_pim`, pour
 * qu'un `TRUNCATE` de test ne puisse pas effacer des données de développement.
 *
 * Schéma `postgresql://` (et non `prisma+postgres://`) : c'est lui qui fait
 * basculer `PrismaService` sur l'adapter `pg` — cf. sa doc.
 */
const DEFAULT_TEST_DATABASE_URL = "postgresql://lfc:lfc@localhost:5433/lfc_b2b_test";

process.env["DATABASE_B2B_URL"] ??= DEFAULT_TEST_DATABASE_URL;
process.env["AUTH0_DOMAIN"] ??= "test-tenant.eu.auth0.com";
process.env["AUTH0_AUDIENCE"] ??= "https://api.test.local";

// Neutralise les **bypass d'auth de dev** qui traînent dans le `.env` local
// (impersonation client, bypass staff). Contrairement au reste, c'est un
// **écrasement dur**, pas un `??=` : les e2e doivent éprouver les VRAIS guards
// (jeton porteur = `sub` via le verifier doublé), sinon un `pnpm test` local
// n'exerce pas la même application que la CI — et un e2e d'auth y échoue avec un
// 401 trompeur. Un test qui a besoin d'un staff s'authentifie en doublant
// `AdminTokenVerifier` (cf. `admin-companies.e2e-spec.ts`).
process.env["AUTH_DEV_IMPERSONATE"] = "false";
process.env["AUTH_ADMIN_DEV_BYPASS"] = "false";

/**
 * Jeton interne qui protège `POST /admin/recompute` (porte machine-à-machine du
 * Cron Trigger). Posé **en dur** pour toutes les suites : sans bypass de dev, le
 * guard exige ce jeton — l'e2e du recompute le présente en réutilisant cette
 * constante plutôt qu'en touchant `process.env` (interdit hors de ce fichier).
 */
export const TEST_RECOMPUTE_TOKEN = "test-recompute-secret";
process.env["RECOMPUTE_TOKEN"] = TEST_RECOMPUTE_TOKEN;

/** URL de la base de test, une fois le défaut ci-dessus appliqué. */
export function testDatabaseUrl(): string {
  return process.env["DATABASE_B2B_URL"] ?? DEFAULT_TEST_DATABASE_URL;
}

/**
 * Environnement à passer à un process enfant (la CLI Prisma) pour qu'il vise la
 * base de test et non celle du `.env`.
 */
export function testChildEnv(): NodeJS.ProcessEnv {
  return { ...process.env, DATABASE_B2B_URL: testDatabaseUrl() };
}
