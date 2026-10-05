/**
 * E2E du **relevé de cycle** (plan `documentation/order/plan-agregation-des-commandes.md`, A1).
 *
 * Ce que seul le vrai SQL prouve :
 *
 * - le relevé lit le MÊME périmètre que l'assiette du prélèvement : une
 *   commande annulée, réglée par carte ou gratuite n'y entre pas ;
 * - le mur de la société est dans le `where` : la commande d'une autre société
 *   ne s'y glisse pas ;
 * - le JSON `vat_shares` réel — présent ou `null` — se relit en parts par taux
 *   et en « non ventilée », et la TVA totale retombe sur Σ `vat_cents` ;
 * - le mur staff : `b2b_companies:read` lit le relevé mais pas l'export.
 *
 * ⚠️ Commandes écrites par Prisma : même dette que `test/factories.ts` et
 * `accounting-legal-entity.e2e-spec.ts`. Ce qui est éprouvé est en AVAL — la
 * lecture et l'agrégation. Elles prennent l'instant de la base, donc tombent
 * dans le cycle en cours sans aucune date écrite ici.
 */
import { instantToLocal, type CycleStatementView, type StatementCyclesView } from "@lfd/contracts";

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

const BASE = "/admin/accounting/statements";

let seq = 0;

interface OrderSeed {
  readonly companyId: string;
  readonly userId: string;
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly vatShares?: readonly { rate: number; amountCents: number }[];
  readonly deliveryFeeCents?: number;
  readonly discountCents?: number;
  readonly status?: "placed" | "cancelled";
  readonly paymentStatus?: "not_required" | "paid";
  readonly createdAt?: Date;
}

async function seedOrder(seed: OrderSeed): Promise<string> {
  seq += 1;
  const orderNumber = `CMD-REL-${String(seq)}`;
  await ctx.prisma.order.create({
    data: {
      orderNumber,
      companyId: seed.companyId,
      placedByUserId: seed.userId,
      subtotalCents: seed.subtotalCents,
      discountCents: seed.discountCents ?? 0,
      deliveryFeeCents: seed.deliveryFeeCents ?? 0,
      vatCents: seed.vatCents,
      totalCents: seed.totalCents,
      status: seed.status ?? "placed",
      paymentStatus: seed.paymentStatus ?? "not_required",
      ...(seed.vatShares === undefined ? {} : { vatShares: [...seed.vatShares] }),
      ...(seed.createdAt === undefined ? {} : { createdAt: seed.createdAt }),
    },
  });
  return orderNumber;
}

async function client(name: string): Promise<{ companyId: string; userId: string }> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  const user = await createUser(ctx.prisma, { auth0Sub: `releve-${String(seq)}` });
  return { companyId: company.id, userId: user.id };
}

async function statement(companyId: string, query = ""): Promise<CycleStatementView> {
  return jsonBody<CycleStatementView>(
    await staff().get(`${BASE}/companies/${companyId}${query}`).expect(200),
  );
}

/** Une fiche staff d'un rôle donné, sans dérogation. */
async function staffOfRole(
  role: "support" | "communication",
): Promise<ReturnType<E2eContext["asSub"]>> {
  const sub = `staff-${role}`;
  await ctx.prisma.staffUser.create({
    data: {
      firstName: "Test",
      lastName: role,
      email: `${role}@lfc.test`,
      role,
      status: "active",
      auth0Id: sub,
    },
  });
  return ctx.asSub(sub);
}

describe("le relevé d'un cycle", () => {
  it("ne retient que les commandes passées au compte par CETTE société", async () => {
    const port = await client("Boulangerie du Port");
    const other = await client("Autre Société");

    const kept = await seedOrder({
      ...port,
      subtotalCents: 10_000,
      deliveryFeeCents: 1_500,
      discountCents: 500,
      vatShares: [
        { rate: 5.5, amountCents: 523 },
        { rate: 20, amountCents: 300 },
      ],
      vatCents: 823,
      totalCents: 11_823,
    });
    await seedOrder({
      ...port,
      subtotalCents: 1_000,
      vatCents: 55,
      totalCents: 1_055,
      status: "cancelled",
    });
    await seedOrder({
      ...port,
      subtotalCents: 1_000,
      vatCents: 55,
      totalCents: 1_055,
      paymentStatus: "paid",
    });
    await seedOrder({ ...port, subtotalCents: 0, vatCents: 0, totalCents: 0 });
    await seedOrder({ ...other, subtotalCents: 2_000, vatCents: 110, totalCents: 2_110 });

    const view = await statement(port.companyId);

    expect(view.orders.map((order) => order.orderNumber)).toEqual([kept]);
    expect(view.provisional).toBe(true);
    expect(view.cycle.inProgress).toBe(true);
    expect(view.scope).toContain("Hors commandes payées par carte");
    expect(view.orders[0]).toMatchObject({ htCents: 9_500, deliveryFeeCents: 1_500 });
  });

  it("porte la TVA d'une commande sans ventilation en « non ventilée », et retombe sur Σ vat_cents", async () => {
    const port = await client("Boulangerie du Port");
    await seedOrder({
      ...port,
      subtotalCents: 10_000,
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      vatCents: 550,
      totalCents: 10_550,
    });
    await seedOrder({ ...port, subtotalCents: 4_000, vatCents: 220, totalCents: 4_220 });

    const { totals } = await statement(port.companyId);

    expect(totals.vatByRate).toEqual([{ rate: 5.5, amountCents: 550 }]);
    expect(totals.unventilatedVatCents).toBe(220);
    expect(totals.vatCents).toBe(770);
    expect(totals.totalCents).toBe(14_770);
  });

  it("lit un mois passé à part du mois en cours", async () => {
    const port = await client("Boulangerie du Port");
    const past = new Date(daysAgo(40));
    const pastMonth = instantToLocal(past).day.slice(0, 7);
    const old = await seedOrder({
      ...port,
      subtotalCents: 1_000,
      vatCents: 55,
      totalCents: 1_055,
      createdAt: past,
    });

    const view = await statement(port.companyId, `?month=${pastMonth}`);
    expect(view.cycle).toMatchObject({ month: pastMonth, inProgress: false });
    expect(view.orders.map((order) => order.orderNumber)).toEqual([old]);
    expect((await statement(port.companyId)).orders).toEqual([]);
  });

  it("rend un relevé vide, à zéro, pour un cycle sans commande", async () => {
    const port = await client("Boulangerie du Port");
    const view = await statement(port.companyId);
    expect(view.orders).toEqual([]);
    expect(view.totals).toMatchObject({ orderCount: 0, vatCents: 0, totalCents: 0 });
  });

  it("refuse une société inconnue (404) et un mois mal formé (400)", async () => {
    await staff().get(`${BASE}/companies/absente`).expect(404);
    const port = await client("Boulangerie du Port");
    await staff().get(`${BASE}/companies/${port.companyId}?month=2026-13`).expect(400);
  });
});

describe("les cycles proposés", () => {
  it("rend douze mois civils, le premier en cours", async () => {
    const { cycles } = jsonBody<StatementCyclesView>(
      await staff().get(`${BASE}/cycles`).expect(200),
    );
    expect(cycles).toHaveLength(12);
    expect(cycles[0]?.inProgress).toBe(true);
    expect(cycles.filter((cycle) => cycle.inProgress)).toHaveLength(1);
  });
});

describe("l'export CSV", () => {
  it("rend une ligne par commande, sous un en-tête qui dit le périmètre, nommé PROVISOIRE", async () => {
    const port = await client("Boulangerie du Port");
    const number = await seedOrder({
      ...port,
      subtotalCents: 10_000,
      vatShares: [{ rate: 5.5, amountCents: 550 }],
      vatCents: 550,
      totalCents: 10_550,
    });

    const response = await staff()
      .get(`${BASE}/companies/${port.companyId}/export.csv`)
      .expect(200);

    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain("RELEVE-PROVISOIRE");
    expect(response.text).toContain("Hors commandes payées par carte");
    expect(response.text).toContain(`"${number}"`);
    expect(response.text).toContain('"TVA 5,5 % (€)"');
  });
});

describe("le mur staff", () => {
  it("la lecture des fiches clients ouvre le relevé, pas l'export", async () => {
    const port = await client("Boulangerie du Port");
    const support = await staffOfRole("support");

    await support.get(`${BASE}/companies/${port.companyId}`).expect(200);
    await support.get(`${BASE}/cycles`).expect(200);
    await support.get(`${BASE}/companies/${port.companyId}/export.csv`).expect(403);
  });

  it("sans droit sur les fiches ni la comptabilité, rien ne se lit (403)", async () => {
    const port = await client("Boulangerie du Port");
    const outsider = await staffOfRole("communication");

    await outsider.get(`${BASE}/companies/${port.companyId}`).expect(403);
    await outsider.get(`${BASE}/cycles`).expect(403);
  });
});
