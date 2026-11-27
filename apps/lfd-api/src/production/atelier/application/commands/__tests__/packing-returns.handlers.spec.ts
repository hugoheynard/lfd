import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import { PackingReturnedEvent } from "../../../../channels/packing/packing-returned.event.js";
import { ProductionDay } from "../../../../day/domain/entities/production-day.js";
import { BatchReturnPendingError } from "../../../../day/domain/errors/batch-errors.js";
import { ServiceDay } from "../../../../day/index.js";
import {
  BatchBackedDays,
  InMemoryBatches,
  RecordingDayLock,
} from "../../../../day/application/__tests__/batch-doubles.js";
import { handoffsOnDoubles } from "../../__tests__/packing-handoffs-doubles.js";
import {
  InMemoryHandoffReader,
  returnCountsOf,
} from "../../../../day/application/__tests__/handoff-doubles.js";
import { OnPackingReturned } from "../../../../day/application/handlers/on-packing-returned.handler.js";
import { CancelBatchCommand } from "../cancel-batch.command.js";
import { CancelBatchHandler } from "../cancel-batch.handler.js";
import { RecordBatchCommand } from "../record-batch.command.js";
import { RecordBatchHandler } from "../record-batch.handler.js";
import { BatchRecording } from "../../services/batch-recording.service.js";

/**
 * **L'annulation sur une journée `packing`** (plan
 * `colisage/colisage.md`, K2, §13 B2) : une DEMANDE au colisage,
 * qui ne baisse pas « sorti » ; seule la réponse le fait.
 *
 * Aucune comparaison à l'horloge : ces instants ne sont que recopiés.
 */
const NOW = new Date("2026-09-13T05:10:00.000Z");
const DECIDED = new Date("2026-09-13T05:12:00.000Z");
const DAY = "2026-09-13";
const SKU = "VIE-001";
const FIRST = "01K6A0000000000000000000A1";
const RETURN_REQUESTED = "production.return_requested";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "ORD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  clientele: null,
  siteId: null,
  offPlan: false,
  sheetDetails: null,
  lines: [
    { sku: SKU, productName: "Croissant", quantity: 30, saleUnit: "piece", madeToOrder: null },
  ],
};

/** Arrêtée par le binaire de K2 : colisée au colisage. */
function packingDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], new Set<string>(), new Date("2026-09-13T04:20:00.000Z"), null);
  return day;
}

function setup() {
  const store = new InMemoryBatches();
  const handoffs = handoffsOnDoubles();
  const days = new BatchBackedDays(packingDay(), store, [], returnCountsOf(handoffs.requests));
  const lock = new RecordingDayLock();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  return {
    store,
    days,
    ...handoffs,
    record: new RecordBatchHandler(
      days,
      lock,
      clock,
      uow,
      new BatchRecording(store, handoffs.service),
    ),
    cancel: new CancelBatchHandler(days, store, lock, clock, uow, handoffs.service),
    answer: new OnPackingReturned(
      handoffs.requests,
      handoffs.ledger,
      days,
      store,
      lock,
      new InMemoryHandoffReader(handoffs.ledger),
    ),
  };
}

function delivery(requestId: string, returned: number): DurableDelivery {
  const fact = new PackingReturnedEvent(requestId, DAY, returned, DECIDED).durableFact();
  return { eventId: "evt_1", type: fact.type, payload: fact.payload };
}

async function producedAfter(days: BatchBackedDays): Promise<number> {
  return (await days.load()).producedOf(SKU);
}

describe("annuler une fournée remise, sur une journée `packing`", () => {
  it("DEMANDE le retour, avec la remise visée, et ne baisse PAS « sorti »", async () => {
    const { record, cancel, durable, requests, days } = setup();
    await record.execute(new RecordBatchCommand(DAY, SKU, FIRST, 12, "MB", "staff-1"));

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    const facts = durable.of(RETURN_REQUESTED);
    expect(facts).toHaveLength(1);
    expect(facts[0]?.payload).toMatchObject({ legacy: false, handoffId: FIRST, quantity: 12 });
    expect([...requests.rows.values()].map((row) => row.request.batchId)).toEqual([FIRST]);
    expect(await producedAfter(days)).toBe(12);
    const batch = (await days.load()).batches.find((candidate) => candidate.id === FIRST);
    expect(batch).toMatchObject({ cancelled: null, pendingReturn: 12 });
  });

  it("refuse une seconde demande tant que la première attend sa réponse", async () => {
    const { record, cancel } = setup();
    await record.execute(new RecordBatchCommand(DAY, SKU, FIRST, 12, "MB", "staff-1"));
    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    await expect(
      cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3")),
    ).rejects.toBeInstanceOf(BatchReturnPendingError);
  });
});

describe("la réponse du colisage (`packing.returned`)", () => {
  async function requested() {
    const subject = setup();
    await subject.record.execute(new RecordBatchCommand(DAY, SKU, FIRST, 12, "MB", "staff-1"));
    await subject.cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));
    const requestId = [...subject.requests.rows.keys()][0] ?? "";
    return { ...subject, requestId };
  }

  it("TOUT rendu : une remise négative, et la fournée s'annule au nom du demandeur", async () => {
    const { answer, requestId, ledger, store, days } = await requested();

    await answer.handle(delivery(requestId, 12));

    expect(ledger.handoffs.at(-1)).toEqual({
      id: requestId,
      sku: SKU,
      quantity: -12,
      source: "batch",
      at: DECIDED,
      by: "staff-3",
      requestId,
    });
    expect(store.batches[0]?.cancelled).toEqual({ at: DECIDED, by: "staff-3" });
    expect(await producedAfter(days)).toBe(0);
  });

  it("rendu PARTIEL : « sorti » baisse de ce qui est rendu, la fournée compte pour le reste", async () => {
    const { answer, requestId, store, days } = await requested();

    await answer.handle(delivery(requestId, 5));

    expect(store.batches[0]?.cancelled).toBeNull();
    expect(await producedAfter(days)).toBe(7);
  });

  it("REFUS (0, tout au bac) : rien ne bouge, et l'annulation peut se redemander", async () => {
    const { answer, requestId, store, days, cancel, durable } = await requested();

    await answer.handle(delivery(requestId, 0));

    expect(store.batches[0]?.cancelled).toBeNull();
    expect(await producedAfter(days)).toBe(12);
    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));
    expect(durable.of(RETURN_REQUESTED)).toHaveLength(2);
  });

  it("tout le RÉEL rendu, la part corrigée en plus : la fournée s'annule (`fournil/les-niveaux-de-suivi.md`)", async () => {
    const { answer, requestId, store, days } = await requested();
    const stored = store.rows.get(FIRST);
    if (stored === undefined) {
      throw new Error("fournée semée introuvable");
    }
    // 4 des 12 pièces remises n'ont jamais existé : le colisage n'en rend que 8.
    store.rows.set(FIRST, { ...stored, batch: { ...stored.batch, corrected: 4 } });

    await answer.handle(delivery(requestId, 8));

    expect(store.batches[0]?.cancelled).toEqual({ at: DECIDED, by: "staff-3" });
    expect(await producedAfter(days)).toBe(0);
  });

  it("une réponse livrée deux fois ne reprend qu'une fois", async () => {
    const { answer, requestId, ledger, days } = await requested();

    await answer.handle(delivery(requestId, 5));
    await answer.handle(delivery(requestId, 5));

    expect(ledger.handoffs.filter((handoff) => handoff.quantity < 0)).toHaveLength(1);
    expect(await producedAfter(days)).toBe(7);
  });
});

describe("une fournée jamais remise, sur une journée `packing`", () => {
  it("s'annule tout de suite : le colisage ne l'a pas, il n'a rien à rendre", async () => {
    const { store, cancel, durable } = setup();
    await store.record(ServiceDay.of(DAY), {
      id: FIRST,
      sku: SKU,
      quantity: 12,
      recorded: { at: NOW, by: "staff-1", initials: "" },
      cancelled: null,
      returned: 0,
      pendingReturn: 0,
      corrected: 0,
    });

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    expect(store.batches[0]?.cancelled).toEqual({ at: NOW, by: "staff-3" });
    expect(durable.of(RETURN_REQUESTED)).toEqual([]);
  });
});
