/**
 * E2E du **rythme de facturation** de l'entité émettrice (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, lot R2).
 *
 * Ce que seul le vrai serveur prouve : les colonnes et leurs CHECK acceptent ce
 * que le domaine écrit, le rythme programmé se relit sur la fiche avec sa
 * prise d'effet, un 29 traverse le filtre en 400, le fait tombe au journal, et
 * la route est murée par le droit d'écriture comptable.
 *
 * Aucune date absolue : la prise d'effet attendue est calculée par le domaine
 * depuis l'instant présent.
 */
import type { LegalEntityView } from "@lfd/contracts";

import { nextClosureAfter } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { BillingRhythm } from "../src/b2b/accounting/domain/value-objects/billing-rhythm.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";

const BASE = "/admin/accounting/legal-entities";

/** Le jeton porteur EST le `sub` : le 403 de la seule lecture se joue en base. */
const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

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
});

function staff(): ReturnType<E2eContext["asSub"]> {
  return ctx.asSub("staff-e2e");
}

async function declare(): Promise<string> {
  const response = await staff()
    .post(BASE)
    .send({
      name: "La Folie Douce",
      legalForm: "SAS",
      siren: "552100554",
      rcs: "",
      shareCapitalCents: 1_000_000,
      vatNumber: "",
      address: {
        line1: "12 rue du Fournil",
        line2: "",
        postalCode: "73000",
        city: "Chambéry",
        countryCode: "FR",
      },
    })
    .expect(201);
  return jsonBody<{ id: string }>(response).id;
}

async function read(id: string): Promise<LegalEntityView> {
  return jsonBody<LegalEntityView>(await staff().get(`${BASE}/${id}`).expect(200));
}

describe("le rythme de facturation de l'entité", () => {
  it("naît mensuel au 1er, sans rien de programmé", async () => {
    const id = await declare();

    expect(await read(id)).toMatchObject({
      billingRhythm: { kind: "monthly", days: [1] },
      nextBillingRhythm: null,
    });
  });

  it("programme le nouveau rythme à la prochaine clôture de l'ancien, et le journalise", async () => {
    const id = await declare();
    const effectiveAt = nextClosureAfter(new Date(daysAgo(0)), BillingRhythm.default());

    await staff()
      .put(`${BASE}/${id}/billing-rhythm`)
      .send({ kind: "weekly", days: [1] })
      .expect(204);

    expect(await read(id)).toMatchObject({
      billingRhythm: { kind: "monthly", days: [1] },
      nextBillingRhythm: { kind: "weekly", days: [1], effectiveAt: effectiveAt.toISOString() },
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: "legal_entity.billing_rhythm_changed" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          subjectLabel: "La Folie Douce",
          from: { kind: "monthly", days: [1] },
          to: { kind: "weekly", days: [1] },
          effectiveAt: effectiveAt.toISOString(),
        },
      },
    ]);
  });

  it("revenir au rythme en vigueur annule le programmé", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/billing-rhythm`)
      .send({ kind: "semimonthly", days: [16, 1] })
      .expect(204);

    await staff()
      .put(`${BASE}/${id}/billing-rhythm`)
      .send({ kind: "monthly", days: [1] })
      .expect(204);

    expect((await read(id)).nextBillingRhythm).toBeNull();
  });

  it("refuse le 29 en 400, en disant ce qui est attendu, sans rien écrire", async () => {
    const id = await declare();

    const response = await staff()
      .put(`${BASE}/${id}/billing-rhythm`)
      .send({ kind: "monthly", days: [29] })
      .expect(400);

    expect(JSON.stringify(response.body)).toContain("1 à 28");
    expect((await read(id)).nextBillingRhythm).toBeNull();
  });

  it("refuse un genre inconnu à la forme (400)", async () => {
    const id = await declare();

    await staff()
      .put(`${BASE}/${id}/billing-rhythm`)
      .send({ kind: "yearly", days: [1] })
      .expect(400);
  });

  it("refuse le réglage à la seule lecture comptable (403)", async () => {
    const id = await declare();
    const reader = await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "lecture",
        email: "lecture@lfc.test",
        role: "communication",
        status: "active",
        auth0Id: "staff-lecture",
      },
    });
    await ctx.prisma.staffPermissionOverride.create({
      data: { staffUserId: reader.id, resource: "b2b_accounting", action: "read", effect: "allow" },
    });

    await ctx
      .asSub("staff-lecture")
      .put(`${BASE}/${id}/billing-rhythm`)
      .send({ kind: "weekly", days: [1] })
      .expect(403);
    expect((await read(id)).nextBillingRhythm).toBeNull();
  });
});
