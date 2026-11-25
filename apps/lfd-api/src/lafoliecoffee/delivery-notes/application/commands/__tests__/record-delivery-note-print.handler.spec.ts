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
 * **Une impression de BL** (plan E6 § 14 ; `documentation/commandes/reliquat/reliquat.md`, § 7) :
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

async function scene(known = true, contentVersion = 1) {
  const notes = new InMemoryDeliveryNotes();
  const orders = new InMemoryOrderProgress();
  if (known) {
    orders.put(ORDER);
  }
  const planned = DeliveryNote.planFromOrder("dn_1", ORDER, PLANNED_AT);
  await notes.save(DeliveryNote.rehydrate({ ...planned.toState(), contentVersion }));
  const journal = new RecordingJournal();
  const clock = new FixedClock(PRINTED_AT);
  const handler = new RecordDeliveryNotePrintHandler(
    orders.scan,
    notes,
    clock,
    new DirectUnitOfWork(),
    journal,
  );
  return { notes, journal, handler, clock };
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

  // L'impression ne fait PAS monter la version du contenu : elle dit laquelle
  // a été imprimée. Une impression du bon en version 2 ne retombe pas à 1.
  it("une impression du bon en version 2 trace la version 2, et ne la fait pas monter", async () => {
    const { notes, journal, handler } = await scene(true, 2);

    await handler.execute(new RecordDeliveryNotePrintCommand("ord_a", "BL-42-1", "staff_1"));

    const row = notes.rows.get("dn_1");
    expect(row?.contentVersion).toBe(2);
    expect(row?.printed?.version).toBe(2);
    expect(journal.facts[0]?.idempotencyKey).toBe(
      `delivery_note.printed:dn_1:2:${PRINTED_AT.toISOString()}`,
    );
  });

  // Deux impressions à deux instants = deux lignes d'historique ; la colonne
  // ne garde que la dernière.
  it("deux impressions à deux instants portent deux clés, la colonne garde la dernière", async () => {
    const { notes, journal, handler, clock } = await scene();

    await handler.execute(new RecordDeliveryNotePrintCommand("ord_a", "BL-42-1", "staff_1"));
    clock.advanceMs(1_000);
    await handler.execute(new RecordDeliveryNotePrintCommand("ord_a", "BL-42-1", "staff_2"));

    const keys = journal.facts.map((entry) => entry.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(notes.rows.get("dn_1")?.printed?.by).toBe("staff_2");
  });
});
