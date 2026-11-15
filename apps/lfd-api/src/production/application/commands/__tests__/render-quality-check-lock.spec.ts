import { InMemoryQualityControlSettings } from "../../__tests__/quality-control-settings-doubles.js";
import { SealedDayReading } from "../../../day/application/services/sealed-day-reading.service.js";
import { sealedAt } from "../../__tests__/station-doubles.js";
import { RecordingDayLock } from "../../__tests__/batch-doubles.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { OrderCustodyReader, type OrderOutOfHand } from "../../../channels/handover/index.js";
import { QualityOrderDepartedError } from "../../../domain/errors/quality-record-errors.js";
import { ServiceDay } from "../../../day/index.js";
import {
  CheckTable,
  closedDay,
  FixedDays,
  InMemoryCheckReader,
  InMemoryChecks,
  InMemoryProductionStore,
  InMemoryUploads,
} from "../../__tests__/quality-doubles.js";
import { QualityPhotoAttachment } from "../../services/quality-photo-attachment.service.js";
import { RenderQualityCheckCommand } from "../render-quality-check.command.js";
import { RenderQualityCheckHandler } from "../render-quality-check.handler.js";

/** La journée de service n'est jamais comparée à l'horloge ici. */
const DAY = ServiceDay.of("2030-03-12");

/** Le retrait : la commande est là pendant `inHandFor` lectures, partie ensuite. */
class DepartingCustody extends OrderCustodyReader {
  readings = 0;

  constructor(private readonly inHandFor: number) {
    super();
  }

  outOfHand(orderIds: readonly string[]): Promise<ReadonlyMap<string, OrderOutOfHand>> {
    this.readings += 1;
    const gone: OrderOutOfHand = "departed";
    return Promise.resolve(
      new Map(this.readings > this.inHandFor ? orderIds.map((id) => [id, gone] as const) : []),
    );
  }
}

function subject(custody: OrderCustodyReader) {
  const clock = new FixedClock(new Date(0));
  const table = new CheckTable();
  const events = new RecordingPublisher();
  const lock = new RecordingDayLock();
  const handler = new RenderQualityCheckHandler(
    new InMemoryChecks(table),
    new InMemoryCheckReader(table),
    new SealedDayReading(
      new FixedDays(closedDay(DAY, clock.now(), [])),
      sealedAt(clock.now(), ["ord_2"]),
    ),
    new QualityPhotoAttachment(new InMemoryUploads(table), new InMemoryProductionStore(), clock),
    custody,
    InMemoryQualityControlSettings.allOpen().reader(),
    events,
    clock,
    new DirectUnitOfWork(),
    lock,
  );
  return { handler, table, events, lock };
}

function command(id: string): RenderQualityCheckCommand {
  return new RenderQualityCheckCommand(
    id,
    DAY.value,
    { kind: "order", orderId: "ord_2" },
    "blocking",
    "Bac écrasé",
    [],
    "staff_sup",
  );
}

describe("RenderQualityCheckHandler — la décision sous le verrou de la journée", () => {
  it("prend le verrou de la journée jugée avant d'écrire", async () => {
    const { handler, table, lock } = subject(new DepartingCustody(Number.POSITIVE_INFINITY));

    await handler.execute(command("01JQD000000000000000000001"));

    expect(lock.taken).toEqual([`lock:${DAY.value}`]);
    expect(table.rows.size).toBe(1);
  });

  /**
   * Régression : la garde « partie » n'était lue qu'avant la transaction ; un
   * départ validé entre-temps laissait passer le verdict (2026-11-15).
   */
  it("une commande partie pendant que le verdict s'écrit : refusé sous le verrou, rien d'écrit", async () => {
    const custody = new DepartingCustody(1);
    const { handler, table, events, lock } = subject(custody);

    await expect(handler.execute(command("01JQD000000000000000000002"))).rejects.toThrow(
      QualityOrderDepartedError,
    );

    expect(custody.readings).toBe(2);
    expect(lock.taken).toEqual([`lock:${DAY.value}`]);
    expect(table.rows.size).toBe(0);
    expect(events.traced).toEqual([]);
  });
});
