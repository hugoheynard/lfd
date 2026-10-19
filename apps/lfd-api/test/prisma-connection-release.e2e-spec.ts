/**
 * Régression gardée : une application fermée REND ses connexions Postgres.
 *
 * Symptôme soupçonné le 2026-09-22 (`documentation/ci-cd/e2e-connexions-et-isolation.md`) :
 * des e2e tombés au hasard en « timeout exceeded when trying to connect » ou
 * en 500, chaque worker enchaînant ~30 applications. Si `app.close()` laissait
 * le pool `pg` ouvert, 4 workers × 30 suites × 5 connexions franchiraient les
 * 100 du serveur en cours de route. Mesuré le 2026-10-19 : le pool est bien
 * rendu (c'est `PrismaConnection.onModuleDestroy` qui le fait) — ce test
 * garde que ça le reste.
 */
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "pg";

import { bootstrapE2e } from "./e2e-harness.js";
import { testDatabaseUrl } from "./setup-env.js";

/** Combien de fois on boote et on ferme : assez pour qu'une fuite se cumule. */
const CYCLES = 5;

/** Requêtes simultanées par cycle — de quoi remplir le pool (`max: 5`). */
const PARALLEL_QUERIES = 5;

/** Attente bornée de la libération : 20 × 250 ms. */
const RELEASE_POLLS = 20;
const RELEASE_POLL_MS = 250;

describe("les connexions Postgres d'une application fermée", () => {
  const observer = new Client({ connectionString: testDatabaseUrl() });

  beforeAll(async () => {
    await observer.connect();
  });

  afterAll(async () => {
    await observer.end();
  });

  /** Les connexions ouvertes sur CETTE base, l'observateur exclu. */
  async function openConnections(): Promise<number> {
    const result = await observer.query<{ open: number }>(
      `SELECT count(*)::int AS open FROM pg_stat_activity
        WHERE datname = current_database() AND pid <> pg_backend_pid()`,
    );
    return result.rows[0]?.open ?? 0;
  }

  async function settledAtMost(ceiling: number): Promise<number> {
    let open = await openConnections();
    for (let poll = 0; poll < RELEASE_POLLS && open > ceiling; poll++) {
      await sleep(RELEASE_POLL_MS);
      open = await openConnections();
    }
    return open;
  }

  it(`reviennent au niveau de départ après ${String(CYCLES)} boots et fermetures`, async () => {
    const baseline = await openConnections();

    for (let cycle = 0; cycle < CYCLES; cycle++) {
      const ctx = await bootstrapE2e();
      await Promise.all(
        Array.from(
          { length: PARALLEL_QUERIES },
          () => ctx.prisma.$queryRaw`SELECT pg_sleep(0.05)::text`,
        ),
      );
      // La mesure voit bien le pool : sans ça, un compteur aveugle serait vert.
      expect(await openConnections()).toBeGreaterThan(baseline);
      await ctx.close();
    }

    expect(await settledAtMost(baseline)).toBeLessThanOrEqual(baseline);
  }, 120_000);
});
