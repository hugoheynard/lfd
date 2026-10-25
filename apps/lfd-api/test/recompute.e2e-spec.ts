/**
 * E2E du recompute batch (`POST /admin/recompute`) — sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL + le vrai guard prouvent : la route est **murée par le
 * jeton interne** (porte machine-à-machine du Cron Trigger, pas la porte staff),
 * et un recompte **matérialise** le read-model `growth.lead_scores` depuis le
 * journal. On sème le journal directement (déterministe). Depuis le lot P3
 * (2026-10-25), seuls une société en plan et un lead démarché y entrent.
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

/** Une société déclarée seule, restée en plan : le coup `rescue`. */
function seedStalledCompany(companyId: string): Promise<void> {
  return seed(
    "company.declared",
    companyId,
    daysAgo(8),
    { via: "self", ownerUserId: "u_owner" },
    "company",
  );
}

/** Insère une ligne de journal (sujet = personne, sauf mention). */
async function seed(
  type: string,
  subjectId: string,
  occurredAt: string,
  payload: InputJsonObject,
  subjectType = "user",
): Promise<void> {
  sequence += 1;
  await ctx.prisma.activityEvent.create({
    data: {
      id: `evt_${String(sequence).padStart(6, "0")}`,
      type,
      occurredAt: new Date(occurredAt),
      subjectType,
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
    await seedStalledCompany("c_stalled");

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
      subjectType: "company",
      subjectId: "c_stalled",
      play: "rescue",
    });
    expect(rows[0]?.score).toBeGreaterThan(0);
  });

  /** Régression (lot P3, 2026-10-25) : un particulier y entrait en `lock_in`. */
  it("ne matérialise aucun particulier", async () => {
    await seed("user.registered", "u_perso", daysAgo(8), {});
    await seed("order.placed", "u_perso", daysAgo(3), { totalCents: 5000, companyId: null });

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

  it("remplace intégralement le read-model à chaque recompute (tout-ou-rien)", async () => {
    // 1er recompute : un lead présent.
    await seedStalledCompany("c_stalled");
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
