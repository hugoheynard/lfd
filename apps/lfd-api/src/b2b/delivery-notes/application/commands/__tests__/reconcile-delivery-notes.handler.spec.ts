import { ORDER_TERMS } from "../../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import {
  InMemoryDeliveryNotes,
  InMemoryOrderProgress,
} from "../../__tests__/delivery-note-doubles.js";
import { DeliveryNoteAligner } from "../../services/delivery-note-aligner.js";
import { RECONCILE_REPAIR_LIMIT } from "../reconcile-delivery-notes.command.js";
import { ReconcileDeliveryNotesHandler } from "../reconcile-delivery-notes.handler.js";

// Comparés entre eux seulement.
const CONFIRMED_AT = new Date(1_000);
const READY_AT = new Date(2_000);
const HANDED_OVER_AT = new Date(3_000);
const NOW = new Date(9_000);

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

function order(
  id: string,
  overrides: Partial<DeliveryNoteOrderProgress> = {},
): DeliveryNoteOrderProgress {
  return {
    orderId: id,
    orderNumber: `ORD-${id}`,
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

const READY = { status: "ready", readyAt: READY_AT } as const;
const FULFILLED = {
  status: "fulfilled",
  handedOverAt: HANDED_OVER_AT,
  receivedOn: "1970-01-01",
} as const;

function scene() {
  const notes = new InMemoryDeliveryNotes();
  const orders = new InMemoryOrderProgress();
  const ids = new FixedIdGenerator("dn");
  const handler = new ReconcileDeliveryNotesHandler(
    orders.scan,
    notes,
    new DeliveryNoteAligner(notes, ids),
    new DirectUnitOfWork(),
    new FixedClock(NOW),
  );
  return { notes, orders, handler };
}

async function plannedFor(
  notes: InMemoryDeliveryNotes,
  subject: DeliveryNoteOrderProgress,
): Promise<void> {
  await notes.save(DeliveryNote.planFromOrder(`dn_${subject.orderId}`, subject, CONFIRMED_AT));
}

describe("ReconcileDeliveryNotes — les cas du plan E2, § 8.2", () => {
  it("sans BL : BL-1 créé à l'état de la commande (confirmée, prête, remise)", async () => {
    const { notes, orders, handler } = scene();
    orders.put(order("a"));
    orders.put(order("b", READY));
    orders.put(order("c", FULFILLED));

    const report = await handler.execute();

    expect(report).toMatchObject({
      scanned: 3,
      created: 3,
      advanced: 0,
      unrepaired: [],
      complete: true,
    });
    expect(notes.forOrder("a")[0]?.status).toBe("planned");
    expect(notes.forOrder("b")[0]).toMatchObject({ status: "prepared", preparedAt: READY_AT });
    expect(notes.forOrder("c")[0]).toMatchObject({
      status: "handed_over",
      receivedOn: "1970-01-01",
    });
  });

  it("BL prévu en retard : lignes réécrites, puis avancé ; BL préparé sur une remise : avancé", async () => {
    const { notes, orders, handler } = scene();
    const revised = { ...LINE, quantity: 3, lineTotalCents: 300 };
    await plannedFor(notes, order("a"));
    orders.put(order("a", { ...READY, lines: [revised] }));
    await plannedFor(notes, order("b"));
    const prepared = (await notes.loadForOrders(["b"]))[0];
    prepared?.prepare(READY_AT);
    if (prepared !== undefined) {
      await notes.save(prepared);
    }
    orders.put(order("b", { ...FULFILLED, readyAt: READY_AT }));

    const report = await handler.execute();

    expect(report).toMatchObject({ advanced: 2, created: 0 });
    expect(notes.forOrder("a")[0]).toMatchObject({ status: "prepared", lines: [revised] });
    expect(notes.forOrder("b")[0]).toMatchObject({ status: "handed_over", preparedAt: READY_AT });
  });

  it("BL vivant non remis sur une commande annulée : annulé, à l'instant du passage", async () => {
    const { notes, orders, handler } = scene();
    await plannedFor(notes, order("a"));
    orders.put(order("a", { status: "cancelled" }));

    expect(await handler.execute()).toMatchObject({ voided: 1 });
    expect(notes.forOrder("a")[0]).toMatchObject({ status: "voided", voidedAt: NOW });
  });

  it("ce qui ne se répare pas est compté et nommé, sans écriture ni verrou", async () => {
    const { notes, orders, handler } = scene();
    orders.put(order("a", { status: "in_production" }));
    orders.put(order("b", { ...FULFILLED, handedOverAt: null }));
    orders.put(order("c", { orderNumber: "CMD-9" }));
    await plannedFor(notes, order("d"));
    const voided = (await notes.loadForOrders(["d"]))[0];
    voided?.void(CONFIRMED_AT);
    if (voided !== undefined) {
      await notes.save(voided);
    }
    orders.put(order("d", READY));
    const saves = notes.saves;

    const report = await handler.execute();

    expect(report.unrepaired).toEqual([
      { orderId: "a", orderNumber: "ORD-a", reason: "dead_status" },
      { orderId: "b", orderNumber: "ORD-b", reason: "missing_instant" },
      { orderId: "c", orderNumber: "CMD-9", reason: "atypical_number" },
      { orderId: "d", orderNumber: "ORD-d", reason: "voided_only" },
    ]);
    expect(notes.saves).toBe(saves);
    expect(orders.locked).toEqual([]);
  });

  it("idempotent : un second passage ne verrouille ni n'écrit rien", async () => {
    const { notes, orders, handler } = scene();
    orders.put(order("a", READY));
    orders.put(order("b", FULFILLED));
    await handler.execute();
    const saves = notes.saves;
    orders.locked.length = 0;

    const report = await handler.execute();

    expect(report).toMatchObject({ scanned: 2, created: 0, advanced: 0, voided: 0 });
    expect(notes.saves).toBe(saves);
    expect(orders.locked).toEqual([]);
  });

  it("répare sous le verrou de la commande, une commande à la fois", async () => {
    const { orders, handler } = scene();
    orders.put(order("a", READY));
    orders.put(order("b", READY));

    await handler.execute();

    expect(orders.locked).toEqual(["a", "b"]);
  });

  it("borné : au-delà du plafond, le passage s'arrête et le dit", async () => {
    const { orders, handler } = scene();
    for (let i = 0; i <= RECONCILE_REPAIR_LIMIT; i += 1) {
      orders.put(order(String(i).padStart(4, "0"), READY));
    }

    const report = await handler.execute();

    expect(report).toMatchObject({ created: RECONCILE_REPAIR_LIMIT, complete: false });
  });
});

describe("ReconcileDeliveryNotes — les totaux du BL (plan E4a)", () => {
  it("complète l'en-tête vide d'un BL remis d'avant E4a, compté `completed`", async () => {
    const { notes, orders, handler } = scene();
    const subject = order("a", FULFILLED);
    orders.put(subject);
    const note = DeliveryNote.planFromOrder("dn_a", subject, CONFIRMED_AT);
    note.handOver(HANDED_OVER_AT, "1970-01-01");
    notes.rows.set("dn_a", { ...note.toState(), terms: null });

    const report = await handler.execute();

    expect(report).toMatchObject({ completed: 1, advanced: 0, created: 0 });
    expect(notes.forOrder("a")[0]).toMatchObject({ status: "handed_over", terms: ORDER_TERMS });
    expect(orders.locked).toEqual(["a"]);
  });

  it("le contrôle rend zéro écart quand chaque BL reprend sa commande", async () => {
    const { orders, handler } = scene();
    orders.put(order("a", READY));
    orders.put(order("b", FULFILLED));
    await handler.execute();

    const report = await handler.execute();

    expect(report.terms).toEqual({ compared: 2, gaps: [] });
  });

  it("le contrôle compte et nomme un BL dont les totaux divergent, sans le réécrire", async () => {
    const { notes, orders, handler } = scene();
    orders.put(order("a"));
    await plannedFor(notes, order("a"));
    orders.put(order("a", { terms: { ...ORDER_TERMS, totalCents: 1 } }));
    const saves = notes.saves;

    const report = await handler.execute();

    expect(report.terms).toEqual({
      compared: 1,
      gaps: [{ orderId: "a", orderNumber: "ORD-a", noteNumber: "BL-a-1", fields: ["totalCents"] }],
    });
    expect(notes.saves).toBe(saves);
  });
});
