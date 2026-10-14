import {
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
  ProductionDayReopenedPayloadError,
} from "../../../../../production/channels/commerce/index.js";
import { OrderPlanRelease } from "../../../domain/ports/order-plan-release.js";
import { FixedClosedPlans } from "../../commands/__tests__/plan-doubles.js";
import { OnProductionDayReopened } from "../on-production-day-reopened.handler.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const DAY = "2026-10-15";
const CLOSED = new Date("2026-10-14T17:00:00.000Z");
const REOPENED = new Date("2026-10-14T19:00:00.000Z");

interface Release {
  readonly serviceDay: string;
  readonly orderIds: readonly string[];
  readonly closedAt: Date;
}

class RecordingRelease extends OrderPlanRelease {
  readonly released: Release[] = [];

  releaseFromPlan(serviceDay: string, orderIds: readonly string[], closedAt: Date) {
    this.released.push({ serviceDay, orderIds, closedAt });
    return Promise.resolve(orderIds.length);
  }
}

function deliver(payload: Readonly<Record<string, unknown>>, closed: readonly string[] = []) {
  const release = new RecordingRelease();
  const plans = new FixedClosedPlans(closed);
  return {
    release,
    plans,
    run: () =>
      new OnProductionDayReopened(release, plans).handle({
        eventId: "evt_1",
        type: PRODUCTION_DAY_REOPENED,
        payload,
      }),
  };
}

const PAYLOAD = new ProductionDayReopenedEvent(DAY, REOPENED, CLOSED, [
  "ord_1",
  "ord_2",
]).durableFact().payload;

describe("OnProductionDayReopened", () => {
  it("rend au client les commandes confirmées par l'arrêt défait, et elles seules", async () => {
    const { release, plans, run } = deliver(PAYLOAD);

    await run();

    expect(plans.asked).toEqual([{ from: DAY, to: DAY }]);
    expect(release.released).toEqual([
      { serviceDay: DAY, orderIds: ["ord_1", "ord_2"], closedAt: CLOSED },
    ]);
  });

  it("ne fait rien si la journée est de nouveau arrêtée (faits dans le désordre)", async () => {
    const { release, run } = deliver(PAYLOAD, [DAY]);

    await run();

    expect(release.released).toEqual([]);
  });

  it("refuse un fait illisible, qui finit en message mort visible", async () => {
    const { run } = deliver({ serviceDay: DAY });

    await expect(run()).rejects.toBeInstanceOf(ProductionDayReopenedPayloadError);
  });
});
