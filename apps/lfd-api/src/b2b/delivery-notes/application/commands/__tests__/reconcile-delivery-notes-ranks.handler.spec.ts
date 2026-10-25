import { ORDER_TERMS } from "../../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import {
  InMemoryDeliveryNotes,
  InMemoryOrderProgress,
  InMemoryShortfallDecisions,
  billingCloserOf,
} from "../../__tests__/delivery-note-doubles.js";
import { DeliveryNoteAligner } from "../../services/delivery-note-aligner.js";
import { ReconcileDeliveryNotesHandler } from "../reconcile-delivery-notes.handler.js";

// Plan E7, choix 3 (lot L2) : le rattrapage aligne le BL-1 et ignore les
// reliquats — un BL-1 remis à côté d'un BL-2 vivant n'est plus un écart.

// Comparés entre eux seulement.
const CONFIRMED_AT = new Date(1_000);
const READY_AT = new Date(2_000);
const HANDED_OVER_AT = new Date(3_000);
const DECIDED_AT = new Date(3_500);
const NOW = new Date(9_000);
const ORDER_DAY = "1970-01-01";
const NEXT_DAY = "1970-01-02";

const LINE = {
  sku: "PAIN-001",
  productName: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 2,
  lineTotalCents: 200,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
};
const REST = { ...LINE, quantity: 1, lineTotalCents: 100 };

function order(id: string): DeliveryNoteOrderProgress {
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
    lines: [LINE],
    status: "fulfilled",
    confirmedAt: CONFIRMED_AT,
    readyAt: READY_AT,
    handedOverAt: HANDED_OVER_AT,
    receivedOn: ORDER_DAY,
    terms: ORDER_TERMS,
  };
}

function scene() {
  const notes = new InMemoryDeliveryNotes();
  const orders = new InMemoryOrderProgress();
  const handler = new ReconcileDeliveryNotesHandler(
    orders.scan,
    notes,
    new DeliveryNoteAligner(notes, new FixedIdGenerator("dn"), new InMemoryShortfallDecisions()),
    new DirectUnitOfWork(),
    new FixedClock(NOW),
    new InMemoryShortfallDecisions(),
    billingCloserOf(notes),
  );
  return { notes, orders, handler };
}

async function handedOverFirst(notes: InMemoryDeliveryNotes, subject: DeliveryNoteOrderProgress) {
  const note = DeliveryNote.planFromOrder(`dn_${subject.orderId}`, subject, CONFIRMED_AT);
  note.prepare(READY_AT);
  note.handOver(HANDED_OVER_AT, ORDER_DAY);
  await notes.save(note);
}

async function remainderOf(notes: InMemoryDeliveryNotes, subject: DeliveryNoteOrderProgress) {
  const source = { ...subject, lines: [REST], orderDay: ORDER_DAY };
  const note = DeliveryNote.planRemainder(
    `dn_${subject.orderId}_2`,
    source,
    2,
    NEXT_DAY,
    DECIDED_AT,
  );
  await notes.save(note);
  return note.toState();
}

describe("ReconcileDeliveryNotes — un BL-1 remis et un reliquat vivant", () => {
  it("n'est ni compté non réparable, ni verrouillé, ni réécrit", async () => {
    const { notes, orders, handler } = scene();
    const subject = order("a");
    orders.put(subject);
    await handedOverFirst(notes, subject);
    const rest = await remainderOf(notes, subject);
    const saves = notes.saves;

    const report = await handler.execute();

    expect(report).toMatchObject({
      scanned: 1,
      created: 0,
      advanced: 0,
      voided: 0,
      unrepaired: [],
    });
    expect(orders.locked).toEqual([]);
    expect(notes.rows.get(rest.id)).toEqual(rest);
    expect(notes.saves).toBe(saves);
  });

  it("ne compte pas le reliquat comme un écart de totaux", async () => {
    const { notes, orders, handler } = scene();
    const subject = order("a");
    orders.put(subject);
    await handedOverFirst(notes, subject);
    await remainderOf(notes, subject);

    const report = await handler.execute();

    expect(report.terms).toEqual({ compared: 1, gaps: [] });
  });

  it("avance le BL-1 en retard sans toucher au reliquat", async () => {
    const { notes, orders, handler } = scene();
    const subject = order("a");
    orders.put(subject);
    await notes.save(DeliveryNote.planFromOrder("dn_a", subject, CONFIRMED_AT));
    const rest = await remainderOf(notes, subject);

    const report = await handler.execute();

    expect(report).toMatchObject({ advanced: 1, unrepaired: [] });
    expect(notes.rows.get("dn_a")).toMatchObject({ status: "handed_over" });
    expect(notes.rows.get(rest.id)).toEqual(rest);
  });
});
