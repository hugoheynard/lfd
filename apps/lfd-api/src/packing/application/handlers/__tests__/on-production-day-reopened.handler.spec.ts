import {
  ClosedPlansReader,
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../../production/channels/packing/index.js";
import { PackingListWithdrawal } from "../../../domain/ports/packing-list-withdrawal.js";
import {
  InMemoryResupplies,
  InMemoryResupplyRepository,
} from "../../__tests__/resupply-doubles.js";
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

    await new OnProductionDayReopened(
      withdrawal,
      new ClosedPlans([]),
      new InMemoryResupplies(),
    ).handle(DELIVERY);

    expect(withdrawal.calls).toEqual([{ serviceDay: DAY, orderIds: ["ord_1"] }]);
  });

  it("ne retire rien si la journée est de nouveau arrêtée", async () => {
    const withdrawal = new RecordingWithdrawal();

    await new OnProductionDayReopened(
      withdrawal,
      new ClosedPlans([DAY]),
      new InMemoryResupplies(),
    ).handle(DELIVERY);

    expect(withdrawal.calls).toEqual([]);
  });

  /** Lot R3b : la réouverture retire aussi les fiches de réassort intouchées. */
  it("retire les fiches de réassort intouchées, garde une fiche entamée", async () => {
    const resupplies = new InMemoryResupplies();
    for (const resupplyId of ["rs_1", "rs_2"]) {
      await resupplies.draw({
        serviceDay: DAY,
        resupplyId,
        siteId: "site_village",
        siteLabel: "Le Village",
        name: null,
        drawnAt: CLOSED,
        lines: [{ sku: "CRO", productName: "Croissant", quantity: 6 }],
      });
    }
    const repository = new InMemoryResupplyRepository(resupplies);
    const started = await repository.lock(DAY, "rs_2");
    started?.enterPacked("CRO", 6, { at: CLOSED, by: "staff_lou" });
    if (started) {
      await repository.save(started);
    }
    const delivery = {
      ...DELIVERY,
      payload: new ProductionDayReopenedEvent(
        DAY,
        REOPENED,
        CLOSED,
        ["ord_1"],
        ["rs_1", "rs_2"],
      ).durableFact().payload,
    };

    await new OnProductionDayReopened(
      new RecordingWithdrawal(),
      new ClosedPlans([]),
      resupplies,
    ).handle(delivery);

    expect([...resupplies.rows.keys()]).toEqual([`${DAY}/rs_2`]);
  });
});
