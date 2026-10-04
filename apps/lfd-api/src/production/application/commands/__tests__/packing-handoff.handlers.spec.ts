import { legacyOf } from "../../../application/__tests__/station-doubles.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  BatchBackedDays,
  InMemoryBatches,
  RecordingDayLock,
} from "../../__tests__/batch-doubles.js";
import { handoffsOnDoubles } from "../../__tests__/handoff-doubles.js";
import { CancelBatchCommand } from "../cancel-batch.command.js";
import { CancelBatchHandler } from "../cancel-batch.handler.js";
import { MarkWorksheetLineCommand } from "../mark-worksheet-line.command.js";
import { MarkWorksheetLineHandler } from "../mark-worksheet-line.handler.js";
import { RecordBatchCommand } from "../record-batch.command.js";
import { RecordBatchHandler } from "../record-batch.handler.js";
import { UnmarkWorksheetLineCommand } from "../unmark-worksheet-line.command.js";
import { UnmarkWorksheetLineHandler } from "../unmark-worksheet-line.handler.js";

/**
 * **La remise au colisage** (plan `colisage/plan-domaine-colisage.md`, K1 :
 * §11.2 la remise EST la sortie du four ; §13, B2–B3), orchestrée par les
 * quatre gestes de fournée sur des ports doublés.
 *
 * Aucune comparaison à l'horloge : ces instants ne sont que recopiés.
 */
const NOW = new Date("2026-09-13T05:10:00.000Z");
const EARLIER = new Date("2026-09-13T04:40:00.000Z");
const DAY = "2026-09-13";
const SKU = "VIE-001";
const FIRST = "01K6A0000000000000000000A1";
const SECOND = "01K6A0000000000000000000B2";
const HANDED = "production.handed_to_packing";
const RETURNED = "production.return_requested";

const ORDER: ProducibleOrder = {
  orderId: "ord_1",
  reference: "CMD-0001",
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  lines: [{ sku: SKU, productName: "Croissant", quantity: 30 }],
};

function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], new Date("2026-09-13T04:20:00.000Z"));
  // L'ancien poste : depuis K2, une clôture naît au colisage.
  return legacyOf(day);
}

/** Cochée par l'ANCIEN binaire, sans fournée : 30 implicites. */
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
  const store = new InMemoryBatches();
  const days = new BatchBackedDays(base, store);
  const lock = new RecordingDayLock();
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  const handoffs = handoffsOnDoubles();
  return {
    store,
    ledger: handoffs.ledger,
    durable: handoffs.durable,
    record: new RecordBatchHandler(days, store, clock, uow, handoffs.service),
    cancel: new CancelBatchHandler(days, store, lock, clock, uow, handoffs.service),
    mark: new MarkWorksheetLineHandler(days, store, clock, uow, handoffs.service),
    unmark: new UnmarkWorksheetLineHandler(days, store, lock, clock, uow, handoffs.service),
  };
}

function record(id: string, quantity: number): RecordBatchCommand {
  return new RecordBatchCommand(DAY, SKU, id, quantity, "MB", "staff-1");
}

describe("déclarer une fournée, c'est la remettre au colisage", () => {
  it("écrit une remise d'`id` = la fournée, et publie le fait", async () => {
    const { record: handler, ledger, durable } = setup();

    await handler.execute(record(FIRST, 12));

    expect(ledger.handoffs).toEqual([
      {
        id: FIRST,
        sku: SKU,
        quantity: 12,
        source: "batch",
        at: NOW,
        by: "staff-1",
        requestId: null,
      },
    ]);
    expect(durable.of(HANDED)).toEqual([
      {
        type: HANDED,
        key: `${HANDED}:${FIRST}`,
        payload: {
          handoffId: FIRST,
          serviceDay: DAY,
          sku: SKU,
          quantity: 12,
          handedAt: NOW.toISOString(),
        },
      },
    ]);
  });

  it("une fournée déclarée DEUX fois n'est remise qu'une fois", async () => {
    const { record: handler, ledger, durable } = setup();

    await handler.execute(record(FIRST, 12));
    await handler.execute(record(FIRST, 12));

    expect(ledger.handoffs).toHaveLength(1);
    expect(durable.of(HANDED)).toHaveLength(1);
  });

  it("🔴 ne remet JAMAIS la coche héritée qu'elle matérialise", async () => {
    const { record: handler, store, ledger } = setup(legacyChecked());

    await handler.execute(record(FIRST, 5));

    expect(store.batches.map((batch) => batch.id)).toEqual([`backfill-${DAY}-${SKU}`, FIRST]);
    expect(ledger.handoffs.map((handoff) => handoff.id)).toEqual([FIRST]);
  });

  it("le rejeu d'une fournée ANNULÉE ne la remet pas : elle ne compte plus", async () => {
    const { record: handler, store, ledger, durable } = setup();
    await store.record(ServiceDay.of(DAY), {
      id: FIRST,
      sku: SKU,
      quantity: 12,
      recorded: { at: EARLIER, by: "staff-1", initials: "MB" },
      cancelled: { at: EARLIER, by: "staff-1" },
      returned: 0,
      pendingReturn: 0,
    });

    await handler.execute(record(FIRST, 12));

    expect(ledger.handoffs).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("cocher la ligne remet la fournée du RESTE", async () => {
    const { mark, ledger, durable } = setup();

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    const id = `mark-${DAY}-${SKU}-0-0`;
    expect(ledger.handoffs.map((handoff) => [handoff.id, handoff.quantity])).toEqual([[id, 30]]);
    expect(durable.of(HANDED).map((fact) => fact.key)).toEqual([`${HANDED}:${id}`]);
  });

  it("cocher une ligne déjà complète ne remet rien", async () => {
    const { record: handler, mark, ledger } = setup();
    await handler.execute(record(FIRST, 30));

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    expect(ledger.handoffs.map((handoff) => handoff.id)).toEqual([FIRST]);
  });
});

describe("annuler une fournée remise, c'est la reprendre (journée `legacy`)", () => {
  it("écrit un retour négatif et publie `return_requested` avec `legacy: true`", async () => {
    const { record: handler, cancel, ledger, durable } = setup();
    await handler.execute(record(FIRST, 12));

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    expect(ledger.handoffs[1]).toEqual({
      id: `return-${FIRST}`,
      sku: SKU,
      quantity: -12,
      source: "batch",
      at: NOW,
      by: "staff-3",
      requestId: `return-${FIRST}`,
    });
    expect(durable.of(RETURNED)).toEqual([
      {
        type: RETURNED,
        key: `${RETURNED}:return-${FIRST}`,
        payload: {
          requestId: `return-${FIRST}`,
          serviceDay: DAY,
          sku: SKU,
          quantity: 12,
          legacy: true,
          requestedAt: NOW.toISOString(),
          // La remise visée, portée depuis K2 (§13).
          handoffId: FIRST,
        },
      },
    ]);
  });

  it("une fournée jamais remise (d'avant K1) ne demande rien au colisage", async () => {
    const { store, cancel, ledger, durable } = setup();
    await store.record(ServiceDay.of(DAY), {
      id: FIRST,
      sku: SKU,
      quantity: 12,
      recorded: { at: EARLIER, by: "staff-1", initials: "MB" },
      cancelled: null,
      returned: 0,
      pendingReturn: 0,
    });

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    expect(store.batches[0]?.cancelled).not.toBeNull();
    expect(ledger.handoffs).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("annuler deux fois ne reprend qu'une fois", async () => {
    const { record: handler, cancel, durable } = setup();
    await handler.execute(record(FIRST, 12));

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));
    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-3"));

    expect(durable.of(RETURNED)).toHaveLength(1);
  });

  it("décocher reprend chaque fournée remise de la ligne, et elles seules", async () => {
    const { store, record: handler, unmark, durable } = setup();
    await store.record(ServiceDay.of(DAY), {
      id: SECOND,
      sku: SKU,
      quantity: 4,
      recorded: { at: EARLIER, by: "staff-1", initials: "MB" },
      cancelled: null,
      returned: 0,
      pendingReturn: 0,
    });
    await handler.execute(record(FIRST, 12));

    await unmark.execute(new UnmarkWorksheetLineCommand(DAY, SKU, "staff-9"));

    expect(store.batches.every((batch) => batch.cancelled !== null)).toBe(true);
    expect(durable.of(RETURNED).map((fact) => fact.key)).toEqual([`${RETURNED}:return-${FIRST}`]);
  });
});
