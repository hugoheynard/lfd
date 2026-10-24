import { ORDER_TERMS } from "../../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import {
  FixedConfirmedOrders,
  InMemoryDeliveryNotes,
  InMemoryOrderProgress,
} from "../../__tests__/delivery-note-doubles.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import { DeliveryNoteAligner } from "../delivery-note-aligner.js";
import { DeliveryNoteFollower } from "../delivery-note-follower.js";
import { DeliveryNotePlanner } from "../delivery-note-planner.js";

// Comparés entre eux seulement.
const CONFIRMED_AT = new Date(1_000);
const READY_AT = new Date(2_000);
const HANDED_OVER_AT = new Date(3_000);
const NOW = new Date(9_000);
const CANCELLED_AT = new Date(4_000);

const LINE = {
  sku: "PAIN-001",
  productName: "Pain",
  unitPriceMillicents: 100_000,
  vatRate: 5.5,
  quantity: 1,
  lineTotalCents: 100,
  unitPriceTtcCents: null,
  lineTotalTtcCents: null,
  pickupDiscountEligible: true,
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
    terms: ORDER_TERMS,
    ...overrides,
  };
}

/** Une première lecture qui ne voit pas encore le BL qu'un geste concurrent vient d'écrire. */
class StaleOnceNotes extends InMemoryDeliveryNotes {
  private stale = true;

  override loadForOrders(orderIds: readonly string[]): Promise<readonly DeliveryNote[]> {
    if (this.stale) {
      this.stale = false;
      return Promise.resolve([]);
    }
    return super.loadForOrders(orderIds);
  }
}

function scene() {
  const notes = new InMemoryDeliveryNotes();
  const progress = new InMemoryOrderProgress();
  const ids = new FixedIdGenerator("dn");
  const clock = new FixedClock(NOW);
  const planner = new DeliveryNotePlanner(new FixedConfirmedOrders(), notes, ids, clock);
  const follower = new DeliveryNoteFollower(
    planner,
    progress,
    new DeliveryNoteAligner(notes, ids),
    clock,
  );
  return { notes, progress, follower };
}

describe("DeliveryNoteFollower — les gestes (plan E2, § 8.3)", () => {
  it("bac fermé sur une commande confirmée par l'arrêt → BL `prepared`", async () => {
    const { notes, progress, follower } = scene();
    progress.put(order());
    await follower.prepare("ord_1"); // pas encore prête : le BL naît prévu
    progress.put(order({ status: "ready", readyAt: READY_AT }));

    await follower.prepare("ord_1");

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({
        status: "prepared",
        preparedAt: READY_AT,
        plannedAt: CONFIRMED_AT,
      }),
    ]);
  });

  it("remise hors plan, sans BL → BL plein `handed_over`", async () => {
    const { notes, progress, follower } = scene();
    progress.put(
      order({
        status: "fulfilled",
        confirmedAt: null,
        handedOverAt: HANDED_OVER_AT,
        receivedOn: "1970-01-01",
      }),
    );

    await follower.handOver("ord_1");

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({
        number: "BL-7-1",
        status: "handed_over",
        preparedAt: HANDED_OVER_AT,
        handedOverAt: HANDED_OVER_AT,
        receivedOn: "1970-01-01",
        lines: [LINE],
      }),
    ]);
  });

  it("annulation → le BL préparé passe `voided` à l'instant de l'annulation", async () => {
    const { notes, progress, follower } = scene();
    progress.put(order({ status: "ready", readyAt: READY_AT }));
    await follower.prepare("ord_1");
    progress.put(order({ status: "cancelled", readyAt: READY_AT }));

    await follower.voidLiveFor("ord_1", CANCELLED_AT);

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({ status: "voided", voidedAt: CANCELLED_AT, preparedAt: READY_AT }),
    ]);
  });

  it("un écart non réparable ne lève pas : la commande avance quand même", async () => {
    const { notes, progress, follower } = scene();
    progress.put(order({ status: "ready", readyAt: READY_AT, orderNumber: "CMD-1" }));

    await expect(follower.prepare("ord_1")).resolves.toBeUndefined();

    expect(notes.forOrder("ord_1")).toEqual([]);
  });

  it("une ligne que le BL refuse ne lève pas non plus", async () => {
    const { notes, progress, follower } = scene();
    progress.put(order({ status: "ready", readyAt: READY_AT, lines: [{ ...LINE, quantity: -1 }] }));

    await expect(follower.prepare("ord_1")).resolves.toBeUndefined();

    expect(notes.forOrder("ord_1")).toEqual([]);
  });

  it("une course perdue sur `(order_id, rank)` relit et avance le BL de l'autre", async () => {
    const notes = new StaleOnceNotes();
    const progress = new InMemoryOrderProgress();
    const ids = new FixedIdGenerator("dn");
    const clock = new FixedClock(NOW);
    const follower = new DeliveryNoteFollower(
      new DeliveryNotePlanner(new FixedConfirmedOrders(), notes, ids, clock),
      progress,
      new DeliveryNoteAligner(notes, ids),
      clock,
    );
    await notes.save(DeliveryNote.planFromOrder("dn_other", order(), CONFIRMED_AT));
    progress.put(order({ status: "ready", readyAt: READY_AT }));

    await follower.prepare("ord_1");

    expect(notes.forOrder("ord_1")).toEqual([
      expect.objectContaining({ id: "dn_other", status: "prepared", preparedAt: READY_AT }),
    ]);
  });
});
