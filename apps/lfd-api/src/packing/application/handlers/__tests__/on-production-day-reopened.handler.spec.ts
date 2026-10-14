import {
  ClosedPlansReader,
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../../production/channels/packing/index.js";
import { PackingListWithdrawal } from "../../../domain/ports/packing-list-withdrawal.js";
import { OnProductionDayReopened } from "../on-production-day-reopened.handler.js";

/** Instants recopiés, jamais comparés à l'horloge — exception étroite du §5. */
const DAY = "2026-10-15";
const CLOSED = new Date("2026-10-14T17:00:00.000Z");
const REOPENED = new Date("2026-10-14T19:00:00.000Z");

class ClosedPlans extends ClosedPlansReader {
  constructor(private readonly closed: readonly string[]) {
    super();
  }

  closedBetween(from: string, to: string): Promise<readonly string[]> {
    return Promise.resolve(this.closed.filter((day) => from <= day && day <= to));
  }
}

class RecordingWithdrawal extends PackingListWithdrawal {
  readonly calls: { readonly serviceDay: string; readonly orderIds: readonly string[] }[] = [];

  withdrawUntouched(serviceDay: string, orderIds: readonly string[]): Promise<number> {
    this.calls.push({ serviceDay, orderIds });
    return Promise.resolve(orderIds.length);
  }
}

const DELIVERY = {
  eventId: "evt_1",
  type: PRODUCTION_DAY_REOPENED,
  payload: new ProductionDayReopenedEvent(DAY, REOPENED, CLOSED, ["ord_1"]).durableFact().payload,
};

describe("OnProductionDayReopened (colisage)", () => {
  it("retire de la liste du jour les commandes du plan défait", async () => {
    const withdrawal = new RecordingWithdrawal();

    await new OnProductionDayReopened(withdrawal, new ClosedPlans([])).handle(DELIVERY);

    expect(withdrawal.calls).toEqual([{ serviceDay: DAY, orderIds: ["ord_1"] }]);
  });

  it("ne retire rien si la journée est de nouveau arrêtée", async () => {
    const withdrawal = new RecordingWithdrawal();

    await new OnProductionDayReopened(withdrawal, new ClosedPlans([DAY])).handle(DELIVERY);

    expect(withdrawal.calls).toEqual([]);
  });
});
