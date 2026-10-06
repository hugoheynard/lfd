import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { DepartedOrdersAnnouncer } from "../../../channels/handover/index.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import { DeliveryRoundDepartedEvent } from "../../../domain/events/delivery-loading.events.js";
import { HandDepartedOrdersOver } from "../hand-departed-orders-over.handler.js";

/*
 * La garde passe au livreur (a-la-porte.md, BQ) : ce que le départ
 * annonce au retrait, et seulement après sa validation.
 */

// Des instants comparés entre eux seulement, jamais à l'horloge.
const AT = new Date(0);
const DEPARTED = new Date(60_000);

function round(departedAt: Date | null): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: "2030-03-12",
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 3,
    departedAt,
    driverStaffId: null,
    createdAt: AT,
    updatedAt: AT,
    stops: [
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { id: "s_2", orderId: "o_2", position: 2, closedAt: null },
    ],
  });
}

class RecordingDepartures extends DepartedOrdersAnnouncer {
  readonly heard: { readonly orderIds: readonly string[]; readonly at: Date }[] = [];

  constructor(private readonly failure: Error | null = null) {
    super();
  }

  ordersDeparted(orderIds: readonly string[], at: Date): Promise<void> {
    this.heard.push({ orderIds, at });
    return this.failure === null ? Promise.resolve() : Promise.reject(this.failure);
  }
}

function subscriber(announcer: RecordingDepartures) {
  const work = new BackgroundWork();
  const commit = new HeldAfterCommit();
  return { handler: new HandDepartedOrdersOver(announcer, work, commit), work, commit };
}

describe("HandDepartedOrdersOver", () => {
  it("annonce au retrait les commandes parties et l'instant du départ, après la validation", async () => {
    const announcer = new RecordingDepartures();
    const { handler, work, commit } = subscriber(announcer);

    handler.handle(new DeliveryRoundDepartedEvent(round(DEPARTED), 4));
    await work.whenIdle();
    expect(announcer.heard).toEqual([]);

    await commit.commit();
    await work.whenIdle();
    expect(announcer.heard).toEqual([{ orderIds: ["o_1", "o_2"], at: DEPARTED }]);
  });

  it("un départ dont la validation échoue n'annonce rien", async () => {
    const announcer = new RecordingDepartures();
    const { handler, work, commit } = subscriber(announcer);

    handler.handle(new DeliveryRoundDepartedEvent(round(DEPARTED), 4));
    commit.discard();
    await commit.commit();
    await work.whenIdle();

    expect(announcer.heard).toEqual([]);
  });

  it("une annonce qui échoue ne remonte pas jusqu'au départ", async () => {
    const announcer = new RecordingDepartures(new Error("base indisponible"));
    const { handler, work, commit } = subscriber(announcer);

    handler.handle(new DeliveryRoundDepartedEvent(round(DEPARTED), 4));
    await commit.commit();

    await expect(work.whenIdle()).resolves.toBeUndefined();
    expect(announcer.heard).toHaveLength(1);
  });

  it("une tournée sans instant de départ n'annonce rien", async () => {
    const announcer = new RecordingDepartures();
    const { handler, work, commit } = subscriber(announcer);

    handler.handle(new DeliveryRoundDepartedEvent(round(null), 0));
    await commit.commit();
    await work.whenIdle();

    expect(announcer.heard).toEqual([]);
  });
});
