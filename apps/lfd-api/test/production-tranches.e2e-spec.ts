/**
 * E2E des **tranches de production** (plan
 * `documentation/fournil/plan-tranches-de-production.md`, T1 et T2), sur le
 * vrai Postgres jetable.
 *
 * Ce que seule cette suite prouve : la ligne absente servie en défaut (fixe,
 * aucune heure), le réglage aller-retour avec son auteur figé et son fait
 * dans la même transaction, le refus nommé d'une saisie invalide sans rien
 * écrire, et les seuils du jour RANGÉS selon le mode, à partir des vraies
 * commandes et des vraies marges du commerce.
 */
import type { ProductionDueThresholdsView, ProductionSettingsView } from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import {
  bootstrapE2e,
  E2E_STAFF_ID,
  E2E_STAFF_SUB,
  jsonBody,
  serviceDay,
  type E2eContext,
} from "./e2e-harness.js";
import { attachTo, createCompany, createUser } from "./factories.js";
import { cardGatewayDouble, payByCard, pickupSite, placeOrder } from "./order-factory.js";

const SETTINGS = "/admin/production/settings";
const TRANCHES = `${SETTINGS}/tranches`;
const DAY = serviceDay();
const SKU = "VIE-001";

const stubAdminVerifier = {
  verify: (token: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject: token, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_tranches") },
    ],
  });
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

const staff = (): ReturnType<E2eContext["asSub"]> => ctx.asSub(E2E_STAFF_SUB);

async function settings(): Promise<ProductionSettingsView> {
  return jsonBody<ProductionSettingsView>(await staff().get(SETTINGS).expect(200));
}

async function dueThresholds(): Promise<ProductionDueThresholdsView> {
  return jsonBody<ProductionDueThresholdsView>(
    await staff().get(`/admin/production/batch/${DAY}/due-thresholds`).expect(200),
  );
}

/**
 * Deux retraits réglés pour le jour, au même point : 4 pour 07:00 et 6 pour
 * 08:00. Marge de retrait 20 min : besoins à 06:40 et 07:40.
 */
async function seedDay(): Promise<void> {
  const site = await pickupSite(ctx.prisma);
  const user = await createUser(ctx.prisma, { auth0Sub: "auth0|client", email: "c@col.fr" });
  const company = await createCompany(ctx.prisma, { enseigne: "Hôtel du Col" });
  await attachTo(ctx.prisma, user.id, company.id);
  for (const [start, end, quantity] of [
    ["07:00", "08:00", 4],
    ["08:00", "09:00", 6],
  ] as const) {
    const order = await placeOrder(ctx, {
      buyerUserId: user.id,
      companyId: company.id,
      settlement: "card",
      forDay: DAY,
      window: { start, end },
      fulfillment: { method: "pickup", pickupSiteId: site },
      lines: [{ sku: SKU, quantity }],
    });
    await payByCard(ctx, order);
  }
  await staff()
    .patch("/admin/delivery-availability")
    .send({ deliveryMarginMinutes: 50, pickupMarginMinutes: 20 })
    .expect(204);
}

describe("Réglages › Production › Tranches (T1)", () => {
  it("sans réglage : mode fixe, aucune heure", async () => {
    expect((await settings()).tranches).toEqual({ mode: "fixed", fixedTranches: [] });
  });

  it("pose les heures triées, fige l'auteur et journalise dans la même transaction", async () => {
    await staff()
      .put(TRANCHES)
      .send({ mode: "fixed", fixedTranches: ["12:00", "05:00", "07:00"] })
      .expect(204);

    expect((await settings()).tranches).toEqual({
      mode: "fixed",
      fixedTranches: ["05:00", "07:00", "12:00"],
    });
    const row = await ctx.prisma.productionTrancheSettings.findUniqueOrThrow({
      where: { key: "house" },
    });
    expect(row.updatedByStaffId).toBe(E2E_STAFF_ID);
    const facts = await ctx.prisma.activityEvent.findMany({
      where: { type: "production_tranche_settings.updated" },
    });
    expect(facts.map((fact) => fact.payload)).toEqual([
      {
        mode: "fixed",
        fixedTranches: ["05:00", "07:00", "12:00"],
        previous: { mode: "fixed", fixedTranches: [] },
      },
    ]);
  });

  it("refuse un doublon en 400 en nommant l'heure, sans rien écrire", async () => {
    const response = await staff()
      .put(TRANCHES)
      .send({ mode: "fixed", fixedTranches: ["05:00", "05:00"] })
      .expect(400);

    expect(jsonBody<{ message: string }>(response).message).toContain("05:00");
    expect(await ctx.prisma.productionTrancheSettings.count()).toBe(0);
  });

  it("refuse une neuvième heure et une heure mal formée en 400", async () => {
    const nine = ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00"];
    await staff().put(TRANCHES).send({ mode: "fixed", fixedTranches: nine }).expect(400);
    await staff()
      .put(TRANCHES)
      .send({ mode: "fixed", fixedTranches: ["5h"] })
      .expect(400);

    expect(await ctx.prisma.productionTrancheSettings.count()).toBe(0);
  });
});

describe("les seuils du jour rangés en tranches (T2)", () => {
  it("sans réglage : une seule tranche, la journée", async () => {
    await seedDay();

    const view = await dueThresholds();

    expect(view).toMatchObject({ trancheMode: "fixed", fixedTranches: [] });
    expect(view.lines.find((line) => line.sku === SKU)?.thresholds).toEqual([
      { kind: "day", before: null, quantity: 10, cumulative: 10 },
    ]);
  });

  it("en mode fixe : 06:40 tombe à 05:00, 07:40 à 07:00", async () => {
    await seedDay();
    await staff()
      .put(TRANCHES)
      .send({ mode: "fixed", fixedTranches: ["05:00", "07:00", "12:00"] })
      .expect(204);

    const view = await dueThresholds();

    expect(view.fixedTranches).toEqual(["05:00", "07:00", "12:00"]);
    expect(view.lines.find((line) => line.sku === SKU)?.thresholds).toEqual([
      { kind: "deadline", before: "05:00", quantity: 4, cumulative: 4 },
      { kind: "deadline", before: "07:00", quantity: 6, cumulative: 10 },
    ]);
  });

  it("en mode fixe : un besoin d'avant la première tranche est signalé", async () => {
    await seedDay();
    await staff()
      .put(TRANCHES)
      .send({ mode: "fixed", fixedTranches: ["07:00"] })
      .expect(204);

    const thresholds = (await dueThresholds()).lines.find((line) => line.sku === SKU)?.thresholds;

    expect(thresholds).toEqual([
      { kind: "before_first", before: "07:00", quantity: 4, cumulative: 4, earliest: "06:40" },
      { kind: "deadline", before: "07:00", quantity: 6, cumulative: 10 },
    ]);
  });

  it("en mode calculé : les heures des besoins, sans heure fixe servie", async () => {
    await seedDay();
    await staff()
      .put(TRANCHES)
      .send({ mode: "computed", fixedTranches: ["05:00"] })
      .expect(204);

    const view = await dueThresholds();

    expect(view).toMatchObject({ trancheMode: "computed", fixedTranches: [] });
    expect(view.lines.find((line) => line.sku === SKU)?.thresholds).toEqual([
      { kind: "deadline", before: "06:40", quantity: 4, cumulative: 4 },
      { kind: "deadline", before: "07:40", quantity: 6, cumulative: 10 },
    ]);
  });
});
