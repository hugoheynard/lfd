/**
 * E2E **la purge des intentions des gestes** (sept jours, décidé par Hugo le
 * 2026-11-12) sur la vraie base.
 *
 * Ce que seule cette suite prouve : la route machine sous `RecomputeGuard`, la
 * règle `claimed_at < now − 7 j` en SQL, et la conséquence assumée de la
 * purge — une clé rejouée APRÈS la purge n'est plus reconnue, et le geste se
 * refait. C'est pourquoi la durée dépasse largement les renvois réels.
 *
 * Le geste passe par la vraie garde (`OncePerIntent` sur le registre Prisma) ;
 * l'ancienneté est relative à maintenant (`daysAgo`) : le `Clock` de l'API lit
 * le même mur.
 */
import type { GestureIntent } from "../src/platform/intent/gesture-intent.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../src/platform/intent/once-per-intent.js";
import { bootstrapE2e, daysAgo, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

const ROUTE = "/admin/intents/purge";

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

function intent(key: string): GestureIntent {
  return { actorId: "staff_purge", key, gesture: "test.purge", subject: "sujet" };
}

async function seedIntent(id: string, claimedAt: string): Promise<void> {
  await ctx.prisma.gestureIntent.create({
    data: {
      id,
      actorId: "staff_purge",
      key: id,
      gesture: "test.purge",
      subject: "sujet",
      claimedAt: new Date(claimedAt),
      resolvedAt: new Date(claimedAt),
      result: {},
    },
  });
}

async function purge(): Promise<Record<string, unknown>> {
  const response = await ctx
    .http()
    .post(ROUTE)
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
  return response.body as Record<string, unknown>;
}

async function remainingIds(): Promise<string[]> {
  const rows = await ctx.prisma.gestureIntent.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((row) => row.id);
}

describe("POST /admin/intents/purge", () => {
  it("refuse un appel sans le jeton machine", async () => {
    await ctx.http().post(ROUTE).expect(401);
  });

  it("une intention de huit jours part, une de six jours reste", async () => {
    await seedIntent("old_8d", daysAgo(8));
    await seedIntent("recent_6d", daysAgo(6));

    expect(await purge()).toMatchObject({ mode: "on", eligible: 1, purged: 1 });
    expect(await remainingIds()).toEqual(["recent_6d"]);
  });

  it("rejouée, ne trouve plus rien", async () => {
    await seedIntent("old_8d", daysAgo(8));
    await purge();

    expect(await purge()).toMatchObject({ eligible: 0, purged: 0 });
  });

  it("une clé rejouée après la purge n'est plus reconnue : le geste se refait", async () => {
    const guard = ctx.app.get(OncePerIntent);
    let executions = 0;
    const gesture = (): Promise<void> => {
      executions += 1;
      return Promise.resolve();
    };

    await guard.run(intent("k1"), NOTHING_TO_REPLAY, gesture);
    await guard.run(intent("k1"), NOTHING_TO_REPLAY, gesture);
    expect(executions).toBe(1);

    // L'intention vieillit au-delà des sept jours, puis la nuit passe.
    await ctx.prisma.gestureIntent.updateMany({
      where: { key: "k1" },
      data: { claimedAt: new Date(daysAgo(8)), resolvedAt: new Date(daysAgo(8)) },
    });
    await purge();

    await guard.run(intent("k1"), NOTHING_TO_REPLAY, gesture);
    expect(executions).toBe(2);
  });
});
