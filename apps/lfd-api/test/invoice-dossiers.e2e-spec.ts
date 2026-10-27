/**
 * E2E du **dossier de facturation simulé** (plan
 * `documentation/comptabilite/facturation/simulateur-dossier-de-facturation.md`).
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
 * - le mur staff : sans `b2b_accounting:read`, rien ne se lit ;
 * - l'historique (DF3) : le retrait et la livraison répondent par leurs
 *   canaux, sur leurs propres tables, et le bon jamais retiré est signalé ;
 *   le lieu se lit dans les snapshots figés.
 *
 * Les commandes passent par le vrai chemin (`placeOrder`, plan T), passées
 * trois jours avant leur jour demandé, relatif à maintenant ; lignes et
 * montants sont relus sur la commande passée. Seul le bon à surtaxe figée
 * reste écrit par Prisma (justifié sur `seedLateFeeOrder`).
 * Les faits de retrait et de tournée sont écrits par Prisma aussi : les
 * scènes du livreur sèment leurs propres commandes, hors du périmètre du
 * dossier (comptes au paiement par carte) — même dette.
 */
import {
  addDays,
  instantToLocal,
  type CycleStatementView,
  type InvoiceDossierView,
} from "@lfd/contracts";

import { PaymentGateway } from "../src/b2b/payments/domain/payment-gateway.js";
import { AdminTokenVerifier } from "../src/platform/auth/admin-token.verifier.js";
import { CustomerRole } from "../src/platform/database/client/client.js";
import { bootstrapE2e, daysAgo, jsonBody, type E2eContext } from "./e2e-harness.js";
import { attachTo, createCompany, createUser, markDelivered, settleByRecopy } from "./factories.js";
import {
  cardGatewayDouble,
  payByCard,
  pickupSite,
  placeOrder,
  type PlacedTestOrder,
} from "./order-factory.js";
import { LATEST_DELIVERY_FULFILLMENT } from "./delivery-deadline-fixture.js";

const stubAdminVerifier = {
  verify: (subject: string): Promise<{ subject: string; scopes: string[] }> =>
    Promise.resolve({ subject, scopes: [] }),
};

let ctx: E2eContext;

beforeAll(async () => {
  ctx = await bootstrapE2e({
    overrides: [
      { token: AdminTokenVerifier, value: stubAdminVerifier },
      { token: PaymentGateway, value: cardGatewayDouble("pi_dossier") },
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

const BASE = "/admin/accounting/invoice-dossiers";

/** Le jour local d'aujourd'hui, et un jour sûrement d'un autre mois. */
const TODAY = instantToLocal(new Date(daysAgo(0))).day;
const OTHER_MONTH_DAY = instantToLocal(new Date(daysAgo(-40))).day;

let seq = 0;

interface Client {
  readonly companyId: string;
  readonly userId: string;
}

interface OrderSeed {
  readonly quantity: number;
  /** Le jour demandé ; aujourd'hui par défaut. */
  readonly requestedDay?: string;
  readonly settlement?: "account" | "card";
  /** Le jour de livraison (lot ZL) : aujourd'hui par défaut ; `null`, jamais remis. */
  readonly receivedOn?: string | null;
}

/** Trois jours avant le jour demandé : l'heure limite est loin. */
const LEAD_DAYS = 3;

/**
 * Un bon passé par le vrai chemin (`placeOrder`, plan T) : des croissants
 * retirés au point semé, au compte par défaut, passés trois jours avant le
 * jour demandé (maintenant s'il est à venir). Livré ce jour-là à 10 h UTC — aucune route ne remet une
 * commande dans le passé, le retrait est posé (plan T, 2026-10-25).
 */
async function seedOrder(buyer: Client, seed: OrderSeed): Promise<PlacedTestOrder> {
  const day = seed.requestedDay ?? TODAY;
  const order = await placeOrder(ctx, {
    buyerUserId: buyer.userId,
    companyId: buyer.companyId,
    settlement: seed.settlement ?? "account",
    // Un jour à venir se commande maintenant : on ne passe pas dans le futur.
    ...(day > TODAY ? {} : { placedAt: new Date(`${addDays(day, -LEAD_DAYS)}T08:00:00.000Z`) }),
    forDay: day,
    fulfillment: { method: "pickup", pickupSiteId: await pickupSite(ctx.prisma) },
    lines: [{ sku: "VIE-001", quantity: seed.quantity }],
  });
  if (seed.settlement === "card") {
    await payByCard(ctx, order);
  }
  const delivered = seed.receivedOn === undefined ? TODAY : seed.receivedOn;
  if (delivered !== null) {
    await markDelivered(ctx.prisma, order.id, new Date(`${delivered}T10:00:00.000Z`));
  }
  return order;
}

/** La ligne que la passation a figée, relue — jamais recopiée. */
async function lineOf(order: PlacedTestOrder) {
  return ctx.prisma.orderLine.findFirstOrThrow({
    where: { orderId: order.id },
    select: {
      sku: true,
      productNameSnapshot: true,
      unitPriceMillicents: true,
      lineTotalCents: true,
    },
  });
}

/**
 * ⚠️ **Écriture brute gardée (plan T, 2026-10-25)** : un bon portant une
 * surtaxe de retard dans la forme figée du JSON — avec son taux, ou SANS (la
 * forme d'avant que le taux y soit figé, que la passation n'écrit plus).
 * C'est la LECTURE de ce JSON réel qui est éprouvée.
 */
async function seedLateFeeOrder(
  buyer: Client,
  quantity: number,
  lateFee: { readonly cents: number; readonly vatRatePercent: number | null },
): Promise<string> {
  seq += 1;
  const orderNumber = `ORD-${String(900_000 + seq)}`;
  const goods = quantity * 100;
  const lateVat =
    lateFee.vatRatePercent === null
      ? 0
      : Math.round((lateFee.cents * lateFee.vatRatePercent) / 100);
  const goodsVat = Math.round(goods * 0.055);
  const created = await ctx.prisma.order.create({
    data: {
      orderNumber,
      companyId: buyer.companyId,
      placedByUserId: buyer.userId,
      subtotalCents: goods,
      lateFeeCents: lateFee.cents,
      lateFeeAdjustment:
        lateFee.vatRatePercent === null
          ? { adjustment: { mode: "amount", cents: lateFee.cents } }
          : {
              adjustment: { mode: "amount", cents: lateFee.cents },
              vatRatePercent: lateFee.vatRatePercent,
            },
      vatCents: goodsVat + lateVat,
      vatShares: [{ rate: 5.5, amountCents: goodsVat + lateVat }],
      totalCents: goods + lateFee.cents + goodsVat + lateVat,
      status: "placed",
      paymentStatus: "not_required",
      requestedDeliveryDate: new Date(`${TODAY}T00:00:00.000Z`),
      fulfillment: LATEST_DELIVERY_FULFILLMENT,
      handedOverAt: new Date(`${TODAY}T10:00:00.000Z`),
      receivedOn: new Date(`${TODAY}T00:00:00.000Z`),
      lines: {
        create: [
          {
            sku: "BAG-001",
            productNameSnapshot: "Baguette",
            unitPriceMillicents: 100_000,
            vatRate: "5.50",
            quantity,
            lineTotalCents: goods,
          },
        ],
      },
    },
  });
  await settleByRecopy(ctx.prisma, created.id);
  return orderNumber;
}

/**
 * Un bon sans jour demandé : la passation en exige un depuis longtemps, mais
 * les bons d'avant restent en base et le dossier les signale. La commande est
 * vraie ; seule sa date est effacée après coup (plan T, 2026-10-25).
 */
async function withoutDate(order: PlacedTestOrder): Promise<void> {
  await ctx.prisma.order.update({
    where: { id: order.id },
    data: { requestedDeliveryDate: null },
  });
}

/** Une société au compte mensuel, et son détenteur. */
async function client(name: string): Promise<Client> {
  seq += 1;
  const company = await createCompany(ctx.prisma, { raisonSociale: name });
  await ctx.prisma.company.update({
    where: { id: company.id },
    data: { grantedTerms: ["monthly"] },
  });
  const user = await createUser(ctx.prisma, { auth0Sub: `dossier-${String(seq)}` });
  await attachTo(ctx.prisma, user.id, company.id, CustomerRole.owner);
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
    const kept = await seedOrder(port, { quantity: 3 });
    const cancelled = await seedOrder(port, { quantity: 1 });
    // Seul le statut écarte le bon : posé après coup (plan T, 2026-10-25).
    await ctx.prisma.order.update({ where: { id: cancelled.id }, data: { status: "cancelled" } });
    await seedOrder(port, { quantity: 1, settlement: "card" });
    await seedOrder(other, { quantity: 5 });
    const line = await lineOf(kept);

    const view = await dossier(port.companyId);
    const statement = jsonBody<CycleStatementView>(
      await staff().get(`/admin/accounting/statements/companies/${port.companyId}`).expect(200),
    );

    expect(view.orders.map((order) => order.reference)).toEqual([kept.orderNumber]);
    expect(view.ordersTotalCents).toBe(statement.totals.totalCents);
    expect(view.invoice.lines).toEqual([
      expect.objectContaining({
        sku: line.sku,
        vatRate: 5.5,
        quantity: 3,
        amountCents: line.lineTotalCents,
      }),
    ]);
    expect(view.orders[0]?.requestedDeliveryDate).toBe(TODAY);
    expect(view.differenceCents).toBe(view.gaps.totalCents);
    expect(view.threeGapInvariantHolds).toBe(true);
  });

  it("signale un bon livré hors de la période et un bon sans date, sans les retirer", async () => {
    const port = await client("Boulangerie du Port");
    await seedOrder(port, { quantity: 1 });
    const later = (
      await seedOrder(port, { quantity: 1, requestedDay: OTHER_MONTH_DAY, receivedOn: TODAY })
    ).orderNumber;
    const undatedOrder = await seedOrder(port, { quantity: 1 });
    await withoutDate(undatedOrder);
    const undated = undatedOrder.orderNumber;

    const view = await dossier(port.companyId);

    expect(view.orders).toHaveLength(3);
    expect(view.outsidePeriodOrders).toEqual([
      { reference: later, requestedDeliveryDate: OTHER_MONTH_DAY },
    ]);
    expect(view.ordersWithoutDate).toEqual([undated]);
  });

  it("lit le taux de la surtaxe dans le JSON figé, et refuse (409) un bon qui ne l'a pas", async () => {
    const port = await client("Boulangerie du Port");
    await seedLateFeeOrder(port, 2, { cents: 150, vatRatePercent: 5.5 });
    expect((await dossier(port.companyId)).invoice.lateFeeCents).toBe(150);

    const broken = await seedLateFeeOrder(port, 1, { cents: 100, vatRatePercent: null });
    const response = await staff().get(`${BASE}/companies/${port.companyId}`).expect(409);
    expect(JSON.stringify(response.body)).toContain(broken);
  });

  it("refuse une société inconnue (404) et une clôture mal formée (400)", async () => {
    await staff().get(`${BASE}/companies/absente`).expect(404);
    const port = await client("Boulangerie du Port");
    await staff().get(`${BASE}/companies/${port.companyId}?periodClosesAt=2026-13`).expect(400);
  });
});

async function orderIdOf(orderNumber: string): Promise<string> {
  return (await ctx.prisma.order.findUniqueOrThrow({ where: { orderNumber } })).id;
}

/** Un arrêt d'une tournée du jour, partie à `now`, clos. */
async function deliveredStop(orderId: string, now: Date): Promise<void> {
  seq += 1;
  const vehicleId = `veh-dos-${String(seq)}`;
  await ctx.prisma.deliveryVehicle.create({
    data: {
      id: vehicleId,
      name: "Trafic",
      plate: `DS-${String(seq)}`,
      createdAt: now,
      updatedAt: now,
    },
  });
  const roundId = `round-dos-${String(seq)}`;
  await ctx.prisma.deliveryRound.create({
    data: {
      id: roundId,
      serviceDay: TODAY,
      vehicleId,
      vehicleName: "Trafic",
      passage: 1,
      version: 1,
      departedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  await ctx.prisma.deliveryRoundStop.create({
    data: {
      id: `stop-dos-${String(seq)}`,
      roundId,
      orderId,
      serviceDay: TODAY,
      position: 1,
      closedAt: now,
      createdAt: now,
    },
  });
}

describe("l'historique et le lieu de chaque bon (DF3)", () => {
  it("retiré au comptoir, livré à la porte, jamais retiré : la frise, le lieu, et le signalement", async () => {
    const port = await client("Boulangerie du Port");
    const counter = (await seedOrder(port, { quantity: 1 })).orderNumber;
    const delivered = (await seedOrder(port, { quantity: 2 })).orderNumber;
    const never = (await seedOrder(port, { quantity: 3, receivedOn: null })).orderNumber;
    const handedOverAt = new Date(daysAgo(0));
    await ctx.prisma.orderHandover.create({
      data: {
        orderId: await orderIdOf(counter),
        reference: counter,
        handedOverAt,
        handedOverBy: "staff-e2e",
        handedOverVia: "scan",
      },
    });
    const deliveredId = await orderIdOf(delivered);
    // La tournée part une heure avant la remise.
    await deliveredStop(deliveredId, new Date(handedOverAt.getTime() - 60 * 60 * 1000));
    await ctx.prisma.orderHandover.create({
      data: {
        orderId: deliveredId,
        reference: delivered,
        handedOverAt,
        handedOverBy: "staff-e2e",
        handedOverVia: "manual",
      },
    });
    await ctx.prisma.orderHandoverProof.create({
      data: {
        orderId: deliveredId,
        receiverName: "Jeanne",
        photoKey: "proofs/photo.jpg",
        recordedBy: "staff-e2e",
        recordedAt: handedOverAt,
      },
    });

    const view = await dossier(port.companyId);

    // Lot ZL : un bon jamais remis n'est plus dans l'assiette — ni dans le
    // dossier, ni dans la facture. Il attendra dans les « Bons à constater »
    // une fois son jour passé (`invoice-delivery-month.e2e-spec.ts`).
    expect(view.neverHandedOver).toEqual([]);
    expect(view.orders.map((order) => order.reference)).not.toContain(never);
    const [first, second] = view.orders;
    expect(first?.place).toEqual({
      method: "pickup",
      label: "Labo",
      address: "5 rue du Four, 75002 Paris",
    });
    expect(first?.history).toEqual([
      { kind: "handed_over", at: handedOverAt.toISOString(), serviceDay: null, via: "scan" },
    ]);
    expect(second?.history.map((event) => [event.kind, event.serviceDay])).toEqual([
      ["departed", TODAY],
      ["handed_over_at_door", null],
    ]);
    expect(second?.actualDeliveryDay).toBe(TODAY);

    const orders = await staff().get(`${BASE}/companies/${port.companyId}/orders.csv`).expect(200);
    expect(orders.text).not.toContain(never);
    expect(orders.text).toContain('"Retrait — Labo, 5 rue du Four, 75002 Paris"');
    expect(orders.text).toContain(`remis à la porte ${handedOverAt.toISOString()} (saisie)"`);
  });
});

describe("les CSV du dossier", () => {
  it("rend la facture, les bons et les écarts, un fichier chacun", async () => {
    const port = await client("Boulangerie du Port");
    const placed = await seedOrder(port, { quantity: 2 });
    await withoutDate(placed);
    const number = placed.orderNumber;
    const line = await lineOf(placed);
    const unitEuros = (line.unitPriceMillicents / 100_000).toFixed(5).replace(".", ",");
    const amountEuros = (line.lineTotalCents / 100).toFixed(2).replace(".", ",");

    const invoice = await staff()
      .get(`${BASE}/companies/${port.companyId}/invoice.csv`)
      .expect(200);
    expect(invoice.headers["content-type"]).toContain("text/csv");
    expect(invoice.headers["content-disposition"]).toContain("DOSSIER-FACTURE-SIMULEE");
    expect(invoice.text).toContain(
      `"${line.sku}";"${line.productNameSnapshot}";"${unitEuros}";"5,5 %";2;${amountEuros}`,
    );

    const orders = await staff().get(`${BASE}/companies/${port.companyId}/orders.csv`).expect(200);
    expect(orders.text).toContain(`"${number}"`);
    expect(orders.text).toContain('"sans date demandée"');

    const gaps = await staff().get(`${BASE}/companies/${port.companyId}/gaps.csv`).expect(200);
    expect(gaps.headers["content-disposition"]).toContain("DOSSIER-ECARTS");
    expect(gaps.text).toContain('"TVA non ventilée"');
    expect(gaps.text).not.toContain('"Arrondi des lignes"');
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
