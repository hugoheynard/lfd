import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import type { DecidedDeparture } from "../../../../orders/domain/ports/shortfall-decision.reader.js";
import {
  InMemoryDeliveryNotes,
  InMemoryOrderProgress,
  InMemoryRemainderDecisions,
} from "../../__tests__/delivery-note-doubles.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import {
  DecisionNoteNotFollowedError,
  DeliveryNoteNotPlannedError,
} from "../../../domain/errors/delivery-note-errors.js";
import { RemainderDecisionFollower } from "../remainder-decision-follower.js";

// Instants et jours comparés entre eux, jamais à l'horloge.
const PLANNED_AT = new Date(1_000);
const HANDED_OVER_AT = new Date(3_000);
const ORDER_DAY = "2030-01-10";
const REMAINDER_DAY = "2030-01-11";

/** Un croissant à 1,00 € HT, 5,5 %, remisable. */
function croissants(quantity: number) {
  return {
    sku: "CRO",
    productName: "Croissant",
    unitPriceMillicents: 100_000,
    vatRate: 5.5,
    quantity,
    lineTotalCents: quantity * 100,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pickupDiscountEligible: true,
  };
}

/** Les montants d'un panier de croissants : 10 % de remise, port fixe de 8,00 € à 20 %. */
function terms(quantity: number, deliveryFeeCents: number) {
  const subtotalCents = quantity * 100;
  const discountCents = subtotalCents / 10;
  const goodsVat = Math.round((subtotalCents - discountCents) * 0.055);
  const feeVat = Math.round(deliveryFeeCents * 0.2);
  return {
    subtotalCents,
    discountCents,
    voucherDiscountCents: 0,
    deliveryFeeCents,
    deliveryVatMode: "standard" as const,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    vatShares: [
      { rate: 5.5, amountCents: goodsVat },
      ...(feeVat === 0 ? [] : [{ rate: 20, amountCents: feeVat }]),
    ],
    vatCents: goodsVat + feeVat,
    totalCents: subtotalCents - discountCents + deliveryFeeCents + goodsVat + feeVat,
  };
}

/** 10 croissants commandés ; 6 sont partis au rang 1, le reste de 4 est le rang 2. */
const ORDER: DeliveryNoteOrderProgress = {
  orderId: "ord_1",
  orderNumber: "ORD-7",
  lines: [croissants(10)],
  status: "partially_handed_over",
  confirmedAt: PLANNED_AT,
  readyAt: PLANNED_AT,
  handedOverAt: HANDED_OVER_AT,
  receivedOn: ORDER_DAY,
  terms: terms(10, 800),
};

/** La décision du rang 2 : une pièce au bac sur quatre ; les règles figées de la commande. */
const DECISION: DecidedDeparture = {
  departing: [{ sku: "CRO", quantity: 1 }],
  adjustments: {
    discount: { mode: "percent", bp: 1_000 },
    deliveryFee: { mode: "amount", cents: 800 },
    lateFee: null,
    deliveryVatMode: "standard",
  },
};

async function scene(remainderStatus: "planned" | "prepared" = "planned") {
  const notes = new InMemoryDeliveryNotes();
  const progress = new InMemoryOrderProgress();
  const decisions = new InMemoryRemainderDecisions();
  progress.put(ORDER);
  const first = DeliveryNote.planFromOrder(
    "dn_1",
    { ...ORDER, lines: [croissants(6)], terms: terms(6, 800) },
    PLANNED_AT,
  );
  first.handOver(HANDED_OVER_AT, ORDER_DAY);
  await notes.save(first);
  const remainder = DeliveryNote.planRemainder(
    "dn_2",
    { ...ORDER, orderDay: ORDER_DAY, lines: [croissants(4)], terms: terms(4, 0) },
    2,
    REMAINDER_DAY,
    PLANNED_AT,
  );
  if (remainderStatus === "prepared") {
    remainder.prepare(HANDED_OVER_AT);
  }
  await notes.save(remainder);
  const follower = new RemainderDecisionFollower(progress, notes, decisions);
  return { notes, decisions, follower };
}

function rankOf(notes: InMemoryDeliveryNotes, rank: number) {
  return notes.forOrder("ord_1").find((note) => note.rank === rank);
}

/**
 * Plan E7 reliquat, LB (choix 10 et 15) : le départ décidé d'un reliquat
 * compose les montants de SON BL, sur ses lignes seules — le BL-1, déjà
 * remis avec ses montants, ne bouge pas, et le solde reste la somme des deux.
 */
describe("RemainderDecisionFollower — le BL d'un reliquat suit sa décision (LB)", () => {
  it("réduit le BL-2 à ce qui part et recompose ses montants : remise en %, port à zéro", async () => {
    const { notes, decisions, follower } = await scene();
    const before = rankOf(notes, 1);
    decisions.decided.set("ord_1:2", DECISION);

    await follower.follow("ord_1", 2);

    const remainder = rankOf(notes, 2);
    expect(remainder?.status).toBe("planned");
    expect(remainder?.lines.map((line) => [line.quantity, line.lineTotalCents])).toEqual([
      [1, 100],
    ]);
    // 1,00 € − 10 % = 0,90 € HT, TVA 5,5 % arrondie à 0,05 € ; le port est
    // déjà sur le BL-1, il n'est pas refacturé au reste.
    expect(remainder?.terms).toMatchObject({
      subtotalCents: 100,
      discountCents: 10,
      deliveryFeeCents: 0,
      lateFeeCents: 0,
      vatCents: 5,
      totalCents: 95,
    });
    expect(remainder?.contentVersion).toBe(2);
    expect(rankOf(notes, 1)).toEqual(before);
  });

  it("deux envois, deux montants : le BL-1 garde les siens, la somme est ce que la commande doit", async () => {
    const { notes, decisions, follower } = await scene();
    decisions.decided.set("ord_1:2", DECISION);

    await follower.follow("ord_1", 2);

    const totals = notes.forOrder("ord_1").map((note) => note.terms?.totalCents ?? null);
    // BL-1 : 6,00 € − 10 % + 8,00 € de port, TVA comprise ; BL-2 : 0,95 €.
    expect(totals).toEqual([terms(6, 800).totalCents, 95]);
  });

  it("une remise en montant fixe ne se répète pas sur le reste", async () => {
    const { notes, decisions, follower } = await scene();
    decisions.decided.set("ord_1:2", {
      ...DECISION,
      adjustments: { ...DECISION.adjustments, discount: { mode: "amount", cents: 50 } },
    });

    await follower.follow("ord_1", 2);

    expect(rankOf(notes, 2)?.terms).toMatchObject({ discountCents: 0, totalCents: 106 });
  });

  it("refuse un BL-2 déjà préparé : la décision entière est annulée", async () => {
    const { notes, decisions, follower } = await scene("prepared");
    const before = notes.forOrder("ord_1");
    decisions.decided.set("ord_1:2", DECISION);

    await expect(follower.follow("ord_1", 2)).rejects.toThrow(DeliveryNoteNotPlannedError);
    expect(notes.forOrder("ord_1")).toEqual(before);
  });

  it("refuse un rang sans BL vivant, en le nommant", async () => {
    const { decisions, follower } = await scene();
    decisions.decided.set("ord_1:3", DECISION);

    await expect(follower.follow("ord_1", 3)).rejects.toThrow(DecisionNoteNotFollowedError);
    await expect(follower.follow("ord_1", 3)).rejects.toThrow(/ORD-7 \(reste n° 3\)/);
  });

  it("refuse un BL-2 sans décision de son rang : rien n'est réécrit", async () => {
    const { notes, decisions, follower } = await scene();
    const before = notes.forOrder("ord_1");
    decisions.decided.set("ord_1:1", DECISION);

    await expect(follower.follow("ord_1", 2)).rejects.toThrow(DecisionNoteNotFollowedError);
    expect(notes.forOrder("ord_1")).toEqual(before);
  });
});
