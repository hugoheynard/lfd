import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
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

/**
 * **Le réassort du Labo ne passe pas au colisage** (réassort, R3c, décision 3
 * de Hugo du 2026-10-21) : la part d'une fournée qui revient à un point servi
 * sur place n'est pas remise — sinon elle resterait libre au colisage, sans
 * fiche pour l'emballer.
 *
 * Aucune comparaison à l'horloge : ces instants ne sont que recopiés.
 */
const NOW = new Date("2026-09-13T05:10:00.000Z");
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
  clientele: null,
  siteId: null,
  sheetDetails: null,
  lines: [{ sku: SKU, productName: "Croissant", quantity: 20 }],
};

function resupply(servedByTransfer: boolean, quantity: number): PlacedResupply {
  return {
    resupplyId: servedByTransfer ? "res_village" : "res_labo",
    siteId: servedByTransfer ? "village" : "labo",
    siteLabel: servedByTransfer ? "Val Village" : "Le Labo",
    name: null,
    servedByTransfer,
    lines: [{ sku: SKU, productName: "Croissant", quantity }],
  };
}

/** 20 en commande, 6 pour le Village (au colisage), 10 pour le Labo (sur place). */
function closedDay(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of(DAY));
  day.close([ORDER], new Set<string>(), new Date("2026-09-13T04:20:00.000Z"), null, [
    resupply(true, 6),
    resupply(false, 10),
  ]);
  return day;
}

function setup() {
  const store = new InMemoryBatches();
  const days = new BatchBackedDays(closedDay(), store);
  const clock = new FixedClock(NOW);
  const uow = new DirectUnitOfWork();
  const handoffs = handoffsOnDoubles();
  return {
    ...handoffs,
    record: new RecordBatchHandler(days, store, clock, uow, handoffs.service),
    mark: new MarkWorksheetLineHandler(days, store, clock, uow, handoffs.service),
    cancel: new CancelBatchHandler(
      days,
      store,
      new RecordingDayLock(),
      clock,
      uow,
      handoffs.service,
    ),
  };
}

function record(id: string, quantity: number): RecordBatchCommand {
  return new RecordBatchCommand(DAY, SKU, id, quantity, "MB", "staff-1");
}

function handedQuantities(ledger: ReturnType<typeof handoffsOnDoubles>["ledger"]) {
  return ledger.handoffs.map((handoff) => [handoff.id, handoff.quantity]);
}

describe("la part du Labo monte directement", () => {
  it("une fournée du total ne remet que la part du colisage (commandes + Village)", async () => {
    const { record: handler, ledger, durable } = setup();

    await handler.execute(record(FIRST, 36));

    expect(handedQuantities(ledger)).toEqual([[FIRST, 26]]);
    expect(durable.of(HANDED)[0]?.payload).toMatchObject({ handoffId: FIRST, quantity: 26 });
  });

  it("la fournée qui ne sert que le Labo n'est pas remise : ni ligne, ni fait", async () => {
    const { record: handler, ledger, durable } = setup();

    await handler.execute(record(FIRST, 26));
    await handler.execute(record(SECOND, 10));

    expect(handedQuantities(ledger)).toEqual([[FIRST, 26]]);
    expect(durable.of(HANDED)).toHaveLength(1);
  });

  it("cocher la ligne déclare le reste, et n'en remet que la part du colisage", async () => {
    const { mark, ledger } = setup();

    await mark.execute(new MarkWorksheetLineCommand(DAY, SKU, "MB", "staff-1"));

    expect(handedQuantities(ledger)).toEqual([[expect.any(String), 26]]);
  });

  it("annuler une fournée coupée ne redemande au colisage que ce qu'il a reçu", async () => {
    const { record: handler, cancel, durable } = setup();
    await handler.execute(record(FIRST, 36));

    await cancel.execute(new CancelBatchCommand(DAY, FIRST, "staff-2"));

    expect(durable.of(RETURNED)[0]?.payload).toMatchObject({ quantity: 26 });
  });
});
