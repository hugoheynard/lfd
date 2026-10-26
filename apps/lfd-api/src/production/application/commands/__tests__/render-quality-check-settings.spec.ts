import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { QualityControlSettings } from "../../../domain/entities/quality-control-settings.js";
import { QualityControlDisabledError } from "../../../domain/errors/quality-control-settings-errors.js";
import type { QualityTargetRequest } from "../../../domain/services/quality-check-scope.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { InMemoryQualityControlSettings } from "../../__tests__/quality-control-settings-doubles.js";
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
import { sealedAt } from "../../__tests__/station-doubles.js";
import { QualityPhotoAttachment } from "../../services/quality-photo-attachment.service.js";
import { SealedDayReading } from "../../services/sealed-day-reading.service.js";
import { RenderQualityCheckCommand } from "../render-quality-check.command.js";
import { RenderQualityCheckHandler } from "../render-quality-check.handler.js";

/**
 * Le verdict refusé à un niveau désactivé dans Réglages › Commandes (décision
 * de Hugo, 2026-10-26). La journée de service n'est jamais comparée à l'horloge.
 */
const DAY = ServiceDay.of("2026-10-01");
const LINE: QualityTargetRequest = { kind: "line", sku: CROISSANT };
const ORDER_2: QualityTargetRequest = { kind: "order", orderId: "ord_2" };

function subject(settings: InMemoryQualityControlSettings) {
  const clock = new FixedClock(new Date());
  const table = new CheckTable();
  const store = new InMemoryProductionStore();
  const events = new RecordingPublisher();
  const handler = new RenderQualityCheckHandler(
    new InMemoryChecks(table),
    new InMemoryCheckReader(table),
    new SealedDayReading(
      new FixedDays(closedDay(DAY, clock.now(), [])),
      sealedAt(clock.now(), ["ord_2"]),
    ),
    new QualityPhotoAttachment(new InMemoryUploads(table), store, clock),
    new FixedOrderCustody(),
    settings.reader(),
    events,
    clock,
    new DirectUnitOfWork(),
  );
  return { table, store, events, handler };
}

function command(target: QualityTargetRequest, id: string): RenderQualityCheckCommand {
  return new RenderQualityCheckCommand(id, DAY.value, target, "ok", null, [], "staff_sup");
}

describe("RenderQualityCheckHandler — le réglage de Réglages › Commandes", () => {
  it("refuse un verdict de ligne par défaut : le contrôle au fournil est désactivé", async () => {
    const { handler, table, store, events } = subject(new InMemoryQualityControlSettings());

    await expect(handler.execute(command(LINE, "01JQS000000000000000000001"))).rejects.toThrow(
      QualityControlDisabledError,
    );
    expect(table.rows.size).toBe(0);
    expect(store.objects.size).toBe(0);
    expect(events.traced).toEqual([]);
  });

  it("accepte un verdict de commande colisée par défaut", async () => {
    const { handler, table } = subject(new InMemoryQualityControlSettings());

    const id = await handler.execute(command(ORDER_2, "01JQS000000000000000000002"));

    expect(table.rows.has(id)).toBe(true);
  });

  it("refuse un verdict de commande quand le colisage est désactivé", async () => {
    const settings = new InMemoryQualityControlSettings(
      QualityControlSettings.of({ lineChecks: true, orderChecks: false }),
    );
    const { handler, table } = subject(settings);

    await expect(handler.execute(command(ORDER_2, "01JQS000000000000000000003"))).rejects.toThrow(
      /au colisage.*Réglages › Commandes/,
    );
    expect(table.rows.size).toBe(0);
  });

  it("un rejeu d'un verdict rendu AVANT la désactivation rend son id, sans rien écrire", async () => {
    const settings = InMemoryQualityControlSettings.allOpen();
    const { handler, table, events } = subject(settings);
    const id = await handler.execute(command(LINE, "01JQS000000000000000000004"));
    settings.posed = QualityControlSettings.defaults();

    await expect(handler.execute(command(LINE, id))).resolves.toBe(id);
    expect(table.rows.size).toBe(1);
    expect(events.factTypes()).toEqual(["production_quality.checked"]);
  });
});
