/**
 * E2E du **relevé de cycle** (plan `documentation/commandes/bon-et-pieces/plan-agregation-des-commandes.md`, A1).
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
 * Les commandes passent par le vrai chemin (`placeOrder`, plan T) ; leurs
 * montants sont relus sur la commande passée. Les formes que la passation ne
 * produit pas (deux taux, remise et port, TVA non ventilée, total nul)
 * restent des écritures brutes, justifiées sur `seedLegacyOrder`. Sans date
 * dite, elles tombent dans le cycle en cours.
 */
import type {
  CycleStatementOrderView,
  CycleStatementView,
  StatementCyclesView,
} from "@lfd/contracts";

import { StatementMonth } from "../src/b2b/accounting/domain/value-objects/statement-month.js";
import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import {
  attachTo,
  createCompany,
  createUser,
  markDelivered,
  receivedColumns,
  settleByRecopy,
} from "./factories.js";
import {
  cardGatewayDouble,
  payByCard,
  pickupSite,
  placeOrder,
  type PlacedTestOrder,
} from "./order-factory.js";

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_releve") },
    ],
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

/**
 * Une commande passée au compte par le vrai chemin (`placeOrder`, plan T),
 * puis livrée à l'instant de passation : le relevé suit la livraison (lot ZL),
 * et aucune route ne remet une commande dans le passé (plan T, 2026-10-25).
 */
async function placeOnAccount(
  buyer: Client,
  options: { readonly units?: number; readonly placedAt?: Date } = {},
): Promise<PlacedTestOrder> {
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.userId,
    companyId: buyer.companyId,
    settlement: "account",
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001", quantity: options.units ?? 10 }],
    ...(options.placedAt === undefined ? {} : { placedAt: options.placedAt }),
  });
  await markDelivered(ctx.prisma, order.id, options.placedAt ?? new Date());
  return order;
}

/** Ce que la passation a écrit, relu — jamais recopié. */
async function amountsOf(orderId: string): Promise<{
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
}> {
  return ctx.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { subtotalCents: true, vatCents: true, totalCents: true },
  });
}

interface LegacyOrderSeed {
  readonly subtotalCents: number;
  readonly vatCents: number;
  readonly totalCents: number;
  readonly vatShares?: readonly { rate: number; amountCents: number }[];
  readonly deliveryFeeCents?: number;
  readonly discountCents?: number;
}

/**
 * ⚠️ **Écriture brute gardée (plan T, 2026-10-25)** : une commande que la
 * passation ne produit pas — ventilée sur deux taux (le semis du catalogue
 * est tout à 5,5 %), avec remise ET frais de port sur une commande pro, ou
 * sans ventilation (`vat_shares` nul : bons d'avant la ventilation), ou d'un
 * total nul. Ce qui est éprouvé est la LECTURE de ces formes réelles en base.
 */
async function seedLegacyOrder(buyer: Client, seed: LegacyOrderSeed): Promise<string> {
  seq += 1;
  const orderNumber = `ORD-${String(900_000 + seq)}`;
  const createdAt = new Date();
  const created = await ctx.prisma.order.create({
    data: {
      orderNumber,
      companyId: buyer.companyId,
      placedByUserId: buyer.userId,
      subtotalCents: seed.subtotalCents,
      discountCents: seed.discountCents ?? 0,
      deliveryFeeCents: seed.deliveryFeeCents ?? 0,
      vatCents: seed.vatCents,
      totalCents: seed.totalCents,
      status: "placed",
      paymentStatus: "not_required",
      ...(seed.vatShares === undefined ? {} : { vatShares: [...seed.vatShares] }),
      createdAt,
      ...receivedColumns(createdAt),
    },
  });
  await settleByRecopy(ctx.prisma, created.id);
  return orderNumber;
}

interface Client {
  readonly companyId: string;
  readonly userId: string;
}

/** Une société au compte mensuel, et son détenteur — qui seul y passe commande. */
async function client(name: string): Promise<Client> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: `releve-${String(seq)}` });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
  return { companyId: company.id, userId: user.id };
}

async function statement(companyId: string, query = ""): Promise<CycleStatementView> {
  return jsonBody<CycleStatementView>(
    await staff().get(`${BASE}/companies/${companyId}${query}`).expect(200),
  );
}

/** Toutes les commandes du relevé, groupe après groupe. */
function ordersOf(view: CycleStatementView): readonly CycleStatementOrderView[] {
  return view.groups.flatMap((group) => group.orders);
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

    const kept = await seedLegacyOrder(port, {
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
    const cancelled = await placeOnAccount(port);
    // Une annulation datée n'est pas le sujet : seul le statut écarte le bon
    // de l'assiette (plan T, 2026-10-25 — `order.update` de simulation admis).
    await ctx.prisma.order.update({ where: { id: cancelled.id }, data: { status: "cancelled" } });
    const byCard = await placeOrder(ctx, {
      buyerUserId: port.userId,
      companyId: port.companyId,
      settlement: "card",
      fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    });
    await payByCard(ctx, byCard);
    await markDelivered(ctx.prisma, byCard.id, new Date());
    await seedLegacyOrder(port, { subtotalCents: 0, vatCents: 0, totalCents: 0 });
    await placeOnAccount(other);

    const view = await statement(port.companyId);

    expect(ordersOf(view).map((order) => order.orderNumber)).toEqual([kept]);
    expect(view.provisional).toBe(true);
    expect(view.cycle.inProgress).toBe(true);
    expect(view.scope).toContain("Hors commandes payées par carte");
    expect(ordersOf(view)[0]).toMatchObject({ htCents: 9_500, deliveryFeeCents: 1_500 });
  });

  it("porte la TVA d'une commande sans ventilation en « non ventilée », et retombe sur Σ vat_cents", async () => {
    const port = await client("Boulangerie du Port");
    const placed = await amountsOf((await placeOnAccount(port)).id);
    await seedLegacyOrder(port, { subtotalCents: 4_000, vatCents: 220, totalCents: 4_220 });

    const { totals } = await statement(port.companyId);

    expect(totals.vatByRate).toEqual([{ rate: 5.5, amountCents: placed.vatCents }]);
    expect(totals.unventilatedVatCents).toBe(220);
    expect(totals.vatCents).toBe(placed.vatCents + 220);
    expect(totals.totalCents).toBe(placed.totalCents + 4_220);
  });

  it("lit une période passée à part de la période en cours", async () => {
    const port = await client("Boulangerie du Port");
    const past = new Date(daysAgo(40));
    // Aucune entité semée : le rythme par défaut, mensuel au 1er (R5).
    const pastClosesAt = StatementMonth.containing(past).cycle().closesAt.toISOString();
    const old = await placeOnAccount(port, { placedAt: past });

    const view = await statement(port.companyId, `?periodClosesAt=${pastClosesAt}`);
    expect(view.cycle).toMatchObject({ periodClosesAt: pastClosesAt, inProgress: false });
    expect(ordersOf(view).map((order) => order.orderNumber)).toEqual([old.orderNumber]);
    expect(ordersOf(await statement(port.companyId))).toEqual([]);
  });

  it("rend un relevé vide, à zéro, pour un cycle sans commande", async () => {
    const port = await client("Boulangerie du Port");
    const view = await statement(port.companyId);
    expect(ordersOf(view)).toEqual([]);
    expect(view.totals).toMatchObject({ orderCount: 0, vatCents: 0, totalCents: 0 });
  });

  it("refuse une société inconnue (404), une clôture mal formée ou qui n'en est pas une (400)", async () => {
    await staff().get(`${BASE}/companies/absente`).expect(404);
    const port = await client("Boulangerie du Port");
    await staff().get(`${BASE}/companies/${port.companyId}?periodClosesAt=2026-13`).expect(400);
    const notAClosure = new Date(daysAgo(40)).toISOString();
    await staff()
      .get(`${BASE}/companies/${port.companyId}?periodClosesAt=${notAClosure}`)
      .expect(400);
  });
});

describe("les cycles proposés", () => {
  it("rend la période en cours d'abord, puis celles closes après la mise en service, sans trou", async () => {
    const { cycles } = jsonBody<StatementCyclesView>(
      await staff().get(`${BASE}/cycles`).expect(200),
    );
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles.length).toBeLessThanOrEqual(12);
    expect(cycles[0]?.inProgress).toBe(true);
    expect(cycles[0]?.periodLabel).toMatch(/^du /u);
    for (let rank = 1; rank < cycles.length; rank += 1) {
      expect(cycles[rank]?.periodClosesAt).toBe(cycles[rank - 1]?.periodStartsAt);
    }
    expect(cycles.filter((cycle) => cycle.inProgress)).toHaveLength(1);
  });
});

describe("l'export CSV", () => {
  it("rend une ligne par commande, sous un en-tête qui dit le périmètre, nommé PROVISOIRE", async () => {
    const port = await client("Boulangerie du Port");
    const { orderNumber: number } = await placeOnAccount(port);

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
