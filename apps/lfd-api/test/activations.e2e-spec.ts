/**
 * E2E de la surface **activation & frictions** (`GET /admin/activations`) — vrai
 * Postgres. Prouve que la projection lit le **journal** (sujet = société), calcule
 * complétion / adoption-stalled / **adoption+** (self, zéro main du staff), et que
 * la route est murée staff. On sème le journal directement (déterministe).
 */
import type { ActivationView } from "@lfd/contracts";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

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

/** Insère une ligne de journal (sujet = société), acteur choisi. */
async function seed(
  type: string,
  companyId: string,
  occurredAt: string,
  actorType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  sequence += 1;
  await ctx.prisma.activityEvent.create({
    data: {
      id: `evt_${String(sequence).padStart(6, "0")}`,
      type,
      occurredAt: new Date(occurredAt),
      subjectType: "company",
      subjectId: companyId,
      actorType,
      traceId: "0".repeat(32),
      idempotencyKey: `${type}:${companyId}:${sequence}`,
      payload,
    },
  });
}

describe("GET /admin/activations", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/activations").expect(401);
  });

  it("dérive complétion, adoption+ et exclut les sociétés non déclarées", async () => {
    // c_self : déclarée self, une pièce client → adoption+ candidate, pending.
    await seed("company.declared", "c_self", "2026-08-10T09:00:00.000Z", "customer", {
      via: "self",
    });
    await seed("company.step_reached", "c_self", "2026-08-11T09:00:00.000Z", "customer", {
      step: "tva",
    });
    // c_staff : une pièce posée par le staff → PAS adoption+.
    await seed("company.declared", "c_staff", "2026-08-09T09:00:00.000Z", "customer", {
      via: "self",
    });
    await seed("company.step_reached", "c_staff", "2026-08-12T09:00:00.000Z", "staff", {
      step: "kbis",
    });
    // Bruit : une étape sans déclaration → hors tunnel.
    await seed("company.step_reached", "c_ghost", "2026-08-12T09:00:00.000Z", "customer", {
      step: "tva",
    });

    const views = jsonBody<ActivationView[]>(await staff().get("/admin/activations").expect(200));

    expect(views.map((v) => v.companyId).sort()).toEqual(["c_self", "c_staff"]);
    const self = views.find((v) => v.companyId === "c_self");
    expect(self).toMatchObject({
      status: "pending",
      stepsReached: ["tva"],
      completion: 0.25,
      adoptionPlus: true,
    });
    expect(views.find((v) => v.companyId === "c_staff")?.adoptionPlus).toBe(false);
  });
});
