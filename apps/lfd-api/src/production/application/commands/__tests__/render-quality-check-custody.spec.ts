import { SealedDayReading } from "../../services/sealed-day-reading.service.js";
import { sealedAt } from "../../__tests__/station-doubles.js";
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { OrderOutOfHand } from "../../../channels/handover/index.js";
import {
  QualityOrderDepartedError,
  QualityOrderHandedOverError,
} from "../../../domain/errors/quality-record-errors.js";
import type { QualityTargetRequest } from "../../../domain/services/quality-check-scope.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import {
  CheckTable,
  closedDay,
  CROISSANT,
  FixedDays,
  FixedOrderCustody,
  InMemoryCheckReader,
  InMemoryChecks,
  InMemoryProductionStore,
  InMemoryUploads,
} from "../../__tests__/quality-doubles.js";
import { QualityPhotoAttachment } from "../../services/quality-photo-attachment.service.js";
import { RenderQualityCheckCommand } from "../render-quality-check.command.js";
import { RenderQualityCheckHandler } from "../render-quality-check.handler.js";

/**
 * On ne juge que ce qu'on a sous les yeux (`a-la-porte.md`, § 10 ter,
 * BQ — LB-Q1) : un verdict sur une commande partie ou déjà retirée est refusé.
 * La journée de service n'est jamais comparée à l'horloge ici.
 */
const DAY = ServiceDay.of("2030-03-12");
const ORDER_2: QualityTargetRequest = { kind: "order", orderId: "ord_2" };
const LINE: QualityTargetRequest = { kind: "line", sku: CROISSANT };

function subject(gone: ReadonlyMap<string, OrderOutOfHand> = new Map()) {
  const clock = new FixedClock(new Date(0));
  const table = new CheckTable();
  const events = new RecordingPublisher();
  const handler = new RenderQualityCheckHandler(
    new InMemoryChecks(table),
    new InMemoryCheckReader(table),
    new SealedDayReading(
      new FixedDays(closedDay(DAY, clock.now(), [])),
      sealedAt(clock.now(), ["ord_2"]),
    ),
    new QualityPhotoAttachment(new InMemoryUploads(table), new InMemoryProductionStore(), clock),
    new FixedOrderCustody(gone),
    events,
    clock,
    new DirectUnitOfWork(),
  );
  return { handler, table, events };
}

let sequence = 0;
function command(target: QualityTargetRequest, id?: string): RenderQualityCheckCommand {
  sequence += 1;
  return new RenderQualityCheckCommand(
    id ?? `01JQD${String(sequence).padStart(21, "0")}`,
    DAY.value,
    target,
    "blocking",
    "Bac écrasé",
    [],
    "staff_sup",
  );
}

describe("RenderQualityCheckHandler — la garde (BQ)", () => {
  it("une commande partie : 409, « La commande est partie : le produit n'est plus là. », rien d'écrit", async () => {
    const { handler, table, events } = subject(new Map([["ord_2", "departed"]]));

    const refused = handler.execute(command(ORDER_2));

    await expect(refused).rejects.toThrow(QualityOrderDepartedError);
    await expect(refused).rejects.toThrow(/^La commande est partie : le produit n'est plus là\./u);
    await expect(refused).rejects.toMatchObject({ code: "production.quality.order_departed" });
    expect(table.rows.size).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("une commande déjà retirée : refusée en le disant", async () => {
    const { handler, table } = subject(new Map([["ord_2", "handed_over"]]));

    await expect(handler.execute(command(ORDER_2))).rejects.toThrow(QualityOrderHandedOverError);
    await expect(handler.execute(command(ORDER_2))).rejects.toThrow(
      "La commande ORD-0002 est déjà retirée",
    );
    expect(table.rows.size).toBe(0);
  });

  it("une commande encore au fournil : le verdict est permis", async () => {
    const { handler, table } = subject(new Map([["ord_1", "departed"]]));

    const id = await handler.execute(command(ORDER_2));

    expect(table.rows.get(id)?.target).toEqual({ kind: "order", orderId: "ord_2" });
  });

  it("une LIGNE se juge toujours : le lot est encore au fournil, même si une commande est partie", async () => {
    const { handler, table } = subject(
      new Map<string, OrderOutOfHand>([
        ["ord_1", "departed"],
        ["ord_2", "handed_over"],
      ]),
    );

    const id = await handler.execute(command(LINE));

    expect(table.rows.has(id)).toBe(true);
  });

  it("un rejeu d'un verdict rendu AVANT le départ rend son id, sans refus", async () => {
    const before = subject();
    const id = await before.handler.execute(command(ORDER_2, "01JQD999999999999999999999"));
    const custody = new FixedOrderCustody(new Map([["ord_2", "departed"]]));
    const after = new RenderQualityCheckHandler(
      new InMemoryChecks(before.table),
      new InMemoryCheckReader(before.table),
      new SealedDayReading(
        new FixedDays(closedDay(DAY, new Date(0), [])),
        sealedAt(new Date(0), ["ord_2"]),
      ),
      new QualityPhotoAttachment(
        new InMemoryUploads(before.table),
        new InMemoryProductionStore(),
        new FixedClock(new Date(0)),
      ),
      custody,
      new RecordingPublisher(),
      new FixedClock(new Date(0)),
      new DirectUnitOfWork(),
    );

    await expect(after.execute(command(ORDER_2, "01JQD999999999999999999999"))).resolves.toBe(id);
  });
});
