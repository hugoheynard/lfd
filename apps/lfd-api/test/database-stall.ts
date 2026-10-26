/**
 * Rendre un blocage de base NOMMÉ, au lieu d'un hook qui expire en silence.
 *
 * Le 2026-10-26, deux suites lourdes (`dev-seed-sites`, puis
 * `delivery-notes-terms-scenario`) se sont figées environ quatre minutes dans
 * leur `beforeAll` en CI, jamais la même deux fois et jamais en local. Le
 * journal ne disait rien : Jest annonce un dépassement de délai, pas ce que la
 * base attendait. Deux gestes ici :
 *
 * 1. **armer** la base du worker — une attente de verrou ou une transaction
 *    oubliée ouverte échoue en trente secondes, avec le message de Postgres ;
 * 2. **photographier** la base quand une étape échoue ou dépasse son seuil —
 *    qui est connecté, qui attend quoi, quels verrous ne sont pas accordés.
 *
 * L'acquisition d'une connexion du pool, elle, lève déjà : `PrismaService`
 * règle `connectionTimeoutMillis` pour tous les environnements (vérifié le
 * 2026-10-26), donc rien à ajouter ici.
 */
import { Client } from "pg";

/** Au-delà, une attente de verrou ou une transaction inactive est une faute. */
const SESSION_LIMIT = "30s";

/** Le seuil au-delà duquel une étape est photographiée sans attendre sa fin. */
const DEFAULT_STALL_MS = 90_000;

/** Même garde que le harnais : on ne règle qu'une base jetable. */
const DISPOSABLE_NAME = /_test(_w\d+)?$/u;

/** Délai de connexion de la photographie — elle ne doit pas pendre à son tour. */
const CONNECT_TIMEOUT_MS = 5_000;

async function withClient<T>(url: string, use: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  await client.connect();
  try {
    return await use(client);
  } finally {
    await client.end();
  }
}

/**
 * Pose `lock_timeout` et `idle_in_transaction_session_timeout` sur la BASE du
 * worker, donc sur toute session ouverte après — le pool de l'application
 * compris, à condition d'appeler ceci avant son boot.
 *
 * Par la base plutôt que par l'URL ou le pool : la configuration de production
 * reste intouchée, et la CLI Prisma, qui reçoit la même URL, n'a pas à
 * comprendre un paramètre `options`.
 */
export async function armSessionTimeouts(url: string): Promise<void> {
  await withClient(url, async (client) => {
    const { rows } = await client.query<{ name: string }>("SELECT current_database() AS name");
    const name = rows[0]?.name ?? "";
    if (!DISPOSABLE_NAME.test(name)) {
      throw new Error(
        `REFUS : « ${name} » n'est pas une base de test, ses délais ne se règlent pas d'ici.`,
      );
    }
    const quoted = client.escapeIdentifier(name);
    await client.query(`ALTER DATABASE ${quoted} SET lock_timeout = '${SESSION_LIMIT}'`);
    await client.query(
      `ALTER DATABASE ${quoted} SET idle_in_transaction_session_timeout = '${SESSION_LIMIT}'`,
    );
  });
}

const ACTIVITY_SQL = `
  SELECT pid, state, wait_event_type, wait_event,
         left(query, 120) AS query, xact_start, now() - xact_start AS xact_age
  FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid()
  ORDER BY xact_start NULLS LAST`;

const WAITING_LOCKS_SQL = `
  SELECT l.pid, l.locktype, l.mode, l.relation::regclass::text AS relation,
         pg_blocking_pids(l.pid) AS blocked_by
  FROM pg_locks l
  WHERE NOT l.granted`;

/**
 * Écrit sur la sortie d'erreur l'état de la base du worker. N'échoue jamais :
 * une photographie ratée ne doit pas masquer l'erreur qu'elle accompagne.
 */
export async function reportDatabaseState(url: string, label: string): Promise<void> {
  try {
    const [activity, locks] = await withClient(url, async (client) => [
      (await client.query(ACTIVITY_SQL)).rows,
      (await client.query(WAITING_LOCKS_SQL)).rows,
    ]);
    process.stderr.write(
      `\n[base e2e] ${label}\n` +
        `pg_stat_activity :\n${JSON.stringify(activity, null, 2)}\n` +
        `pg_locks non accordés :\n${JSON.stringify(locks, null, 2)}\n`,
    );
  } catch (cause) {
    process.stderr.write(`\n[base e2e] ${label} — photographie impossible : ${String(cause)}\n`);
  }
}

/**
 * Exécute une étape lourde (un `beforeAll` de semis) en la surveillant : la
 * base est photographiée si l'étape dépasse `stallMs`, puis de nouveau si elle
 * échoue. L'erreur est relancée telle quelle.
 */
export async function watchStall<T>(
  url: string,
  label: string,
  step: () => Promise<T>,
  stallMs: number = DEFAULT_STALL_MS,
): Promise<T> {
  const timer = setTimeout(() => {
    void reportDatabaseState(url, `${label} : toujours en cours après ${String(stallMs)} ms`);
  }, stallMs);
  timer.unref();
  try {
    return await step();
  } catch (cause) {
    await reportDatabaseState(url, `${label} : échec`);
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
