import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { DeliveryNoteOrderProgress } from "../../../../orders/domain/ports/order-progress-for-delivery-note.js";
import { DeliveryNote } from "../../../domain/entities/delivery-note.js";
import { ORDER_TERMS } from "../../../domain/value-objects/__tests__/delivery-note-terms.fixture.js";
import {
  InMemoryDeliveryNotes,
  InMemoryOrderProgress,
} from "../../__tests__/delivery-note-doubles.js";
import { RecordDeliveryNotePrintCommand } from "../record-delivery-note-print.command.js";
import { RecordDeliveryNotePrintHandler } from "../record-delivery-note-print.handler.js";

/**
 * **Une impression de BL** (plan E6 § 14 ; plan du reliquat, § 5 ter, B4b.3) :
 * la colonne garde la dernière, l'historique de la commande les garde toutes.
 * Instants comparés entre eux seulement, jamais à l'horloge.
 */
const PLANNED_AT = new Date(1_000);
const PRINTED_AT = new Date(2_000);

const ORDER: DeliveryNoteOrderProgress = {
  orderId: "ord_a",
  orderNumber: "ORD-42",
  lines: [
    {
      sku: "PAIN-001",
      productName: "Pain",
      unitPriceMillicents: 100_000,
      vatRate: 5.5,
      quantity: 2,
      saleUnit: "piece",
      lineTotalCents: 200,
      unitPriceTtcCents: null,
      lineTotalTtcCents: null,
      pickupDiscountEligible: true,
    },
  ],
  status: "confirmed",
  confirmedAt: PLANNED_AT,
  readyAt: null,
  handedOverAt: null,
  receivedOn: null,
  terms: ORDER_TERMS,
};

async function scene(known = true) {
  const notes = new InMemoryDeliveryNotes();
  const orders = new InMemoryOrderProgress();
  if (known) {
    orders.put(ORDER);
  }
  await notes.save(DeliveryNote.planFromOrder("dn_1", ORDER, PLANNED_AT));
  const journal = new RecordingJournal();
  const handler = new RecordDeliveryNotePrintHandler(
    orders.scan,
    notes,
    new FixedClock(PRINTED_AT),
    new DirectUnitOfWork(),
    journal,
  );
  return { notes, journal, handler };
}

describe("RecordDeliveryNotePrintHandler", () => {
  it("trace l'impression sur le bon, et l'écrit à l'historique de la commande", async () => {
    const { notes, journal, handler } = await scene();

    await handler.execute(new RecordDeliveryNotePrintCommand("ord_a", "BL-42-1", "staff_1"));

    expect(notes.rows.get("dn_1")?.printed).toEqual({ version: 1, at: PRINTED_AT, by: "staff_1" });
    expect(journal.facts).toEqual([
      {
        type: "delivery_note.printed",
        subjectType: "order",
        subjectId: "ord_a",
        payload: { subjectLabel: "ORD-42", noteNumber: "BL-42-1", contentVersion: 1 },
        occurredAt: PRINTED_AT,
        idempotencyKey: `delivery_note.printed:dn_1:1:${PRINTED_AT.toISOString()}`,
      },
    ]);
  });

  it("un bon introuvable n'écrit rien, ni sur le bon ni à l'historique", async () => {
    const { notes, journal, handler } = await scene();

    await handler.execute(new RecordDeliveryNotePrintCommand("ord_a", "BL-42-9", "staff_1"));

    expect(notes.rows.get("dn_1")?.printed).toBeNull();
    expect(journal.facts).toEqual([]);
  });

  it("une commande inconnue n'écrit rien", async () => {
    const { journal, handler } = await scene(false);

    await handler.execute(new RecordDeliveryNotePrintCommand("ord_a", "BL-42-1", "staff_1"));

    expect(journal.facts).toEqual([]);
  });
});
