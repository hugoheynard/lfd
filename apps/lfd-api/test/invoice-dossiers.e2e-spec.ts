/**
 * E2E du **dossier de facturation simulé** (plan
 * `documentation/facturation/plan-simulateur-dossier-de-facturation.md`, DF2).
 *
 * Ce que seul le vrai SQL prouve :
 *
 * - le dossier lit le MÊME périmètre que le relevé : une commande annulée,
 *   réglée par carte ou gratuite n'y entre pas, et les deux retombent sur le
 *   même total des bons ;
 * - le mur de la société est dans le `where` : les bons d'une autre société
 *   ne s'y glissent pas ;
 * - les lignes figées (`Decimal(5,2)`), la date demandée (`@db.Date`) et le
 *   JSON de la surtaxe se relisent tels qu'écrits ;
 * - le mur staff : sans `b2b_accounting:read`, rien ne se lit.
 *
 * ⚠️ Commandes écrites par Prisma, même dette que `cycle-statements.e2e-spec.ts`
 * et `test/factories.ts`. Elles prennent l'instant de la base, donc tombent
 * dans le cycle en cours ; les dates demandées sont relatives à maintenant.
 */
import { instantToLocal, type CycleStatementView, type InvoiceDossierView } from "@lfd/contracts";

import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { createCompany, createUser } from "./factories.js";

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
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

const BASE = "/admin/accounting/invoice-dossiers";

/** Le jour local d'aujourd'hui, et un jour sûrement d'un autre mois. */
const TODAY = instantToLocal(new Date(daysAgo(0))).day;
const OTHER_MONTH_DAY = instantToLocal(new Date(daysAgo(-40))).day;

let seq = 0;

interface OrderSeed {
  readonly companyId: string;
  readonly userId: string;
  /** Une baguette à 1,00 € HT par unité, 5,5 %. */
  readonly quantity: number;
  readonly requestedDay?: string | null;
  readonly lateFee?: { readonly cents: number; readonly vatRatePercent: number | null };
  readonly status?: "placed" | "cancelled";
  readonly paymentStatus?: "not_required" | "paid";
}

/** Un bon cohérent : 100 c par baguette, TVA 5,5 % arrondie sur le bon. */
async function seedOrder(seed: OrderSeed): Promise<string> {
  seq += 1;
  const orderNumber = `CMD-DOS-${String(seq)}`;
  const goods = seed.quantity * 100;
  const lateFee = seed.lateFee?.cents ?? 0;
  const lateRate = seed.lateFee?.vatRatePercent ?? null;
  const lateVat = lateRate === null ? 0 : Math.round((lateFee * lateRate) / 100);
  const goodsVat = Math.round(goods * 0.055);
  const day = seed.requestedDay === undefined ? TODAY : seed.requestedDay;
  await ctx.prisma.order.create({
    data: {
      orderNumber,
      companyId: seed.companyId,
      placedByUserId: seed.userId,
      subtotalCents: goods,
      lateFeeCents: lateFee,
      ...(seed.lateFee === undefined
        ? {}
        : {
            lateFeeAdjustment:
              seed.lateFee.vatRatePercent === null
                ? { adjustment: { mode: "amount", cents: lateFee } }
                : {
                    adjustment: { mode: "amount", cents: lateFee },
                    vatRatePercent: seed.lateFee.vatRatePercent,
                  },
          }),
      vatCents: goodsVat + lateVat,
      vatShares: [{ rate: 5.5, amountCents: goodsVat + lateVat }],
      totalCents: goods + lateFee + goodsVat + lateVat,
      status: seed.status ?? "placed",
      paymentStatus: seed.paymentStatus ?? "not_required",
      ...(day === null ? {} : { requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`) }),
      lines: {
        create: [
          {
            sku: "BAG-001",
            productNameSnapshot: "Baguette",
            unitPriceMillicents: 100_000,
            vatRate: "5.50",
            quantity: seed.quantity,
            lineTotalCents: goods,
          },
        ],
      },
    },
  });
  return orderNumber;
}

async function client(name: string): Promise<{ companyId: string; userId: string }> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  const user = await createUser(ctx.prisma, { auth0Sub: `dossier-${String(seq)}` });
  return { companyId: company.id, userId: user.id };
}

async function dossier(companyId: string): Promise<InvoiceDossierView> {
  return jsonBody<InvoiceDossierView>(
    await staff().get(`${BASE}/companies/${companyId}`).expect(200),
  );
}

describe("le dossier de facturation d'un cycle", () => {
  it("retient le périmètre du relevé, et pour CETTE société seulement", async () => {
    const port = await client("Boulangerie du Port");
    const other = await client("Autre Société");
    const kept = await seedOrder({ ...port, quantity: 3 });
    await seedOrder({ ...port, quantity: 1, status: "cancelled" });
    await seedOrder({ ...port, quantity: 1, paymentStatus: "paid" });
    await seedOrder({ ...other, quantity: 5 });

    const view = await dossier(port.companyId);
    const statement = jsonBody<CycleStatementView>(
      await staff().get(`/admin/accounting/statements/companies/${port.companyId}`).expect(200),
    );

    expect(view.orders.map((order) => order.reference)).toEqual([kept]);
    expect(view.ordersTotalCents).toBe(statement.totals.totalCents);
    expect(view.invoice.lines).toEqual([
      expect.objectContaining({ sku: "BAG-001", vatRate: 5.5, quantity: 3, amountCents: 300 }),
    ]);
    expect(view.orders[0]?.requestedDeliveryDate).toBe(TODAY);
    expect(view.differenceCents).toBe(view.gaps.totalCents);
    expect(view.threeGapInvariantHolds).toBe(true);
  });

  it("signale un bon livré un autre mois et un bon sans date, sans les retirer", async () => {
    const port = await client("Boulangerie du Port");
    await seedOrder({ ...port, quantity: 1 });
    const later = await seedOrder({ ...port, quantity: 1, requestedDay: OTHER_MONTH_DAY });
    const undated = await seedOrder({ ...port, quantity: 1, requestedDay: null });

    const view = await dossier(port.companyId);

    expect(view.orders).toHaveLength(3);
    expect(view.otherMonthOrders).toEqual([
      { reference: later, requestedDeliveryDate: OTHER_MONTH_DAY },
    ]);
    expect(view.ordersWithoutDate).toEqual([undated]);
  });

  it("lit le taux de la surtaxe dans le JSON figé, et refuse (409) un bon qui ne l'a pas", async () => {
    const port = await client("Boulangerie du Port");
    await seedOrder({ ...port, quantity: 2, lateFee: { cents: 150, vatRatePercent: 5.5 } });
    expect((await dossier(port.companyId)).invoice.lateFeeCents).toBe(150);

    const broken = await seedOrder({
      ...port,
      quantity: 1,
      lateFee: { cents: 100, vatRatePercent: null },
    });
    const response = await staff().get(`${BASE}/companies/${port.companyId}`).expect(409);
    expect(JSON.stringify(response.body)).toContain(broken);
  });

  it("refuse une société inconnue (404) et un mois mal formé (400)", async () => {
    await staff().get(`${BASE}/companies/absente`).expect(404);
    const port = await client("Boulangerie du Port");
    await staff().get(`${BASE}/companies/${port.companyId}?month=2026-13`).expect(400);
  });
});

describe("les CSV du dossier", () => {
  it("rend la facture, les bons et les écarts, un fichier chacun", async () => {
    const port = await client("Boulangerie du Port");
    const number = await seedOrder({ ...port, quantity: 2, requestedDay: null });

    const invoice = await staff()
      .get(`${BASE}/companies/${port.companyId}/invoice.csv`)
      .expect(200);
    expect(invoice.headers["content-type"]).toContain("text/csv");
    expect(invoice.headers["content-disposition"]).toContain("DOSSIER-FACTURE-SIMULEE");
    expect(invoice.text).toContain('"BAG-001";"Baguette";"1,00000";"5,5 %";2;2,00');

    const orders = await staff().get(`${BASE}/companies/${port.companyId}/orders.csv`).expect(200);
    expect(orders.text).toContain(`"${number}"`);
    expect(orders.text).toContain('"sans date demandée"');

    const gaps = await staff().get(`${BASE}/companies/${port.companyId}/gaps.csv`).expect(200);
    expect(gaps.headers["content-disposition"]).toContain("DOSSIER-ECARTS");
    expect(gaps.text).toContain('"Arrondi des lignes"');
  });
});

describe("le mur staff", () => {
  it("sans la lecture comptable, ni le dossier ni ses fichiers ne se lisent (403)", async () => {
    const port = await client("Boulangerie du Port");
    await ctx.prisma.staffUser.create({
      data: {
        firstName: "Test",
        lastName: "support",
        email: "support@lfc.test",
        role: "support",
        status: "active",
        auth0Id: "staff-support",
      },
    });
    const support = ctx.asSub("staff-support");

    await support.get(`${BASE}/companies/${port.companyId}`).expect(403);
    await support.get(`${BASE}/companies/${port.companyId}/invoice.csv`).expect(403);
  });
});
