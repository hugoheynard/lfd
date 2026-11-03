import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { SavedDays } from "../../__tests__/revision-desk-doubles.js";
import { producibleOrder } from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import { NOTHING_PENDING, ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { PlanArrestRecording } from "../plan-arrest-recording.js";

/**
 * `PlanArrestRecording` — écrire un arrêt et l'annoncer, ou le réannoncer.
 * Les instants sont recopiés dans les faits, jamais comparés à l'horloge.
 */
const DAY = ServiceDay.of("2026-09-08");
const CLOSED_AT = new Date("2026-09-07T18:00:00.000Z");
const REANNOUNCED_AT = new Date("2026-09-07T19:00:00.000Z");

const VILLAGE = {
  resupplyId: "rs_1",
  siteId: "site_village",
  siteLabel: "Le Village",
  name: null,
  servedByTransfer: true,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" as const }],
};

function closedDay(): ProductionDay {
  const day = ProductionDay.open(DAY);
  day.close([producibleOrder(), producibleOrder("ord_2")], new Set<string>(), CLOSED_AT, null, [
    VILLAGE,
  ]);
  return day;
}

function scene(day: ProductionDay) {
  const trace: string[] = [];
  const days = new SavedDays(ProductionDay.open(DAY), trace);
  const durable = new RecordingDurable(trace);
  return { recording: new PlanArrestRecording(days, durable), days, durable, trace, day };
}

describe("écrire un arrêt", () => {
  it("sauve la journée, puis publie l'arrêt, une commande à coliser par commande et un réassort par transfert", async () => {
    const { recording, trace, days, day } = scene(closedDay());

    await recording.record(DAY, day, CLOSED_AT);

    expect(trace).toEqual([
      "save",
      "publish:production.day_closed",
      "publish:production.packing_list_drawn",
      "publish:production.packing_list_drawn",
      "publish:production.resupply_list_drawn",
    ]);
    expect(days.day.isClosed).toBe(true);
  });
});

describe("réannoncer un arrêt", () => {
  it("republie sans rien sauver, sous une clé qui porte l'instant de la réannonce", async () => {
    const { recording, trace, durable, day } = scene(closedDay());

    await recording.republish(DAY, day, CLOSED_AT, REANNOUNCED_AT);

    expect(trace).not.toContain("save");
    expect(durable.facts[0]?.key).toBe(
      `production.day_closed:${DAY.value}:${CLOSED_AT.toISOString()}:reannounced:${REANNOUNCED_AT.toISOString()}`,
    );
  });

  /** Régression gardée (audit du réassort, 2026-11-02, Q6) : un lancement n'arrête pas le plan au sens du dossier. */
  it("se tait sur une journée qu'un lancement « au plus tôt » a ouverte", async () => {
    const day = ProductionDay.open(DAY);
    day.launchResupply(
      VILLAGE,
      { at: CLOSED_AT, staffUserId: "staff-1", name: null },
      NOTHING_PENDING,
    );
    const { recording, durable } = scene(day);

    await recording.republish(DAY, day, CLOSED_AT, REANNOUNCED_AT);

    expect(durable.facts).toEqual([]);
  });
});
