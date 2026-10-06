import { legacyOf } from "../../../application/__tests__/station-doubles.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import {
  BatchConflictError,
  BatchNotFoundError,
  InvalidBatchQuantityError,
} from "../../../domain/errors/batch-errors.js";
import {
  ProducedItemNotFoundError,
  ProductionDayNotClosedError,
} from "../../../domain/errors/production-errors.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { handoffsOnDoubles } from "../../__tests__/handoff-doubles.js";
import {
  BatchBackedDays,
  InMemoryBatches,
  RecordingDayLock,
} from "../../__tests__/batch-doubles.js";
import { CancelBatchCommand } from "../cancel-batch.command.js";
import { CancelBatchHandler } from "../cancel-batch.handler.js";
import { RecordBatchCommand } from "../record-batch.command.js";
import { RecordBatchHandler } from "../record-batch.handler.js";

/**
 * **Déclarer et annuler une fournée** (plan `plan-fournees-progressives.md`,
 * D3), orchestrés sur des ports doublés.
 *
 * Aucune comparaison à l'horloge ici : ces instants ne sont que recopiés.
 */
const NOW = new Date("2026-09-13T05:10:00.000Z");
const EARLIER = new Date("2026-09-13T04:40:00.000Z");
const DAY = "2026-09-13";
const SKU = "VIE-001";
const FIRST = "01K6A0000000000000000000A1";
const SECOND = "01K6A0000000000000000000B2";

const ORDERS: readonly ProducibleOrder[] = [
  {
    orderId: "ord_1",
    reference: "CMD-0001",
    customerLabel: "Trois Ponts",
    fulfillmentMethod: "pickup",
    destination: "Le Labo",
    dueAt: null,
    clientele: null,
    sheetDetails: null,
    lines: [{ sku: SKU, productName: "Croissant", quantity: 24 }],
  },
  {
    orderId: "ord_2",
    reference: "CMD-0002",
    customerLabel: "Le Chalet",
    fulfillmentMethod: "delivery",
    destination: "Val d'Isère",
    dueAt: null,
    clientele: null,
    sheetDetails: null,
    lines: [{ sku: SKU, productName: "Croissant", quantity: 6 }],
  },
];

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close(ORDERS, new Date("2026-09-13T04:20:00.000Z"), null);
  // L'ancien poste : depuis K2, une clôture naît au colisage.
  return legacyOf(day);
}

/** Cochée par l'ANCIEN binaire (`done_*`), sans aucune fournée : 30 implicites. */
function legacyChecked(): ProductionDay {
  const snapshot = closedDay().toSnapshot();
  return ProductionDay.fromSnapshot({
    ...snapshot,
    counts: snapshot.counts.map((item) => ({
      ...item,
      done: { at: EARLIER, by: "auth0|karim", initials: "KA" },
    })),
  });
}

function setup(base: ProductionDay = closedDay()) {
  const trace: string[] = [];
  const store = new InMemoryBatches(trace);
  const days = new BatchBackedDays(base, store, trace);
  const lock = new RecordingDayLock(trace);
  const clock = new FixedClock(NOW);
  const handoffs = handoffsOnDoubles();
  const uow = new DirectUnitOfWork();
  return {
    store,
    trace,
    lock,
    handoffs,
    record: new RecordBatchHandler(days, store, clock, uow, handoffs.service),
    cancel: new CancelBatchHandler(days, store, lock, clock, uow, handoffs.service),
  };
}

function record(id: string, quantity: number, sku = SKU, day = DAY): RecordBatchCommand {
  return new RecordBatchCommand(day, sku, id, quantity, "MB", "staff-1");
}

describe("RecordBatchHandler", () => {
  it("écrit la fournée avec l'horloge et l'identité du guard — sans verrou", async () => {
    const { store, lock, record: handler } = setup();

    await handler.execute(record(FIRST, 12));

    expect(store.batches).toEqual([
      {
        id: FIRST,
        sku: SKU,
        quantity: 12,
        recorded: { at: NOW, by: "staff-1", initials: "MB" },
        cancelled: null,
        returned: 0,
        pendingReturn: 0,
      },
    ]);
    // Déclarer ne fait qu'augmenter le disponible : rien à sérialiser (D4).
    expect(lock.taken).toHaveLength(0);
  });

  it("un rejeu de la même charge est un succès silencieux", async () => {
    const { store, record: handler } = setup();
    await handler.execute(record(FIRST, 12));

    await handler.execute(record(FIRST, 12));

    expect(store.writes).toEqual([FIRST]);
  });

  it("le rejeu d'une fournée ANNULÉE réussit et ne la ressuscite pas", async () => {
    const { store, record: handler, cancel } = setup();
    await handler.execute(record(FIRST, 12));
    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    await handler.execute(record(FIRST, 12));

    expect(store.batches[0]?.cancelled).toEqual({ at: NOW, by: "staff-3" });
  });

  it("🔴 le même id pour une autre charge est refusé (409), rien n'est compté", async () => {
    const { store, record: handler } = setup();
    await handler.execute(record(FIRST, 12));

    await expect(handler.execute(record(FIRST, 18))).rejects.toBeInstanceOf(BatchConflictError);
    expect(store.batches.map((batch) => batch.quantity)).toEqual([12]);
  });

  it("refuse moins d'une pièce, sans rien écrire", async () => {
    const { store, record: handler } = setup();

    await expect(handler.execute(record(FIRST, 0))).rejects.toBeInstanceOf(
      InvalidBatchQuantityError,
    );
    expect(store.writes).toHaveLength(0);
  });

  it("porte les refus de la coche : journée ouverte, SKU hors compte", async () => {
    const open = setup(ProductionDay.open(ServiceDay.of(DAY)));
    await expect(open.record.execute(record(FIRST, 12))).rejects.toBeInstanceOf(
      ProductionDayNotClosedError,
    );
    await expect(setup().record.execute(record(FIRST, 12, "INCONNU"))).rejects.toBeInstanceOf(
      ProducedItemNotFoundError,
    );
  });

  it("🔴 matérialise la coche héritée AVANT la première fournée réelle : 30 + 5", async () => {
    // Sans ça, la fournée réelle effacerait la fournée implicite, et la ligne
    // tomberait de 30 sortis à 5.
    const { store, trace, record: handler } = setup(legacyChecked());

    await handler.execute(record(FIRST, 5));

    expect(trace).toEqual(["load", `record:backfill-${DAY}-${SKU}`, `record:${FIRST}`]);
    expect(store.batches.map((batch) => batch.quantity)).toEqual([30, 5]);
  });
});

describe("CancelBatchHandler", () => {
  it("annule sous le verrou, APRÈS l'avoir pris — tracée au nom du guard", async () => {
    const { store, trace, record: handler, cancel } = setup();
    await handler.execute(record(FIRST, 12));
    trace.length = 0;

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    expect(trace).toEqual([`lock:${DAY}`, "load", `cancel:${FIRST}`]);
    expect(store.batches[0]?.cancelled).toEqual({ at: NOW, by: "staff-3" });
  });

  it("annuler deux fois est un succès silencieux", async () => {
    const { trace, record: handler, cancel } = setup();
    await handler.execute(record(FIRST, 12));
    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));
    trace.length = 0;

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-4"));

    expect(trace).toEqual([`lock:${DAY}`, "load"]);
  });

  it("une fournée inconnue ce jour-là est introuvable (404)", async () => {
    await expect(
      setup().cancel.execute(new CancelBatchCommand(DAY, SECOND, "staff-3")),
    ).rejects.toBeInstanceOf(BatchNotFoundError);
  });

  it("annule une coche héritée en la matérialisant d'abord", async () => {
    const { store, trace, cancel } = setup(legacyChecked());
    const inherited = `backfill-${DAY}-${SKU}`;

    await cancel.execute(new CancelBatchCommand(DAY, inherited, "staff-3"));

    expect(trace).toEqual([`lock:${DAY}`, "load", `record:${inherited}`, `cancel:${inherited}`]);
    expect(store.batches[0]?.cancelled).toEqual({ at: NOW, by: "staff-3" });
  });
});
