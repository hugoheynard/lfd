/**
 * E2E du **manque par envoi** (plan E7 reliquat, lot LB —
 * `documentation/commandes/plan-e7-reliquat-bati.md`, choix 11 et 15).
 *
 * Ce que seul le vrai Postgres prouve : la table `order_shortfall` clée par
 * `(commande, rang)`, l'unicité de la décision par envoi et sa clé étrangère
 * vers le signal qu'elle résout ; et, par les vrais gestes, qu'un reste en
 * manque se décide pendant que sa commande est prête — sa fiche, son BL et ses
 * montants, jamais ceux du rang 1 —, puis que la commande se solde sur la
 * somme des deux BL.
 *
 * Le reste naît par la fabrique du domaine (`planRemainder`, lot L1), sa
 * feuille par le fait du fournil, ses pièces par l'agrégat de la feuille : les
 * routes du poste ne portent pas encore de rang (L8).
 */
import { DeliveryNote } from "../src/b2b/delivery-notes/domain/entities/delivery-note.js";
import { DeliveryNoteRepository } from "../src/b2b/delivery-notes/domain/ports/delivery-note.repository.js";
import { CommandBus } from "@nestjs/cqrs";
import { OnPackingListDrawn } from "../src/packing/application/handlers/on-packing-list-drawn.handler.js";
import { ClosePackingOrderCommand } from "../src/packing/application/station/close-packing-order.command.js";
import { ReportPackingShortfallCommand } from "../src/packing/application/station/report-packing-shortfall.command.js";
import { PackingSheetRepository } from "../src/packing/domain/ports/packing-sheet.repository.js";
import { UnitOfWork } from "../src/platform/database/unit-of-work.js";
import { PackingListDrawnEvent } from "../src/production/channels/packing/index.js";
import { E2E_STAFF_ID, type E2eContext } from "./e2e-harness.js";
import {
  bootstrapProductionDay,
  closeOrder,
  CROISSANT,
  SERVICE_DAY,
  STAFF,
} from "./production-day-fixture.js";
import { accountOrder, report, type Drawn } from "./shortfall-decision-scene.js";

const REMAINDER_RANK = 2;
/** Le reste : les 2 croissants qui manquaient au rang 1. */
const REMAINDER_PIECES = 2;

let ctx: E2eContext;

beforeAll(async () => {
  ({ ctx } = await bootstrapProductionDay());
});

afterAll(async () => {
  await ctx.close();
});

beforeEach(async () => {
  await ctx.reset();
});

async function decide(orderId: string, rank?: number) {
  const response = await ctx
    .asSub(STAFF)
    .post(`/admin/orders/${orderId}/shortfall-decision`)
    .send(rank === undefined ? { remainder: "abandoned" } : { remainder: "abandoned", rank });
  await ctx.drain();
  const body: unknown = response.body;
  const code = typeof body === "object" && body !== null && "code" in body ? body.code : null;
  return { status: response.status, code };
}

/** Rang 1 : 3 croissants commandés, 1 au bac, le départ décidé, le bac fermé — la commande est prête. */
async function readyWithDecidedFirst(): Promise<Drawn> {
  const order = await accountOrder(ctx, 1);
  expect(await report(ctx, order.id)).toBe(204);
  expect((await decide(order.id)).status).toBe(204);
  expect(await closeOrder(ctx, order.id)).toBe(204);
  await ctx.drain();
  return order;
}

/** Le BL du reste, le MÊME jour, ses montants par la règle d'un reliquat (choix 10 : port à zéro). */
async function planRemainder(order: Drawn): Promise<void> {
  const line = await ctx.prisma.orderLine.findFirstOrThrow({
    where: { orderId: order.id, sku: CROISSANT },
  });
  const unit = Math.round(line.lineTotalCents / line.quantity);
  const subtotal = unit * REMAINDER_PIECES;
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
            quantity: REMAINDER_PIECES,
            saleUnit: "piece" as const,
            lineTotalCents: subtotal,
            unitPriceTtcCents: null,
            lineTotalTtcCents: null,
            pickupDiscountEligible: true,
          },
        ],
      },
      REMAINDER_RANK,
      SERVICE_DAY,
      new Date(),
    ),
  );
  expect(saved).toBe(true);
}

/** La feuille du reste, tirée comme le fournil la tire : son fait, de rang 2. */
async function drawRemainderSheet(order: Drawn): Promise<void> {
  const fact = new PackingListDrawnEvent(SERVICE_DAY, new Date(), {
    orderId: order.id,
    rank: REMAINDER_RANK,
    reference: order.orderNumber,
    customerLabel: "Reste",
    fulfillmentMethod: "pickup",
    dueAt: null,
    clientele: "pro",
    siteId: null,
    lines: [
      { sku: CROISSANT, productName: "Croissant", quantity: REMAINDER_PIECES, saleUnit: "piece" },
    ],
  }).durableFact();
  await ctx.app
    .get(OnPackingListDrawn)
    .handle({ eventId: fact.key, type: fact.type, payload: fact.payload });
}

/** Une pièce du reste au sac, par l'agrégat de la feuille ; puis « Il manque » sur ce rang. */
async function reportRemainderShortfall(order: Drawn): Promise<void> {
  const sheets = ctx.app.get(PackingSheetRepository);
  await ctx.app.get(UnitOfWork).run(async () => {
    const sheet = await sheets.lock(SERVICE_DAY, order.id, REMAINDER_RANK);
    if (sheet === null) {
      throw new RangeError("la feuille du reste n'a pas été tirée");
    }
    const mark = { at: new Date(), by: E2E_STAFF_ID };
    sheet.openContainer({
      id: `bag_rest_${order.id}`,
      nature: "bag",
      bin: null,
      opened: mark,
      voided: null,
      lines: [],
    });
    sheet.allocate(`bag_rest_${order.id}`, CROISSANT, 1, mark);
    await sheets.save(sheet);
  });
  await ctx.app
    .get(CommandBus)
    .execute(
      new ReportPackingShortfallCommand(SERVICE_DAY, order.id, E2E_STAFF_ID, REMAINDER_RANK),
    );
  await ctx.drain();
}

async function remainderScene(): Promise<Drawn> {
  const order = await readyWithDecidedFirst();
  await planRemainder(order);
  await drawRemainderSheet(order);
  await reportRemainderShortfall(order);
  return order;
}

function notesOf(orderId: string) {
  return ctx.prisma.deliveryNote.findMany({
    where: { orderId },
    orderBy: { rank: "asc" },
    include: { lines: true },
  });
}

describe("le manque par envoi (plan E7 reliquat, LB)", () => {
  it("le manque du reste est le sien : une ligne par envoi, le rang 1 décidé n'y gagne rien", async () => {
    const order = await remainderScene();

    const rows = await ctx.prisma.orderShortfall.findMany({
      where: { orderId: order.id },
      orderBy: { rank: "asc" },
    });
    expect(rows.map((row) => [row.rank, row.decidedAt === null, row.lines])).toEqual([
      [1, false, [{ sku: CROISSANT, due: 3, packed: 1 }]],
      [2, true, [{ sku: CROISSANT, due: REMAINDER_PIECES, packed: 1 }]],
    ]);
    // Aucune livraison en échec : la garde rejouable de L4a est tombée.
    expect(await ctx.prisma.outboxDelivery.count({ where: { lastError: { not: null } } })).toBe(0);
  });

  it("se décide pendant que la commande est prête : deux décisions, une par rang", async () => {
    const order = await remainderScene();
    const firstNoteBefore = (await notesOf(order.id))[0];

    expect(await decide(order.id, REMAINDER_RANK)).toMatchObject({ status: 204 });

    const decisions = await ctx.prisma.orderShortfallDecision.findMany({
      where: { orderId: order.id },
      orderBy: { rank: "asc" },
    });
    expect(decisions.map((d) => [d.rank, d.departing])).toEqual([
      [1, [{ sku: CROISSANT, quantity: 1 }]],
      [REMAINDER_RANK, [{ sku: CROISSANT, quantity: 1 }]],
    ]);
    expect((await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      "ready",
    );
    const sheets = await ctx.prisma.packingOrder.findMany({
      where: { orderId: order.id },
      orderBy: { rank: "asc" },
    });
    expect(sheets.map((sheet) => [sheet.rank, sheet.shortfallAuthorizedAt !== null])).toEqual([
      [1, true],
      [REMAINDER_RANK, true],
    ]);
    const [first, remainder] = await notesOf(order.id);
    expect(first).toEqual(firstNoteBefore);
    expect(remainder?.lines.map((line) => line.quantity)).toEqual([1]);
    expect(
      await ctx.prisma.outboxMessage.count({
        where: { key: `order.shortfall_decided:${order.id}:r${String(REMAINDER_RANK)}` },
      }),
    ).toBe(1);
  });

  it("une seconde décision du même reste est refusée, nommée, et l'unicité tient en base", async () => {
    const order = await remainderScene();
    await decide(order.id, REMAINDER_RANK);

    expect(await decide(order.id, REMAINDER_RANK)).toMatchObject({
      status: 409,
      code: "orders.shortfall_decision.already_decided",
    });
    await expect(
      ctx.prisma.orderShortfallDecision.create({
        data: {
          id: "dec_double",
          orderId: order.id,
          rank: REMAINDER_RANK,
          decidedAt: new Date(),
          decidedByStaffId: E2E_STAFF_ID,
          remainder: "abandoned",
          departing: [],
          signalReportedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("une décision sans le manque de son envoi est inexprimable en base", async () => {
    const order = await readyWithDecidedFirst();

    await expect(
      ctx.prisma.orderShortfallDecision.create({
        data: {
          id: "dec_orphan",
          orderId: order.id,
          rank: 3,
          decidedAt: new Date(),
          decidedByStaffId: E2E_STAFF_ID,
          remainder: "abandoned",
          departing: [],
          signalReportedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("le reste décidé, colisé et retiré : la commande se solde sur la somme des deux BL", async () => {
    const order = await remainderScene();
    await decide(order.id, REMAINDER_RANK);
    await ctx.app
      .get(CommandBus)
      .execute(new ClosePackingOrderCommand(SERVICE_DAY, order.id, E2E_STAFF_ID, REMAINDER_RANK));
    await ctx.drain();

    for (const reference of [order.orderNumber, `${order.orderNumber}-${String(REMAINDER_RANK)}`]) {
      await ctx.asSub(STAFF).post(`/admin/handover/manual/${reference}`).send({}).expect(201);
      await ctx.drain();
    }

    const notes = await notesOf(order.id);
    expect(notes.map((note) => [note.rank, note.status])).toEqual([
      [1, "handed_over"],
      [REMAINDER_RANK, "handed_over"],
    ]);
    const row = await ctx.prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe("fulfilled");
    expect(row.billableTotalCents).toBe(
      notes.reduce((total, note) => total + (note.totalCents ?? 0), 0),
    );
    expect(row.billableSubtotalCents).toBe(
      notes.reduce((total, note) => total + (note.subtotalCents ?? 0), 0),
    );
    // Le reste facture la pièce partie, pas les deux prévues.
    expect(notes[1]?.lines.map((line) => line.quantity)).toEqual([1]);
  });

  it("refuse un reste dont le bac est déjà fermé : son BL n'est plus prévu", async () => {
    const order = await remainderScene();
    const repository = ctx.app.get(DeliveryNoteRepository);
    const remainder = (await repository.loadForOrders([order.id])).find(
      (note) => note.rank === REMAINDER_RANK,
    );
    remainder?.prepare(new Date());
    if (remainder !== undefined) {
      await repository.save(remainder);
    }

    expect(await decide(order.id, REMAINDER_RANK)).toMatchObject({
      status: 409,
      code: "orders.shortfall_decision.remainder_not_planned",
    });
    expect(await ctx.prisma.orderShortfallDecision.count({ where: { rank: REMAINDER_RANK } })).toBe(
      0,
    );
  });
});
