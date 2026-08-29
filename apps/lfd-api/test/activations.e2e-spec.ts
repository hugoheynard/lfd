/**
 * E2E de la surface **activation & frictions** (`GET /admin/activations`) — vrai
 * Postgres. Prouve que la projection lit le **journal** (sujet = société), calcule
 * complétion / adoption-stalled / **adoption+** (self, zéro main du staff), et que
 * la route est murée staff. On sème le journal directement (déterministe).
 */
import type { ActivationView } from "@lfd/contracts";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
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

/** Insère une ligne de journal (sujet = société), acteur choisi. */
async function seed(
  type: string,
  companyId: string,
  occurredAt: string,
  actorType: string,
  payload: InputJsonObject,
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

/**
 * Les dates de la fixture, dites par leur INTENTION (cf. `daysAgo`). Seul leur
 * ORDRE porte du sens ici — une déclaration précède l'étape qu'elle rend
 * possible — et le relatif le préserve exactement, sans la date de péremption
 * qu'une date en dur emporte avec elle.
 */
const SELF_DECLARED = daysAgo(10);
const SELF_STEP = daysAgo(9);
const STAFF_DECLARED = daysAgo(11);
const STAFF_STEP = daysAgo(8);
const GHOST_STEP = daysAgo(8);

describe("GET /admin/activations", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/activations").expect(401);
  });

  it("dérive complétion, adoption+ et exclut les sociétés non déclarées", async () => {
    // c_self : déclarée self, une pièce client → adoption+ candidate, pending.
    await seed("company.declared", "c_self", SELF_DECLARED, "customer", {
      via: "self",
    });
    await seed("company.step_reached", "c_self", SELF_STEP, "customer", {
      step: "vat",
    });
    // c_staff : une pièce posée par le staff → PAS adoption+.
    await seed("company.declared", "c_staff", STAFF_DECLARED, "customer", {
      via: "self",
    });
    await seed("company.step_reached", "c_staff", STAFF_STEP, "staff", {
      step: "kbis",
    });
    // Bruit : une étape sans déclaration → hors tunnel.
    await seed("company.step_reached", "c_ghost", GHOST_STEP, "customer", {
      step: "vat",
    });

    const views = jsonBody<ActivationView[]>(await staff().get("/admin/activations").expect(200));

    expect(views.map((v) => v.companyId).sort()).toEqual(["c_self", "c_staff"]);
    const self = views.find((v) => v.companyId === "c_self");
    expect(self).toMatchObject({
      status: "pending",
      stepsReached: ["vat"],
      completion: 0.25,
      adoptionPlus: true,
    });
    expect(views.find((v) => v.companyId === "c_staff")?.adoptionPlus).toBe(false);
  });
});
