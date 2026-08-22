/**
 * E2E du cockpit (`GET /admin/cockpit`) — vrai Postgres.
 *
 * Ce que seul le bout-en-bout prouve : la queue lit le **read-model matérialisé**
 * `lead_scores` (pas le journal brut), la route est **murée staff**, et afficher
 * la queue **journalise `reco.shown`** — de façon **idempotente** par fenêtre de
 * recompute (rouvrir le cockpit ne recompte pas l'affichage). On matérialise via
 * le vrai `POST /admin/recompute` pour éprouver la chaîne complète.
 */
import type { LeadScoreView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";
import type { InputJsonObject } from "../src/platform/database/client/internal/prismaNamespace.js";

const stubAdminVerifier = {
  verify: (): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: "staff-e2e", scopes: [] }),
};

let ctx: E2eContext;
let sequence = 0;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [{ token: AdminTokenVerifier, value: stubAdminVerifier }],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  sequence = 0;
});

function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

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

/** Matérialise le read-model via le vrai endpoint de recompute. */
async function recompute(): Promise<void> {
  await ctx
    .http()
    .post("/admin/recompute")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

describe("GET /admin/cockpit", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/cockpit").expect(401);
  });

  it("rend la queue top-5 du read-model matérialisé et journalise reco.shown", async () => {
    await seed("order.placed", "u_hot", "2026-08-15T09:00:00.000Z", {
      totalCents: 5000,
      companyId: null,
    });
    await recompute();

    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ subjectId: "u_hot", play: "lock_in" });

    // reco.shown a bien été journalisé pour le coup affiché.
    const shown = await ctx.prisma.activityEvent.findMany({ where: { type: "reco.shown" } });
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ subjectType: "user", subjectId: "u_hot" });
  });

  it("reste idempotent : rouvrir le cockpit dans la même fenêtre ne recompte pas reco.shown", async () => {
    await seed("order.placed", "u_hot", "2026-08-15T09:00:00.000Z", {
      totalCents: 5000,
      companyId: null,
    });
    await recompute();

    await staff().get("/admin/cockpit").expect(200);
    await staff().get("/admin/cockpit").expect(200);

    const shown = await ctx.prisma.activityEvent.count({ where: { type: "reco.shown" } });
    expect(shown).toBe(1);
  });

  it("rend une queue vide quand le read-model n'a pas été matérialisé", async () => {
    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    expect(queue).toEqual([]);
  });

  it("fait remonter un lead cold actif dans la queue avec la play nurture", async () => {
    await ctx.prisma.lead.create({
      data: { id: "lead_nego", businessName: "Traiteur Démarché", status: "negotiating" },
    });
    await recompute();

    const queue = jsonBody<LeadScoreView[]>(await staff().get("/admin/cockpit").expect(200));
    const cold = queue.find((entry) => entry.subjectId === "lead_nego");
    expect(cold).toMatchObject({
      subjectType: "lead",
      play: "nurture",
      label: "Traiteur Démarché",
    });
  });
});
