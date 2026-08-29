/**
 * E2E du recompute batch (`POST /admin/recompute`) — sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL + le vrai guard prouvent : la route est **murée par le
 * jeton interne** (porte machine-à-machine du Cron Trigger, pas la porte staff),
 * et un recompte **matérialise** le read-model `growth.lead_scores` depuis le
 * journal. On sème le journal directement (déterministe).
 */
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import type { InputJsonObject } from "../src/platform/database/client/internal/prismaNamespace.js";

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  // `setup-env` a posé RECOMPUTE_TOKEN (lu par AppConfig à l'amorçage) ; on
  // réutilise ici la même constante pour présenter le bon jeton au guard.
  ctx = await bootstrapE2e();
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sequence = 0;
});

/** Insère une ligne de journal (sujet = personne). */
async function seed(
  type: string,
  subjectId: string,
  occurredAt: string,
  payload: InputJsonObject,
): Promise<void> {
  sequence += 1;
  await ctx.prisma.activityEvent.create({
    data: {
      id: `evt_${String(sequence).padStart(6, "0")}`,
      type,
      occurredAt: new Date(occurredAt),
      subjectType: "user",
      subjectId,
      actorType: "customer",
      traceId: "0".repeat(32),
      idempotencyKey: `${type}:${subjectId}:${sequence}`,
      payload,
    },
  });
}

describe("POST /admin/recompute", () => {
  it("refuse sans jeton interne (401)", async () => {
    await ctx.http().post("/admin/recompute").expect(401);
  });

  it("refuse un jeton interne erroné (401)", async () => {
    await ctx.http().post("/admin/recompute").set("x-lfc-recompute-token", "wrong").expect(401);
  });

  it("matérialise le read-model lead_scores depuis le journal avec le bon jeton", async () => {
    await seed("user.registered", "u_hot", daysAgo(8), { email: "hot@resto.fr" });
    await seed("order.placed", "u_hot", daysAgo(3), {
      totalCents: 5000,
      companyId: null,
    });

    const body = jsonBody<{ recomputed: number }>(
      await ctx
        .http()
        .post("/admin/recompute")
        .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
        .expect(200),
    );
    expect(body.recomputed).toBe(1);

    const rows = await ctx.prisma.leadScore.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      subjectType: "user",
      subjectId: "u_hot",
      play: "lock_in",
      label: "hot@resto.fr",
    });
    expect(rows[0]?.score).toBeGreaterThan(0);
  });

  it("remplace intégralement le read-model à chaque recompute (tout-ou-rien)", async () => {
    // 1er recompute : un lead présent.
    await seed("order.placed", "u_hot", daysAgo(3), {
      totalCents: 5000,
      companyId: null,
    });
    await ctx
      .http()
      .post("/admin/recompute")
      .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
      .expect(200);
    expect(await ctx.prisma.leadScore.count()).toBe(1);

    // Le journal est vidé, puis on recompte : la queue doit être vide (pas de reliquat).
    await ctx.reset();
    const body = jsonBody<{ recomputed: number }>(
      await ctx
        .http()
        .post("/admin/recompute")
        .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
        .expect(200),
    );
    expect(body.recomputed).toBe(0);
    expect(await ctx.prisma.leadScore.count()).toBe(0);
  });
});
