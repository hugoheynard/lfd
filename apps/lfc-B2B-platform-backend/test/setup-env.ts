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
