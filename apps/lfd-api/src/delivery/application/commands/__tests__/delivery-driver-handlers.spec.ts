import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  authorsKnownAs,
  FixedStaffAuthorDirectory,
} from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { FixedStaffPermissionHolders } from "../../../../staff/directory/domain/__tests__/fixed-staff-permission-holders.js";
import { DeliveryRound } from "../../../domain/entities/delivery-round.js";
import {
  DriverWithoutAccessError,
  DriverWithoutDoorstepError,
} from "../../../domain/errors/delivery-driver-errors.js";
import { DeliveryRoundDepartedError } from "../../../domain/errors/delivery-loading-errors.js";
import { DeliveryRoundStaleError } from "../../../domain/errors/delivery-round-errors.js";
import { AssignDeliveryDriverCommand } from "../assign-delivery-driver.command.js";
import { AssignDeliveryDriverHandler } from "../assign-delivery-driver.handler.js";
import { UnassignDeliveryDriverCommand } from "../unassign-delivery-driver.command.js";
import { UnassignDeliveryDriverHandler } from "../unassign-delivery-driver.handler.js";
import { InMemoryDeliveryRounds, roundWith } from "./round-doubles.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);

const PAUL = { staffUserId: "staff_paul", firstName: "Paul", lastName: "Roux" };
const MARC = { staffUserId: "staff_marc", firstName: "Marc", lastName: "Blanc" };

/** Paul tient les deux droits d'un livreur ; Marc ne fait que conduire ; personne d'autre. */
const HOLDERS = () =>
  new FixedStaffPermissionHolders(
    new Map([
      ["delivery_driving:write", [PAUL, MARC]],
      ["delivery_doorstep:write", [PAUL]],
    ]),
  );

const DIRECTORY = () =>
  new FixedStaffAuthorDirectory(
    new Map([
      ...authorsKnownAs({ ...PAUL }, "staff_paul"),
      ...authorsKnownAs(
        { staffUserId: "staff_ancien", firstName: "Jean", lastName: "Ancien" },
        "staff_ancien",
      ),
    ]),
  );

function withDriver(round: DeliveryRound, driverStaffId: string | null): DeliveryRound {
  return DeliveryRound.restore({ ...round.toSnapshot(), driverStaffId });
}

describe("AssignDeliveryDriverHandler — MT-D2 v2", () => {
  function assign(round = roundWith("r_1", DAY, "v_1", ["o_1"])) {
    const rounds = new InMemoryDeliveryRounds(round);
    const events = new RecordingPublisher();
    const holders = HOLDERS();
    const handler = new AssignDeliveryDriverHandler(
      rounds,
      holders,
      DIRECTORY(),
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
    return { handler, rounds, events, holders };
  }

  it("affecte un livreur qui tient les deux droits effectifs, et le trace par son nom", async () => {
    const { handler, rounds, events, holders } = assign();

    await handler.execute(
      new AssignDeliveryDriverCommand("r_1", { staffUserId: "staff_paul", version: 1 }),
    );

    expect(rounds.stored("r_1")?.driverStaffId).toBe("staff_paul");
    expect(holders.asked).toEqual(["delivery_driving:write", "delivery_doorstep:write"]);
    expect(events.traced[0]?.journalFact()).toEqual({
      type: "delivery_round.driver_assigned",
      subjectType: "delivery_round",
      subjectId: "r_1",
      payload: {
        subjectLabel: "Véhicule v_1",
        day: DAY,
        passage: 1,
        driver: { id: "staff_paul", name: "Paul Roux" },
        previous: null,
      },
    });
  });

  it("nomme celui qu'il remplace", async () => {
    const { handler, events } = assign(
      withDriver(roundWith("r_1", DAY, "v_1", ["o_1"]), "staff_ancien"),
    );

    await handler.execute(
      new AssignDeliveryDriverCommand("r_1", { staffUserId: "staff_paul", version: 1 }),
    );

    expect(events.traced[0]?.journalFact().payload["previous"]).toEqual({
      id: "staff_ancien",
      name: "Jean Ancien",
    });
  });

  it("refuse une personne sans le droit — la clé du rôle n'y suffit pas —, sans rien écrire", async () => {
    const { handler, rounds, events } = assign();

    await expect(
      handler.execute(
        new AssignDeliveryDriverCommand("r_1", { staffUserId: "staff_comptoir", version: 1 }),
      ),
    ).rejects.toThrow(DriverWithoutAccessError);
    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  /**
   * Régression (audit 2026-10-07, B8) : l'affectation ne lisait que
   * `delivery_driving:write`. Un conducteur sans `delivery_doorstep` était
   * affecté, chargeait, partait — puis prenait 403 à chaque geste à la porte,
   * sans pouvoir terminer sa tournée, et rien ne l'avait dit.
   */
  it("🔴 refuse un conducteur sans les gestes à la porte, en nommant le droit, sans rien écrire", async () => {
    const { handler, rounds, events } = assign();

    const refused = handler.execute(
      new AssignDeliveryDriverCommand("r_1", { staffUserId: "staff_marc", version: 1 }),
    );

    await expect(refused).rejects.toThrow(DriverWithoutDoorstepError);
    await expect(refused).rejects.toThrow(/mais pas « Gestes à la porte »/u);
    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("refuse une version périmée", async () => {
    const { handler } = assign();

    await expect(
      handler.execute(
        new AssignDeliveryDriverCommand("r_1", { staffUserId: "staff_paul", version: 7 }),
      ),
    ).rejects.toThrow(DeliveryRoundStaleError);
  });

  it("refuse une tournée partie", async () => {
    const departed = DeliveryRound.restore({
      ...roundWith("r_1", DAY, "v_1", ["o_1"]).toSnapshot(),
      departedAt: NOW,
    });
    const { handler } = assign(departed);

    await expect(
      handler.execute(
        new AssignDeliveryDriverCommand("r_1", { staffUserId: "staff_paul", version: 1 }),
      ),
    ).rejects.toThrow(DeliveryRoundDepartedError);
  });

  it("réaffecter le même livreur n'écrit rien et ne trace rien", async () => {
    const { handler, rounds, events } = assign(
      withDriver(roundWith("r_1", DAY, "v_1", ["o_1"]), "staff_paul"),
    );

    await handler.execute(
      new AssignDeliveryDriverCommand("r_1", { staffUserId: "staff_paul", version: 1 }),
    );

    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});

describe("UnassignDeliveryDriverHandler — MT-D2", () => {
  function unassign(round: DeliveryRound) {
    const rounds = new InMemoryDeliveryRounds(round);
    const events = new RecordingPublisher();
    const handler = new UnassignDeliveryDriverHandler(
      rounds,
      DIRECTORY(),
      new FixedClock(NOW),
      events,
      new DirectUnitOfWork(),
    );
    return { handler, rounds, events };
  }

  it("retire le livreur — même privé du droit, c'est le geste de sortie — et le trace", async () => {
    const { handler, rounds, events } = unassign(
      withDriver(roundWith("r_1", DAY, "v_1", ["o_1"]), "staff_ancien"),
    );

    await handler.execute(new UnassignDeliveryDriverCommand("r_1", { version: 1 }));

    expect(rounds.stored("r_1")?.driverStaffId).toBeNull();
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "delivery_round.driver_unassigned",
      payload: { previous: { id: "staff_ancien", name: "Jean Ancien" } },
    });
  });

  it("une tournée sans livreur : rien d'écrit, rien de tracé", async () => {
    const { handler, rounds, events } = unassign(roundWith("r_1", DAY, "v_1", ["o_1"]));

    await handler.execute(new UnassignDeliveryDriverCommand("r_1", { version: 1 }));

    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});
