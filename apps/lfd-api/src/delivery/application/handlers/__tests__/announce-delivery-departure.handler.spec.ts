import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import {
  type DeliveryDeparture,
  DeliveryDepartureAnnouncer,
} from "../../../channels/commerce/index.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import { DeliveryRoundDepartedEvent } from "../../../domain/events/delivery-loading.events.js";
import { AnnounceDeliveryDeparture } from "../announce-delivery-departure.handler.js";

/*
 * L'abonné du départ (plan-en-route.md, PL3-D2) : ce qu'il annonce au
 * commerce, et qu'un échec d'annonce ne remonte pas jusqu'au départ.
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

class RecordingAnnouncer extends DeliveryDepartureAnnouncer {
  readonly heard: DeliveryDeparture[] = [];

  constructor(private readonly failure: Error | null = null) {
    super();
  }

  announceDeparture(departure: DeliveryDeparture): Promise<void> {
    this.heard.push(departure);
    return this.failure === null ? Promise.resolve() : Promise.reject(this.failure);
  }
}

/** Garde la tâche suivie, pour l'attendre — et garde le filet d'échec réel. */
class CapturingWork extends BackgroundWork {
  readonly labels: string[] = [];

  override track(task: Promise<void>, label: string): Promise<void> {
    this.labels.push(label);
    return super.track(task, label);
  }
}

describe("AnnounceDeliveryDeparture", () => {
  it("annonce au commerce la tournée, son instant de départ et ses commandes", async () => {
    const announcer = new RecordingAnnouncer();
    const work = new CapturingWork();
    const commit = new HeldAfterCommit();

    new AnnounceDeliveryDeparture(announcer, work, commit).handle(
      new DeliveryRoundDepartedEvent(round(DEPARTED), 4),
    );
    await commit.commit();
    await work.whenIdle();

    expect(announcer.heard).toEqual([
      { roundId: "r_1", departedAt: DEPARTED, orderIds: ["o_1", "o_2"] },
    ]);
    expect(work.labels).toEqual(["announce-delivery-departure"]);
  });

  it("une annonce qui échoue ne remonte pas : le travail de fond l'avale après l'avoir journalisée", async () => {
    const announcer = new RecordingAnnouncer(new Error("mailer en panne"));
    const work = new CapturingWork();
    const commit = new HeldAfterCommit();

    expect(() => {
      new AnnounceDeliveryDeparture(announcer, work, commit).handle(
        new DeliveryRoundDepartedEvent(round(DEPARTED), 4),
      );
    }).not.toThrow();
    await commit.commit();
    await expect(work.whenIdle()).resolves.toBeUndefined();
    expect(announcer.heard).toHaveLength(1);
  });

  it("n'annonce rien pour une tournée sans instant de départ", async () => {
    const announcer = new RecordingAnnouncer();
    const work = new CapturingWork();
    const commit = new HeldAfterCommit();

    new AnnounceDeliveryDeparture(announcer, work, commit).handle(
      new DeliveryRoundDepartedEvent(round(null), 0),
    );
    await commit.commit();
    await work.whenIdle();

    expect(announcer.heard).toEqual([]);
    expect(work.labels).toEqual([]);
  });

  it("n'annonce rien avant la validation du départ, ni jamais si elle échoue", async () => {
    const announcer = new RecordingAnnouncer();
    const work = new CapturingWork();
    const commit = new HeldAfterCommit();

    new AnnounceDeliveryDeparture(announcer, work, commit).handle(
      new DeliveryRoundDepartedEvent(round(DEPARTED), 4),
    );
    await work.whenIdle();
    expect(announcer.heard).toEqual([]);

    commit.discard();
    await commit.commit();
    await work.whenIdle();
    expect(announcer.heard).toEqual([]);
    expect(work.labels).toEqual([]);
  });
});
