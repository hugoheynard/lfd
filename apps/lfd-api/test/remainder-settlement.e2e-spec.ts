/**
 * E2E du **solde dérivé** (plan E7 reliquat, lot L5b —
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 8 et 18).
 *
 * Ce que seul le vrai Postgres prouve : par les vrais gestes — la décision du
 * départ incomplet, le retrait du rang 1 au comptoir, le retrait du reste —,
 * une commande dont un reste attend est « en partie retirée » et ne doit
 * rien ; le dernier retrait la solde sur la SOMME de ses BL — solde, facture
 * au compte, points. Un seul envoi : comme avant.
 *
 * Le reste naît par la fabrique du domaine (`planRemainder`, lot L1) : « à
 * relivrer » est L8, et la transition se prouve avant lui (SÉRIEUX 7). Le
 * bac du reste est fermé par son fait, publié comme le colisage le publie.
 *
 * Une écriture brute, datée (2026-10-26), celle de `loyalty-partial-order` :
 * le passage à `paid`, qu'aucune route ne fait pour une commande au compte.
 */
import { MonthlyInvoicingReader } from "../src/b2b/accounting/domain/ports/monthly-invoicing.reader.js";
import {
  ProcedureOrdersReader,
  type ProcedureOrderRow,
} from "../src/b2b/accounting/domain/ports/procedure-orders.reader.js";
import {
  invoicesStatus,
  procedureOrderStatus,
} from "../src/b2b/accounting/domain/services/collection-procedure-invoices.js";
import { UnconfirmedDeliveriesReader } from "../src/b2b/accounting/domain/ports/unconfirmed-deliveries.reader.js";
import { DeliveryNote } from "../src/b2b/delivery-notes/domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../src/b2b/delivery-notes/domain/ports/delivery-note.repository.js";
import { LoyaltySettings } from "../src/b2b/loyalty/domain/value-objects/loyalty-settings.js";
import { PrismaLoyaltySettingsStore } from "../src/b2b/loyalty/infrastructure/prisma-loyalty-settings.store.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { DurablePublisher } from "../src/platform/outbox/durable-publisher.js";
import { PackingOrderPackedEvent } from "../src/production/channels/commerce/index.js";
import { E2E_STAFF_ID, serviceDay, type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closeOrder,
  CROISSANT,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import {
  accountOrder,
  decide,
  report,
  windowAroundServiceDay,
  type Drawn,
} from "./shortfall-decision-scene.js";
import { TEST_RECOMPUTE_TOKEN } from "./setup-env.js";

/** Le jour du reste : le lendemain du jour servi (`SERVICE_DAY` = J+7). */
const REMAINDER_DAY = serviceDay(8);
/** Un jour après tous ceux de la scène : les bons à constater les voient passés. */
const LATER_DAY = serviceDay(30);

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
  await ctx.app.get(PrismaLoyaltySettingsStore).write(
    LoyaltySettings.of({
      pointsPerStep: 1_000,
      stepValueCents: 500,
      openToPublic: true,
      openToPro: true,
      voucherValidityDays: 365,
      welcomeBonusPoints: null,
    }),
    new Date(),
    E2E_STAFF_ID,
  );
});

/** 3 croissants commandés, 1 au bac : le manque signalé, décidé, le bac fermé. */
async function decidedOrder(): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(ctx, order.id)).status).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  return order;
}

/** Le reste — les 2 croissants manquants —, par la fabrique du domaine, jamais un INSERT. */
async function planRemainder(order: Drawn): Promise<void> {
  const line = await ctx.prisma.orderLine.findFirstOrThrow({
    where: { orderId: order.id, sku: CROISSANT },
  });
  const unit = Math.round(line.lineTotalCents / line.quantity);
  const subtotal = unit * 2;
  const vat = Math.round(subtotal * 0.055);
  const saved = await ctx.app.get(DeliveryNoteRepository).saveNew(
    DeliveryNote.planRemainder(
      `dn_rest_${order.id}`,
      {
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderDay: SERVICE_DAY,
        terms: {
          subtotalCents: subtotal,
          ttcTerms: null,
          discountCents: 0,
          voucherDiscountCents: 0,
          deliveryFeeCents: 0,
          deliveryVatMode: null,
          lateFeeCents: 0,
          lateFeeAdjustment: null,
          vatShares: [{ rate: 5.5, amountCents: vat }],
          vatCents: vat,
          totalCents: subtotal + vat,
        },
        lines: [
          {
            sku: CROISSANT,
            productName: line.productNameSnapshot,
            unitPriceMillicents: line.unitPriceMillicents,
            vatRate: 5.5,
            quantity: 2,
            lineTotalCents: subtotal,
            unitPriceTtcCents: null,
            lineTotalTtcCents: null,
            pickupDiscountEligible: true,
          },
        ],
      },
      2,
      REMAINDER_DAY,
      new Date(),
    ),
  );
  expect(saved).toBe(true);
}

/** Le bac du reste fermé, publié comme le colisage le publie : dans une unité de travail. */
async function packRemainder(order: Drawn): Promise<void> {
  const fact = new PackingOrderPackedEvent(
    order.id,
    2,
    order.orderNumber,
    new Date(),
    E2E_STAFF_ID,
  );
  await ctx.app
    .get(UnitOfWork)
    .run(() => ctx.app.get(DurablePublisher).publish(fact.durableFact()));
  await ctx.drain();
}

/** Le retrait au comptoir, par la saisie du numéro : `ORD-…` au rang 1, `ORD-…-2` au reste. */
async function handOverAtCounter(reference: string): Promise<void> {
  await ctx.asSub(STAFF).post(`/admin/handover/manual/${reference}`).send({}).expect(201);
  await ctx.drain();
}

/** Réglée (écriture brute datée, cf. en-tête), puis le rattrapage des points. */
async function paidAndSwept(orderId: string): Promise<void> {
  await ctx.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "paid" } });
  await ctx
    .http()
    .post("/admin/loyalty/sweep")
    .set("x-lfc-recompute-token", TEST_RECOMPUTE_TOKEN)
    .expect(200);
}

async function pointsOf(orderId: string): Promise<number[]> {
  const rows = await ctx.prisma.loyaltyLedgerEntry.findMany({
    where: { kind: "earned", orderId },
    select: { points: true },
  });
  return rows.map((row) => row.points);
}

function orderRow(orderId: string) {
  return ctx.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
}

async function fulfilledFacts(orderId: string): Promise<number> {
  return ctx.prisma.outboxMessage.count({ where: { key: `order.fulfilled:${orderId}` } });
}

async function invoicingOf(orderId: string) {
  const { from, to } = windowAroundServiceDay();
  const orders = await ctx.app
    .get(MonthlyInvoicingReader, { strict: false })
    .uninvoicedOrders(from, to);
  return orders.find((one) => one.orderId === orderId);
}

/** L'onglet « Factures » d'une procédure qui couvre le jour servi, ce jour passé. */
async function procedureRowOf(orderId: string): Promise<ProcedureOrderRow | undefined> {
  const { from, to } = windowAroundServiceDay();
  const rows = await ctx.app.get(ProcedureOrdersReader, { strict: false }).ofPeriod({
    periodInvoiceIds: [],
    deliveredFrom: from,
    deliveredTo: to,
    servedFrom: SERVICE_DAY,
    servedThrough: SERVICE_DAY,
    servedBefore: LATER_DAY,
  });
  return rows.find((row) => row.orderId === orderId);
}

describe("le solde dérivé (plan E7 reliquat, L5b)", () => {
  it("rang 1 retiré, reste prévu : « en partie retirée », rien de facturable, ni fait du solde ni points", async () => {
    const order = await decidedOrder();
    await planRemainder(order);

    await handOverAtCounter(order.orderNumber);
    // La facture au compte lit le bon AVANT le règlement brut, qui le sort de l'assiette.
    const invoicing = await invoicingOf(order.id);
    const unconfirmed = await ctx.app
      .get(UnconfirmedDeliveriesReader, { strict: false })
      .servedBefore(LATER_DAY);
    await paidAndSwept(order.id);

    const row = await orderRow(order.id);
    expect(row).toMatchObject({ status: "partially_handed_over", billableTotalCents: null });
    expect(row.handedOverAt).not.toBeNull();
    expect(row.receivedOn).not.toBeNull();
    expect(row.settledOn).toBeNull();
    expect(await fulfilledFacts(order.id)).toBe(0);
    expect(await pointsOf(order.id)).toEqual([]);
    expect(invoicing?.settlement).toBe("awaiting_remainder");
    // Choix 18 : la comptabilité voit le jour prévu du reste.
    expect(unconfirmed.find((one) => one.orderId === order.id)).toMatchObject({
      awaitingRemainder: true,
      remainderPlannedOn: REMAINDER_DAY,
    });
  });

  it("le reste retiré solde la commande : solde, facture au compte et points sur la somme des BL", async () => {
    const order = await decidedOrder();
    await planRemainder(order);
    await handOverAtCounter(order.orderNumber);
    await packRemainder(order);

    await handOverAtCounter(`${order.orderNumber}-2`);
    const invoiced = await invoicingOf(order.id);
    await paidAndSwept(order.id);

    const notes = await ctx.prisma.deliveryNote.findMany({
      where: { orderId: order.id },
      orderBy: { rank: "asc" },
    });
    expect(notes.map((note) => [note.rank, note.status])).toEqual([
      [1, "handed_over"],
      [2, "handed_over"],
    ]);
    const sum = (pick: (note: (typeof notes)[number]) => number): number =>
      notes.reduce((total, note) => total + pick(note), 0);
    const row = await orderRow(order.id);
    expect(row.status).toBe("fulfilled");
    expect(row.billableTotalCents).toBe(sum((note) => note.totalCents ?? 0));
    expect(row.billableSubtotalCents).toBe(sum((note) => note.subtotalCents ?? 0));
    expect(row.settledOn?.toISOString().slice(0, 10)).toBe(
      notes[1]?.receivedOn?.toISOString().slice(0, 10),
    );
    expect(await fulfilledFacts(order.id)).toBe(1);
    expect(invoiced?.settlement).toBeUndefined();
    expect(invoiced?.frozen.totalCents).toBe(row.billableTotalCents);
    expect(invoiced?.frozen.lines.map((line) => line.quantity)).toEqual([1, 2]);
    expect(invoiced?.deliveryNoteNumbers).toEqual(notes.map((note) => note.number));
    expect(await pointsOf(order.id)).toEqual([
      (row.billableSubtotalCents ?? 0) - (row.billableDiscountCents ?? 0),
    ]);
  });

  it("un seul envoi, reste abandonné : soldée au rang 1 sur son BL, comme avant", async () => {
    const order = await decidedOrder();

    await handOverAtCounter(order.orderNumber);
    const invoiced = await invoicingOf(order.id);
    await paidAndSwept(order.id);

    const [note] = await ctx.prisma.deliveryNote.findMany({ where: { orderId: order.id } });
    const row = await orderRow(order.id);
    expect(row.status).toBe("fulfilled");
    expect(row.billableTotalCents).toBe(note?.totalCents);
    expect(await fulfilledFacts(order.id)).toBe(1);
    expect(invoiced?.frozen.totalCents).toBe(note?.totalCents);
    expect(await pointsOf(order.id)).toEqual([
      (row.billableSubtotalCents ?? 0) - (row.billableDiscountCents ?? 0),
    ]);
  });

  it("un seul envoi complet : la recopie des totaux de la commande, comme avant", async () => {
    const order = await accountOrder(ctx, 3);
    expect(await closeOrder(ctx, order.id)).toBe(204);
    await ctx.drain();

    await handOverAtCounter(order.orderNumber);
    const invoiced = await invoicingOf(order.id);
    await paidAndSwept(order.id);

    const row = await orderRow(order.id);
    expect(row.status).toBe("fulfilled");
    expect(row.billableTotalCents).toBe(row.totalCents);
    expect(invoiced?.frozen.totalCents).toBe(row.totalCents);
    expect(await pointsOf(order.id)).toEqual([row.subtotalCents - row.discountCents]);
  });

  it("le reste retiré AVANT le rang 1 ne solde rien ; le rang 1 solde ensuite sur la somme", async () => {
    const order = await decidedOrder();
    await planRemainder(order);
    await packRemainder(order);

    await handOverAtCounter(`${order.orderNumber}-2`);
    expect((await orderRow(order.id)).billableTotalCents).toBeNull();
    expect(await fulfilledFacts(order.id)).toBe(0);

    await handOverAtCounter(order.orderNumber);

    const notes = await ctx.prisma.deliveryNote.findMany({ where: { orderId: order.id } });
    const row = await orderRow(order.id);
    expect(row.status).toBe("fulfilled");
    expect(row.billableTotalCents).toBe(
      notes.reduce((total, note) => total + (note.totalCents ?? 0), 0),
    );
    expect(await fulfilledFacts(order.id)).toBe(1);
  });

  /**
   * Régression (L5c) : l'onglet « Factures » de la procédure classait une
   * commande en partie retirée « réception confirmée » et la comptait « à
   * facturer », alors qu'elle ne se facture qu'à son solde. L5c l'excluait ;
   * décision de Hugo du 2026-10-26 : elle paraît, « partielle — reste à
   * relivrer », jamais « à facturer ».
   */
  it("l'onglet « Factures » de la procédure la montre « partielle, reste à relivrer », avec le jour du reste", async () => {
    const order = await decidedOrder();
    await planRemainder(order);
    // Témoin : son jour passé, non retirée, elle y est (« réception à confirmer »).
    const before = await procedureRowOf(order.id);
    expect(before).toMatchObject({ partiallyHandedOver: false });

    await handOverAtCounter(order.orderNumber);

    expect((await orderRow(order.id)).status).toBe("partially_handed_over");
    const row = await procedureRowOf(order.id);
    expect(row).toMatchObject({ partiallyHandedOver: true, remainderPlannedOn: REMAINDER_DAY });
    const status = procedureOrderStatus({
      invoiced: row?.invoice !== null,
      handedOver: row?.handedOver ?? false,
      receivedOn: row?.receivedOn ?? null,
      awaitingRemainder: row?.partiallyHandedOver ?? false,
    });
    expect(status).toBe("awaiting_remainder");
    // Régression (2026-10-26) : seule, elle laissait l'onglet à « fait / tout
    // facturé ». Décision de Hugo : l'onglet est « partiel ».
    expect(invoicesStatus({ reached: true, open: true, statuses: [status] })).toEqual({
      state: "partial",
      reason: "awaiting_remainders",
    });
  });
});
