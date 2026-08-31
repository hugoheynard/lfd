/**
 * Env des tests — **le seul fichier de `test/` autorisé à lire `process.env`**
 * (allowlist explicite dans `eslint.config.mjs`). Les modules d'infra (DB, Auth)
 * échouent volontairement à l'amorçage si leur configuration manque : on la
 * fournit donc ici, une fois pour toutes les suites.
 *
 * Deux régimes, et la différence est ce qui fait tenir ce fichier :
 *
 * - `??=` — une valeur déjà présente gagne. Pour ce que la CI doit pouvoir
 *   pointer ailleurs sans toucher au code : la base, le tenant Auth0.
 * - `=` — **écrasement dur**. Pour tout ce dont le `.env` local donnerait une
 *   version DIFFÉRENTE de celle du runner : bypass d'auth, stockage objet,
 *   prestataire de paiement. Sans ça, `pnpm test` en local n'exerce pas la même
 *   application que la CI, et l'écart ne se découvre qu'après le push.
 *
 * Ajouter un réglage optionnel que le `.env` renseigne, sans l'inscrire ici,
 * recrée exactement cette panne — c'est arrivé pour Stripe.
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

/**
 * Combien de workers e2e — et donc combien de bases et de buckets à provisionner.
 *
 * UNE SEULE source pour les trois : `jest.e2e.cjs` la lit pour `maxWorkers`, et
 * `setup-test-database.ts` pour savoir combien de bases créer. Deux réglages
 * séparés se désaccorderaient un jour, et ce jour-là deux workers partageraient
 * une base — exactement la panne que tout ceci existe pour empêcher.
 */
export const E2E_WORKERS = Number(process.env["E2E_WORKERS"] ?? "4");

/**
 * Le numéro du worker courant, 1..N.
 *
 * Jest pose `JEST_WORKER_ID` dans chaque worker. Hors de Jest — le script de
 * provisionnement, par exemple — il n'y a pas de worker : on prend 1.
 */
export function workerSlot(): number {
  return Number(process.env["JEST_WORKER_ID"] ?? "1");
}

/**
 * L'URL de la base d'un worker donné : le nom de base, suffixé `_w<n>`.
 *
 * 🔴 C'EST CE QUI REMPLACE `--runInBand`.
 *
 * Les suites tronquent la base entre chaque cas. Tant qu'elles la partageaient,
 * deux suites en parallèle s'effaçaient leurs fixtures l'une l'autre : un staff
 * semé par l'une n'existait plus quand l'autre l'interrogeait, le mur d'accès
 * refusait, et le 403 était PARFAITEMENT LÉGITIME — c'est ce qui rendait la
 * panne illisible. Le worker unique était la réponse ; une base par worker est
 * la même réponse, sans la file d'attente.
 *
 * Le suffixe est appliqué même à un worker seul (`_w1`) : une règle qui
 * s'applique toujours se vérifie, une règle qui ne vaut qu'au-delà de deux
 * workers ne se teste jamais dans le cas courant.
 */
function slotDatabaseUrl(base: string, slot: number): string {
  const parsed = new URL(base);
  parsed.pathname = `${parsed.pathname.replace(/\/$/u, "")}_w${String(slot)}`;
  return parsed.toString();
}

process.env["DATABASE_LFD_URL"] ??= DEFAULT_TEST_DATABASE_URL;
// Le suffixe de worker est posé APRÈS le `??=` : la CI garde le droit de
// pointer un autre serveur, elle n'a pas celui de faire partager une base.
process.env["DATABASE_LFD_URL"] = slotDatabaseUrl(process.env["DATABASE_LFD_URL"], workerSlot());
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
 * Stockage objet des e2e : le MinIO du conteneur de dev (`lfd-dev-minio`, port
 * hôte 9100), mais un bucket **à part** — `lfc-b2b-test`, jamais celui de dev,
 * pour qu'un test qui vide le bucket n'emporte pas les pièces de travail. Même
 * raisonnement que `lfc_b2b_test` face à la base de développement.
 *
 * **Écrasement dur**, comme les bypass ci-dessus et pour la même raison : le
 * `.env` local pointe le bucket de DEV, donc un `??=` laisserait les e2e écrire
 * — et supprimer — dedans.
 */
const TEST_STORAGE = {
  // Un bucket par worker, pour la RAISON EXACTE de la base : `resetStorage()`
  // vide le bucket entre deux tests. Partagé, un worker emporterait les pièces
  // d'un autre — et l'échec accuserait une suite qui n'a rien fait.
  bucket: `lfc-b2b-test-w${String(workerSlot())}`,
  endpoint: "http://localhost:9100",
  region: "auto",
  accessKeyId: "lfc",
  secretAccessKey: "lfclfclfc",
} as const;

process.env["R2_KBIS_BUCKET"] = TEST_STORAGE.bucket;
process.env["R2_ENDPOINT"] = TEST_STORAGE.endpoint;
process.env["R2_REGION"] = TEST_STORAGE.region;
process.env["R2_KBIS_ACCESS_KEY_ID"] = TEST_STORAGE.accessKeyId;
process.env["R2_KBIS_SECRET_ACCESS_KEY"] = TEST_STORAGE.secretAccessKey;

/** La configuration de stockage des tests — lue par `test/storage.ts`. */
export function testStorageConfig(): typeof TEST_STORAGE {
  return TEST_STORAGE;
}

/**
 * Prestataire de paiement — **des valeurs factices, mais PRÉSENTES**.
 *
 * Les trois vont ensemble ou aucune (cf. `optionalStripeConfig`). Sans elles,
 * `PaymentGateway.publishableKey()` lève, et `GET /admin/companies/:id/mandate`
 * — qui renvoie cette clé pour monter l'IBAN Element — rend `500`.
 *
 * **Écrasement dur**, comme le stockage et les bypass, mais pour une raison
 * pire : l'absence ne se voyait QU'EN CI. Le `.env` local renseigne Stripe, donc
 * la suite du mandat passait ici et échouait sur le runner. C'est le symptôme le
 * plus coûteux qui soit — il n'apparaît qu'après le push, sur du code qu'on
 * croyait éprouvé.
 *
 * Aucun appel réseau n'en découle : le SDK ne se connecte qu'à l'appel d'une
 * API, et les suites qui en font une doublent `PaymentGateway` (orders,
 * admin-orders, account-alerts). Celle du mandat ne double que `MandateGateway`
 * et traverse donc le vrai adaptateur — voulu : elle éprouve le vrai contrôleur.
 */
process.env["STRIPE_SECRET_KEY"] = "sk_test_e2e";
process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_e2e";
process.env["STRIPE_PUBLISHABLE_KEY"] = "pk_test_e2e";

/**
 * Jeton interne qui protège `POST /admin/recompute` (porte machine-à-machine du
 * Cron Trigger). Posé **en dur** pour toutes les suites : sans bypass de dev, le
 * guard exige ce jeton — l'e2e du recompute le présente en réutilisant cette
 * constante plutôt qu'en touchant `process.env` (interdit hors de ce fichier).
 */
export const TEST_RECOMPUTE_TOKEN = "test-recompute-secret";
process.env["RECOMPUTE_TOKEN"] = TEST_RECOMPUTE_TOKEN;

/**
 * La publication du catalogue est **ouverte** dans les tests.
 *
 * Écrasement dur, et c'est le régime qui compte : ce drapeau est fermé par
 * défaut sur un déploiement, et ce qu'on mesure ici est le produit ENTIER — les
 * suites de push et d'ancrage doivent exercer ce qu'elles décrivent, pas la
 * moitié qui reste allumée. Un `.env` local qui le fermerait rendrait ces
 * suites vertes en ne mesurant rien.
 *
 * La suite qui éprouve le drapeau LUI-MÊME le referme dans son propre
 * amorçage — c'est le seul endroit où sa valeur est le sujet.
 */
process.env["PIM_PUBLICATION_ENABLED"] = "true";

/** URL de la base de test, une fois le défaut ci-dessus appliqué. */
export function testDatabaseUrl(): string {
  return process.env["DATABASE_LFD_URL"] ?? DEFAULT_TEST_DATABASE_URL;
}

/** L'URL de la base d'un worker donné — pour le provisionnement, qui les crée toutes. */
export function testDatabaseUrlForSlot(slot: number): string {
  const base = process.env["DATABASE_LFD_URL"] ?? DEFAULT_TEST_DATABASE_URL;
  // `testDatabaseUrl()` porte déjà le suffixe du worker courant : on le retire
  // avant d'appliquer celui qu'on vise, sinon on empilerait `_w1_w2`.
  return slotDatabaseUrl(base.replace(/_w\d+$/u, ""), slot);
}

/**
 * Environnement à passer à un process enfant (la CLI Prisma) pour qu'il vise la
 * base de test et non celle du `.env`.
 */
export function testChildEnv(url: string = testDatabaseUrl()): NodeJS.ProcessEnv {
  return {
    ...process.env,
    DATABASE_LFD_URL: url,
  };
}
