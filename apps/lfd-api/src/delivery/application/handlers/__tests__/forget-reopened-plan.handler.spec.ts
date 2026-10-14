import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ClosedPlansReader,
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
} from "../../../../production/channels/delivery/index.js";
import { DeliveryDayReadiness } from "../../../domain/entities/delivery-day-readiness.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import { InMemoryDeliveryRounds, roundWith } from "../../commands/__tests__/round-doubles.js";
import { RoundsReaderOver } from "../../commands/__tests__/routing-doubles.js";
import { ForgetReopenedPlan } from "../forget-reopened-plan.handler.js";
import { InMemoryDayReadiness } from "./day-readiness-doubles.js";

/** Instants recopiés et comparés entre eux seulement — exception étroite du §5. */
const CLOSED = new Date("2026-10-14T17:00:00.000Z");
const REOPENED = new Date("2026-10-14T19:00:00.000Z");
const NOW = new Date("2026-10-14T19:00:05.000Z");
const DAY = "2026-10-15";

/** Les journées arrêtées, données par le test. */
class ClosedPlans extends ClosedPlansReader {
  constructor(private readonly closed: readonly string[] = []) {
    super();
  }

  closedBetween(from: string, to: string): Promise<readonly string[]> {
    return Promise.resolve(this.closed.filter((day) => from <= day && day <= to));
  }
}

function departed(round: DeliveryRound): DeliveryRound {
  return DeliveryRound.restore({ ...round.toSnapshot(), departedAt: CLOSED });
}

function setup(rounds: InMemoryDeliveryRounds, closed: readonly string[] = []) {
  const days = new InMemoryDayReadiness();
  const ready = DeliveryDayReadiness.start(DAY, CLOSED);
  ready.learnClosure(CLOSED, ["ord_1", "ord_2"], CLOSED);
  days.rows.set(DAY, {
    serviceDay: DAY,
    closedAt: ready.closedAt,
    deliveryOrderIds: ready.deliveryOrderIds,
    createdAt: ready.createdAt,
    updatedAt: ready.updatedAt,
  });
  const handler = new ForgetReopenedPlan(
    new ClosedPlans(closed),
    days,
    new RoundsReaderOver(rounds),
    rounds,
    new FixedClock(NOW),
  );
  return { handler, days };
}

function fact(orderIds: readonly string[]) {
  return {
    eventId: "evt_1",
    type: PRODUCTION_DAY_REOPENED,
    payload: new ProductionDayReopenedEvent(DAY, REOPENED, CLOSED, orderIds).durableFact().payload,
  };
}

describe("ForgetReopenedPlan", () => {
  it("oublie le plan arrêté et sort les commandes du plan des tournées au dépôt", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["ord_1", "ord_9"]));
    const { handler, days } = setup(rounds);

    await handler.handle(fact(["ord_1", "ord_2"]));

    expect(days.rows.get(DAY)).toMatchObject({ closedAt: null, deliveryOrderIds: [] });
    const [round] = rounds.all();
    expect(round?.orderIds).toEqual(["ord_9"]);
  });

  it("laisse une tournée partie telle quelle", async () => {
    const rounds = new InMemoryDeliveryRounds(departed(roundWith("r1", DAY, "v1", ["ord_1"])));
    const { handler } = setup(rounds);

    await handler.handle(fact(["ord_1"]));

    expect(rounds.all()[0]?.orderIds).toEqual(["ord_1"]);
    expect(rounds.saved).toEqual([]);
  });

  it("ne défait rien quand la journée est de nouveau arrêtée (faits dans le désordre)", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["ord_1"]));
    const { handler, days } = setup(rounds, [DAY]);

    await handler.handle(fact(["ord_1"]));

    expect(days.rows.get(DAY)?.closedAt).toEqual(CLOSED);
    expect(rounds.saved).toEqual([]);
  });

  it("est idempotent : un rejeu ne retire rien de plus", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r1", DAY, "v1", ["ord_1"]));
    const { handler } = setup(rounds);

    await handler.handle(fact(["ord_1"]));
    await handler.handle(fact(["ord_1"]));

    expect(rounds.saved).toEqual(["r1"]);
  });
});
