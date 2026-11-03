import { InMemoryBatches } from "../../__tests__/batch-doubles.js";
import { RecordingDurable } from "../../__tests__/handoff-doubles.js";
import { SavedDays } from "../../__tests__/revision-desk-doubles.js";
import { producibleOrder } from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { RetakeRecording } from "../retake-recording.js";

/** `RetakeRecording` — écrire un retirage et annoncer ses seules arrivées. */
const DAY = ServiceDay.of("2026-09-08");
/** Recopiés dans les faits, jamais comparés à l'horloge. */
const CLOSED_AT = new Date("2026-09-07T18:00:00.000Z");
const RETAKEN_AT = new Date("2026-09-08T04:00:00.000Z");

function retaken() {
  const day = ProductionDay.open(DAY);
  day.close([producibleOrder()], new Set<string>(), CLOSED_AT, null);
  const before = day.orders;
  const inherited = day.materialize();
  const absorbed = day.retake(
    [producibleOrder(), producibleOrder("ord_2")],
    new Set<string>(),
    RETAKEN_AT,
    "staff-1",
    null,
  );
  return { day, before, inherited, absorbed };
}

describe("écrire un retirage", () => {
  it("écrit les fournées héritées, puis la journée, puis la liste des seules arrivées et le fait du retirage", async () => {
    const trace: string[] = [];
    const durable = new RecordingDurable(trace);
    const recording = new RetakeRecording(
      new SavedDays(ProductionDay.open(DAY), trace),
      new InMemoryBatches(trace),
      durable,
    );
    const { day, before, inherited, absorbed } = retaken();

    await recording.record({ day: DAY, before, current: day, inherited, at: RETAKEN_AT, absorbed });

    expect(trace).toEqual([
      "save",
      "publish:production.packing_list_drawn",
      "publish:production.day_retaken",
    ]);
    expect(durable.facts[0]?.key).toBe(`production.packing_list_drawn:${DAY.value}:ord_2`);
    expect(durable.facts[1]?.payload).toMatchObject({
      absorbed: 1,
      shipments: [{ orderId: "ord_2", rank: 1 }],
    });
  });
});
