/**
 * E2E des **dates des modes** et du **mode d'un payeur** (plan
 * `documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §16,
 * lot M1). Remplace l'e2e du rythme unique (R2), retiré en M1.
 *
 * Ce que seul le vrai serveur prouve : les deux tables append-only, leurs
 * CHECK et leurs déclencheurs acceptent ce que le domaine écrit ; la fiche et
 * la lecture du payeur relisent le programmé ; un second changement est refusé
 * en 409 ; l'annulation pose `cancelled_at` sans rien effacer ; un site facturé
 * chez un autre est refusé en le nommant ; les faits tombent au journal ; et
 * les routes sont murées par le droit d'écriture comptable.
 *
 * Aucune date absolue : la prise d'effet attendue est calculée par le domaine
 * depuis l'instant présent.
 */
import type { LegalEntityView, PayerBillingModeView } from "@lfd/contracts";

import { nextClosureAfter } from "../src/b2b/accounting/domain/services/billing-cycle.js";
import { BillingRhythm } from "../src/b2b/accounting/domain/value-objects/billing-rhythm.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany } from "./factories.js";

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

async function modeOf(id: string, mode: string): Promise<LegalEntityView["billingModes"][number]> {
  const found = (await read(id)).billingModes.find((candidate) => candidate.mode === mode);
  if (found === undefined) {
    throw new Error(`mode ${mode} absent de la fiche`);
  }
  return found;
}

/** La prochaine clôture du mensuel au 1er — la prise d'effet de tout premier changement. */
function nextMonthlyClosure(): string {
  return nextClosureAfter(new Date(daysAgo(0)), BillingRhythm.default()).toISOString();
}

describe("les dates des modes de l'entité", () => {
  it("naissent aux trois défauts, sans programmé ni verrou", async () => {
    const id = await declare();

    const view = await read(id);
    expect(view.billingModes.map((mode) => [mode.mode, mode.current.days, mode.scheduled])).toEqual(
      [
        ["monthly", [1], null],
        ["semimonthly", [1, 16], null],
        ["weekly", [1], null],
      ],
    );
    expect(view.billingModes[0]?.upcomingClosures[0]?.closesAt).toBe(nextMonthlyClosure());
  });

  it("programme des dates à la prochaine clôture du mode, et le journalise", async () => {
    const id = await declare();
    const effectiveAt = nextMonthlyClosure();

    await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [15] })
      .expect(204);

    expect(await modeOf(id, "monthly")).toMatchObject({
      current: { days: [1], since: null },
      scheduled: { days: [15], effectiveAt },
      changeLockedUntil: effectiveAt,
    });
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: id, type: "legal_entity.billing_mode_dates_changed" },
      select: { payload: true },
    });
    expect(facts).toEqual([
      {
        payload: {
          subjectLabel: "La Folie Douce",
          mode: "monthly",
          from: [1],
          to: [15],
          effectiveAt,
          cancelled: false,
        },
      },
    ]);
  });

  it("refuse en 409 un second changement du même mode, en nommant le geste, sans rien écrire", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [15] })
      .expect(204);

    const response = await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [10] })
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("annulez d'abord le changement programmé");
    expect((await modeOf(id, "monthly")).scheduled?.days).toEqual([15]);
  });

  it("annule le programmé : la ligne reste, annulée, et le mode redevient libre", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/billing-modes/weekly`)
      .send({ days: [5] })
      .expect(204);

    await staff().delete(`${BASE}/${id}/billing-modes/weekly/scheduled`).expect(204);

    expect(await modeOf(id, "weekly")).toMatchObject({ scheduled: null, changeLockedUntil: null });
    const rows = await ctx.prisma.billingModeDates.findMany({ where: { legalEntityId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cancelledAt).not.toBeNull();
    expect(rows[0]?.cancelledByStaffId).not.toBeNull();
  });

  it("refuse en 409 l'annulation quand rien n'est programmé", async () => {
    const id = await declare();

    await staff().delete(`${BASE}/${id}/billing-modes/monthly/scheduled`).expect(409);
  });

  it("refuse le 29 et un mode inconnu en 400", async () => {
    const id = await declare();

    const day = await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [29] })
      .expect(400);
    expect(JSON.stringify(day.body)).toContain("1 à 28");
    await staff()
      .put(`${BASE}/${id}/billing-modes/yearly`)
      .send({ days: [1] })
      .expect(400);
  });

  it("la base refuse d'effacer ou de réécrire un segment (append-only)", async () => {
    const id = await declare();
    await staff()
      .put(`${BASE}/${id}/billing-modes/monthly`)
      .send({ days: [15] })
      .expect(204);

    await expect(
      ctx.prisma.billingModeDates.updateMany({
        where: { legalEntityId: id },
        data: { days: [10] },
      }),
    ).rejects.toThrow(/append_only/u);
    await expect(
      ctx.prisma.billingModeDates.deleteMany({ where: { legalEntityId: id } }),
    ).rejects.toThrow(/append_only/u);
  });
});

describe("le mode d'un payeur", () => {
  it("se lit mensuel par défaut, puis se programme à sa prochaine clôture, et se journalise", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Le Bistrot SAS" });
    const effectiveAt = nextMonthlyClosure();

    const before = jsonBody<PayerBillingModeView>(
      await staff().get(`${BASE}/${id}/payers/${payer.id}/billing-mode`).expect(200),
    );
    expect(before).toMatchObject({ mode: "monthly", since: null, scheduled: null });

    await staff()
      .put(`${BASE}/${id}/payers/${payer.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(204);

    const after = jsonBody<PayerBillingModeView>(
      await staff().get(`${BASE}/${id}/payers/${payer.id}/billing-mode`).expect(200),
    );
    expect(after).toMatchObject({
      mode: "monthly",
      scheduled: { mode: "weekly", effectiveAt },
      changeLockedUntil: effectiveAt,
    });
    expect(after.upcomingClosures[0]?.closesAt).toBe(effectiveAt);
    expect((await modeOf(id, "weekly")).payerCount).toBe(1);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { subjectId: payer.id, type: "payer.billing_mode_changed" },
      select: { payload: true },
    });
    expect(facts).toHaveLength(1);
  });

  it("refuse en 409 un second changement, puis admet l'annulation", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma);
    const route = `${BASE}/${id}/payers/${payer.id}/billing-mode`;
    await staff().put(route).send({ mode: "weekly" }).expect(204);

    await staff().put(route).send({ mode: "semimonthly" }).expect(409);
    await staff().delete(`${route}/scheduled`).expect(204);

    const view = jsonBody<PayerBillingModeView>(await staff().get(route).expect(200));
    expect(view.scheduled).toBeNull();
  });

  it("refuse un site facturé chez un autre, en nommant le payeur (409)", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma, { raisonSociale: "Groupe Payeur SAS" });
    const site = await createCompany(ctx.prisma, { raisonSociale: "Site Annexe SAS" });
    // Comme `cycle-statements-payer` : un site ne suit que son principal ACTUEL
    // (contrainte `company_follows_parent`) — le rattachement d'abord.
    await ctx.prisma.company.update({
      where: { id: site.id },
      data: { parentCompanyId: payer.id },
    });
    await ctx.prisma.companyFollow.create({
      data: {
        companyId: site.id,
        parentId: payer.id,
        aspect: "billing",
        validFrom: new Date(daysAgo(30)),
        validTo: null,
      },
    });

    const response = await staff()
      .put(`${BASE}/${id}/payers/${site.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(409);

    expect(JSON.stringify(response.body)).toContain("Groupe Payeur SAS");
    expect(await ctx.prisma.payerBillingMode.count({ where: { legalEntityId: id } })).toBe(0);
  });

  it("refuse un compte inconnu en 404", async () => {
    const id = await declare();

    await staff()
      .put(`${BASE}/${id}/payers/cmp_inconnu/billing-mode`)
      .send({ mode: "weekly" })
      .expect(404);
  });
});

describe("le droit", () => {
  it("refuse les gestes à la seule lecture comptable (403), sans rien écrire", async () => {
    const id = await declare();
    const payer = await createCompany(ctx.prisma);
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
      .put(`${BASE}/${id}/billing-modes/weekly`)
      .send({ days: [3] })
      .expect(403);
    await ctx
      .asSub("staff-lecture")
      .put(`${BASE}/${id}/payers/${payer.id}/billing-mode`)
      .send({ mode: "weekly" })
      .expect(403);
    expect(await ctx.prisma.billingModeDates.count({ where: { legalEntityId: id } })).toBe(0);
    expect(await ctx.prisma.payerBillingMode.count({ where: { legalEntityId: id } })).toBe(0);
  });
});
