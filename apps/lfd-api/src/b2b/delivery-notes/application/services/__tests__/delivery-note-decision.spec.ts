import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { BillableAmounts } from "../../../../orders/domain/entities/billable-amounts.js";
import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { ReconcileDeliveryNotesHandler } from "../../commands/reconcile-delivery-notes.handler.js";
import {
  FixedConfirmedOrders,
  FixedEngagements,
  InMemoryDeliveryNotes,
  InMemoryOrderBillings,
  InMemoryOrderProgress,
  InMemoryShortfallDecisions,
  billingCloserOf,
} from "../../__tests__/delivery-note-doubles.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import { DecisionOutsideOrderError } from "../../../domain/errors/delivery-note-errors.js";
import { DeliveryNoteAligner } from "../delivery-note-aligner.js";
import { DeliveryNoteFollower } from "../delivery-note-follower.js";
import { DeliveryNotePlanner } from "../delivery-note-planner.js";

// Instants et jours comparés entre eux, jamais à l'horloge.
const CONFIRMED_AT = new Date(1_000);
const READY_AT = new Date(2_000);
const HANDED_OVER_AT = new Date(3_000);
const NOW = new Date(9_000);
const RECEIVED_ON = "2030-01-10";

/** 10 croissants à 1,00 € HT, 5,5 % ; frais de livraison fixes de 8,00 €. */
const LINE = {
  sku: "CRO",
  productName: "Croissant",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 10,
  lineTotalCents: 1_000,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};
const ORDER_AMOUNTS: BillableAmounts = {
  subtotalCents: 1_000,
  discountCents: 0,
  voucherDiscountCents: 0,
  deliveryFeeCents: 800,
  lateFeeCents: 0,
  vatCents: 55 + 160,
  vatShares: [
    { rate: 5.5, amountCents: 55 },
    { rate: 20, amountCents: 160 },
  ],
  totalCents: 2_015,
};

function order(overrides: Partial<DeliveryNoteOrderProgress> = {}): DeliveryNoteOrderProgress {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-7",
    lines: [LINE],
    status: "confirmed",
    confirmedAt: CONFIRMED_AT,
    readyAt: null,
    handedOverAt: null,
    receivedOn: null,
    terms: {
      subtotalCents: 1_000,
      discountCents: 0,
      voucherDiscountCents: 0,
      deliveryFeeCents: 800,
      deliveryVatMode: "standard",
      lateFeeCents: 0,
      lateFeeAdjustment: null,
      vatShares: [
        { rate: 5.5, amountCents: 55 },
        { rate: 20, amountCents: 160 },
      ],
      vatCents: 215,
      totalCents: 2_015,
    },
    ...overrides,
  };
}

const DECISION = {
  departing: [{ sku: "CRO", quantity: 6 }],
  adjustments: {
    discount: null,
    deliveryFee: { mode: "amount", cents: 800 },
    lateFee: null,
    deliveryVatMode: "standard",
  },
} as const;

function scene() {
  const notes = new InMemoryDeliveryNotes();
  const progress = new InMemoryOrderProgress();
  const decisions = new InMemoryShortfallDecisions();
  const billings = new InMemoryOrderBillings();
  const engagements = new FixedEngagements();
  const ids = new FixedIdGenerator("dn");
  const clock = new FixedClock(NOW);
  const closer = billingCloserOf(notes, billings, engagements);
  const aligner = new DeliveryNoteAligner(notes, ids, decisions);
  const follower = new DeliveryNoteFollower(
    new DeliveryNotePlanner(new FixedConfirmedOrders(), notes, ids, clock, decisions),
    progress,
    aligner,
    clock,
    closer,
  );
  const reconciler = new ReconcileDeliveryNotesHandler(
    progress.scan,
    notes,
    aligner,
    new DirectUnitOfWork(),
    clock,
    decisions,
    closer,
  );
  return { notes, progress, decisions, billings, engagements, follower, reconciler };
}

function billingFor(status: "confirmed" | "fulfilled", partial: boolean) {
  return {
    orderId: "ord_1",
    reference: "ORD-7",
    status,
    partial,
    receivedOn: status === "fulfilled" ? RECEIVED_ON : null,
    orderAmounts: ORDER_AMOUNTS,
    billable: null,
    settledOn: null,
  };
}

/** Le BL-1 prévu à l'arrêt, imprimé au colisage. */
async function plannedAndPrinted(notes: InMemoryDeliveryNotes): Promise<void> {
  const note = DeliveryNote.planFromOrder("dn_1", order(), CONFIRMED_AT);
  note.recordPrint(CONFIRMED_AT, "staff_pack");
  await notes.save(note);
}

describe("Le BL d'une commande décidée (E6b, plan E6 § 13)", () => {
  it("la décision réécrit le BL prévu sur ce qui part, montants recomposés, et le papier est à réimprimer", async () => {
    const { notes, progress, decisions, follower } = scene();
    progress.put(order());
    await plannedAndPrinted(notes);
    decisions.decided.set("ord_1", DECISION);

    await follower.followDecision("ord_1");

    const [note] = notes.forOrder("ord_1");
    expect(note?.status).toBe("planned");
    expect(note?.lines.map((l) => [l.quantity, l.lineTotalCents])).toEqual([[6, 600]]);
    // 6,00 € à 5,5 % + 8,00 € de port entiers à 20 %.
    expect(note?.terms).toMatchObject({
      subtotalCents: 600,
      deliveryFeeCents: 800,
      vatCents: 33 + 160,
      totalCents: 1_593,
    });
    expect(note?.contentVersion).toBe(2);
    expect(note?.printed?.version).toBe(1);
  });

  it("une décision que le BL ne peut pas suivre fait ÉCHOUER le geste, sans rien écrire", async () => {
    const { notes, progress, decisions, follower } = scene();
    progress.put(order());
    await plannedAndPrinted(notes);
    const before = notes.forOrder("ord_1");
    decisions.decided.set("ord_1", { ...DECISION, departing: [{ sku: "CRO", quantity: 99 }] });

    await expect(follower.followDecision("ord_1")).rejects.toThrow(DecisionOutsideOrderError);
    expect(notes.forOrder("ord_1")).toEqual(before);
  });

  it("le réconciliateur, lui, compte la même décision impossible sans échouer", async () => {
    const { notes, progress, decisions, reconciler } = scene();
    progress.put(order());
    await plannedAndPrinted(notes);
    decisions.decided.set("ord_1", { ...DECISION, departing: [{ sku: "CRO", quantity: 99 }] });

    const report = await reconciler.execute();

    expect(report.unrepaired).toEqual([
      { orderId: "ord_1", orderNumber: "ORD-7", reason: "invalid_source" },
    ]);
  });

  it("bac fermé puis remise : le BL-1 part partiel, et la commande est soldée sur lui", async () => {
    const { notes, progress, decisions, billings, follower } = scene();
    await plannedAndPrinted(notes);
    decisions.decided.set("ord_1", DECISION);
    progress.put(order({ status: "ready", readyAt: READY_AT }));
    await follower.prepare("ord_1");
    progress.put(
      order({
        status: "fulfilled",
        readyAt: READY_AT,
        handedOverAt: HANDED_OVER_AT,
        receivedOn: RECEIVED_ON,
      }),
    );
    billings.put(billingFor("fulfilled", true));

    await follower.handOver("ord_1");

    expect(notes.forOrder("ord_1")[0]).toMatchObject({
      status: "handed_over",
      terms: { totalCents: 1_593 },
    });
    expect(billings.rows.get("ord_1")).toMatchObject({
      settledOn: RECEIVED_ON,
      billable: { subtotalCents: 600, deliveryFeeCents: 800, totalCents: 1_593 },
    });
  });

  it("le réconciliateur ne réécrit pas un BL décidé sur la commande entière, et n'y compte aucun écart", async () => {
    const { notes, progress, decisions, follower, reconciler } = scene();
    progress.put(order());
    await plannedAndPrinted(notes);
    decisions.decided.set("ord_1", DECISION);
    await follower.followDecision("ord_1");
    const before = notes.forOrder("ord_1");

    const report = await reconciler.execute();

    expect(notes.forOrder("ord_1")).toEqual(before);
    expect(report.terms.gaps).toEqual([]);
  });

  it("sans décision, le chemin normal avec impression ne demande jamais de réimprimer", async () => {
    const { notes, progress, follower } = scene();
    await plannedAndPrinted(notes);
    progress.put(order({ status: "ready", readyAt: READY_AT }));
    await follower.prepare("ord_1");
    progress.put(
      order({
        status: "fulfilled",
        readyAt: READY_AT,
        handedOverAt: HANDED_OVER_AT,
        receivedOn: RECEIVED_ON,
      }),
    );
    await follower.handOver("ord_1");

    expect(notes.forOrder("ord_1")[0]).toMatchObject({ status: "handed_over", contentVersion: 1 });
  });
});

describe("Le solde par le réconciliateur (E6c1)", () => {
  it("pose la recopie sur une commande remise sans décision, puis la contrôle à zéro écart", async () => {
    const { progress, billings, reconciler } = scene();
    progress.put(
      order({
        status: "fulfilled",
        readyAt: READY_AT,
        handedOverAt: HANDED_OVER_AT,
        receivedOn: RECEIVED_ON,
      }),
    );
    billings.put(billingFor("fulfilled", false));

    const first = await reconciler.execute();
    const second = await reconciler.execute();

    expect(first.billing.closed).toBe(1);
    expect(billings.rows.get("ord_1")).toMatchObject({
      billable: ORDER_AMOUNTS,
      settledOn: RECEIVED_ON,
    });
    expect(second.billing).toMatchObject({ closed: 0, corrected: 0, compared: 1, gaps: [] });
  });

  it("corrige des montants faux tant que rien n'est facturé ; les nomme sans y toucher sinon", async () => {
    const { progress, billings, engagements, reconciler } = scene();
    progress.put(
      order({
        status: "fulfilled",
        readyAt: READY_AT,
        handedOverAt: HANDED_OVER_AT,
        receivedOn: RECEIVED_ON,
      }),
    );
    const wrong = {
      ...billingFor("fulfilled", false),
      billable: { ...ORDER_AMOUNTS, totalCents: 1 },
      settledOn: RECEIVED_ON,
    };
    billings.put(wrong);

    expect((await reconciler.execute()).billing.corrected).toBe(1);
    expect(billings.rows.get("ord_1")?.billable).toEqual(ORDER_AMOUNTS);

    billings.put(wrong);
    engagements.invoiced.add("ord_1");
    const report = await reconciler.execute();
    expect(report.billing.corrected).toBe(0);
    expect(report.billing.gaps).toEqual([
      { orderId: "ord_1", orderNumber: "ORD-7", fields: ["totalCents"], engaged: true },
    ]);
  });

  it("ne solde pas une commande annulée", async () => {
    const { progress, billings, reconciler } = scene();
    progress.put(order({ status: "cancelled" }));
    billings.put({ ...billingFor("confirmed", false), status: "cancelled" });

    expect((await reconciler.execute()).billing.closed).toBe(0);
    expect(billings.rows.get("ord_1")?.billable).toBeNull();
  });
});
