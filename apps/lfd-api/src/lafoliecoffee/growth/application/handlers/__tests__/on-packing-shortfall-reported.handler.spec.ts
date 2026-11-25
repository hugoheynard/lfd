import { JOURNAL_FACTS } from "@lfd/contracts/journal-facts";

import {
  PackingShortfallPayloadError,
  PackingShortfallReportedEvent,
} from "../../../../../packing/channels/commerce/index.js";
import type { DurableDelivery } from "../../../../../platform/outbox/durable-event.js";
import { RecordingActivityRecorder } from "../../../domain/ports/__tests__/recording-activity-recorder.js";
import { OnPackingShortfallReportedActivity } from "../on-packing-shortfall-reported.handler.js";
import { TableActors } from "./order-fact-doubles.js";

/**
 * `packing.shortfall_reported` → l'historique de la commande (plan du
 * reliquat, § 5 ter, B4b.3) : chaque signal a sa ligne, le suivant n'écrase
 * pas le précédent. Instants comparés entre eux seulement.
 */
const FIRST_AT = new Date(1_000);
const SECOND_AT = new Date(2_000);

function handler() {
  const recorder = new RecordingActivityRecorder();
  const run = new OnPackingShortfallReportedActivity(
    recorder,
    new TableActors(new Map([["fiche_1", "Cécile Martin"]])),
  );
  return { recorder, run };
}

function event(at: Date, reportedBy = "fiche_1"): PackingShortfallReportedEvent {
  return new PackingShortfallReportedEvent("order_9", 1, "ORD-9", at, reportedBy, [
    { sku: "CRO", due: 3, packed: 1 },
  ]);
}

function delivery(payload: Readonly<Record<string, unknown>>): DurableDelivery {
  return { eventId: "evt_1", type: "packing.shortfall_reported", payload };
}

describe("OnPackingShortfallReportedActivity", () => {
  it("écrit le signal sous la commande, à l'instant du geste, en nommant qui a signalé", async () => {
    const { recorder, run } = handler();

    await run.handle(delivery(event(FIRST_AT).durableFact().payload));

    const record = recorder.records[0];
    expect(record).toMatchObject({
      type: "order.shortfall_reported",
      subjectType: "order",
      subjectId: "order_9",
      occurredAt: FIRST_AT,
      idempotencyKey: `order.shortfall_reported:order_9:${FIRST_AT.toISOString()}`,
      payload: {
        subjectLabel: "ORD-9",
        reportedBy: { id: "fiche_1", name: "Cécile Martin" },
        reportedAt: FIRST_AT.toISOString(),
        rank: 1,
        lines: [{ sku: "CRO", due: 3, packed: 1 }],
      },
    });
    expect(
      JOURNAL_FACTS["order.shortfall_reported"].payload.safeParse(record?.payload).success,
    ).toBe(true);
  });

  it("deux signaux, deux lignes : le second n'écrase pas le premier", async () => {
    const { recorder, run } = handler();

    await run.handle(delivery(event(FIRST_AT).durableFact().payload));
    await run.handle(delivery(event(SECOND_AT).durableFact().payload));

    expect(recorder.records.map((record) => record.idempotencyKey)).toEqual([
      `order.shortfall_reported:order_9:${FIRST_AT.toISOString()}`,
      `order.shortfall_reported:order_9:${SECOND_AT.toISOString()}`,
    ]);
  });

  it("une fiche que l'annuaire ne nomme plus se cite par son id", async () => {
    const { recorder, run } = handler();

    await run.handle(delivery(event(FIRST_AT, "fiche_x").durableFact().payload));

    expect(recorder.records[0]?.payload).toMatchObject({ reportedBy: "fiche_x" });
  });

  it("une charge illisible n'écrit rien et le dit", async () => {
    const { recorder, run } = handler();

    await expect(
      run.handle(delivery({ ...event(FIRST_AT).durableFact().payload, lines: [] })),
    ).rejects.toThrow(PackingShortfallPayloadError);
    expect(recorder.records).toEqual([]);
  });
});
