/**
 * E2E de la surface **prospects** (`GET /admin/prospects`) — sur un vrai Postgres.
 *
 * Ce que seul le vrai SQL prouve : la projection lit le **journal**
 * (`growth.activity_events`, schéma dédié), dérive hot/mid, exclut qui transacte
 * pour une société, et la route est **murée staff** (porte admin). On sème le
 * journal directement (déterministe) — l'émission, elle, est testée ailleurs.
 */
import type { ProspectView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, jsonBody, type E2eContext } from "./e2e-harness.js";

/** Staff doublé : accepte n'importe quel jeton porteur comme staff synthétique. */
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

/** L'agent authentifié comme staff. */
function staff(): ReturnType<E2eContext["http"]> {
  return ctx.http().set("Authorization", "Bearer staff-e2e");
}

/** Insère une ligne de journal (sujet = personne). Ids/clés uniques par séquence. */
async function seed(
  type: string,
  subjectId: string,
  occurredAt: string,
  payload: Record<string, unknown>,
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

describe("GET /admin/prospects", () => {
  it("mure la route côté staff (401 sans jeton porteur)", async () => {
    await ctx.http().get("/admin/prospects").expect(401);
  });

  it("dérive hot/mid du journal et exclut qui transacte pour une société", async () => {
    await seed("user.registered", "u_mid", "2026-08-18T09:00:00.000Z", { email: "mid@resto.fr" });
    await seed("user.registered", "u_hot", "2026-08-10T09:00:00.000Z", { email: "hot@resto.fr" });
    await seed("order.placed", "u_hot", "2026-08-15T09:00:00.000Z", {
      totalCents: 633,
      companyId: null,
    });
    await seed("order.placed", "u_client", "2026-08-12T09:00:00.000Z", {
      totalCents: 5000,
      companyId: "company_1",
    });

    const prospects = jsonBody<ProspectView[]>(await staff().get("/admin/prospects").expect(200));

    // Le client (companyId non nul) est exclu ; hot avant mid.
    expect(prospects.map((p) => p.subjectId)).toEqual(["u_hot", "u_mid"]);
    const hot = prospects[0];
    expect(hot).toMatchObject({
      temperature: "hot",
      email: "hot@resto.fr",
      orderCount: 1,
      totalCents: 633,
      lastOrderAt: "2026-08-15T09:00:00.000Z",
    });
    expect(prospects[1]).toMatchObject({
      temperature: "mid",
      email: "mid@resto.fr",
      orderCount: 0,
    });
  });

  it("unifie les leads cold (agrégat) avec la projection entrante, hot → mid → cold", async () => {
    await seed("order.placed", "u_hot", "2026-08-15T09:00:00.000Z", {
      totalCents: 900,
      companyId: null,
    });
    await ctx.prisma.lead.create({
      data: {
        id: "lead_cold",
        businessName: "Traiteur Démarché",
        email: "démarché@resto.fr",
        status: "contacted",
      },
    });

    const prospects = jsonBody<ProspectView[]>(await staff().get("/admin/prospects").expect(200));
    const cold = prospects.find((p) => p.subjectId === "lead_cold");
    expect(cold).toMatchObject({
      temperature: "cold",
      source: "outbound",
      label: "Traiteur Démarché",
    });
    // Le hot entrant reste avant le cold sortant.
    expect(prospects[0]?.temperature).toBe("hot");
    expect(prospects.at(-1)?.temperature).toBe("cold");
  });

  it("n'affiche pas un lead clos (converted/lost) dans la file — dédup avec le journal", async () => {
    await ctx.prisma.lead.create({
      data: { id: "lead_won", businessName: "Converti", status: "converted" },
    });
    const prospects = jsonBody<ProspectView[]>(await staff().get("/admin/prospects").expect(200));
    expect(prospects.some((p) => p.subjectId === "lead_won")).toBe(false);
  });
});
