import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DeliveryRoundStaleError,
  InvalidStopOrderError,
  VehicleInactiveOnDayError,
} from "../../../domain/errors/delivery-round-errors.js";
import { MoveDeliveryStopCommand } from "../move-delivery-stop.command.js";
import { MoveDeliveryStopHandler } from "../move-delivery-stop.handler.js";
import { RemoveDeliveryStopCommand } from "../remove-delivery-stop.command.js";
import { RemoveDeliveryStopHandler } from "../remove-delivery-stop.handler.js";
import { ReorderDeliveryRoundCommand } from "../reorder-delivery-round.command.js";
import { ReorderDeliveryRoundHandler } from "../reorder-delivery-round.handler.js";
import { InMemoryVehicles, vehicle } from "./fleet-doubles.js";
import {
  deliveryOn,
  FixedDeliveryOrders,
  InMemoryDeliveryRounds,
  roundWith,
} from "./round-doubles.js";

// Des jours comparés entre eux et à des retraits écrits ici — jamais à l'horloge.
const DAY = "2030-03-12";
const ORDERS = new FixedDeliveryOrders(
  ["o_1", "o_2", "o_3"].map((orderId) => deliveryOn(orderId, DAY)),
);

function tools() {
  return {
    clock: new FixedClock(new Date(0)),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

describe("ReorderDeliveryRoundHandler", () => {
  function reorder(rounds: InMemoryDeliveryRounds) {
    const { clock, events, uow } = tools();
    return { handler: new ReorderDeliveryRoundHandler(rounds, ORDERS, clock, events, uow), events };
  }

  it("range, et trace l'ordre avant ET après", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1", "o_2"]));
    const { handler, events } = reorder(rounds);

    await handler.execute(
      new ReorderDeliveryRoundCommand("r_1", { stopIds: ["r_1_s2", "r_1_s1"], version: 1 }),
    );

    expect(rounds.stored("r_1")?.orderIds).toEqual(["o_2", "o_1"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      before: [
        { id: "o_1", name: "CMD-o_1" },
        { id: "o_2", name: "CMD-o_2" },
      ],
      after: [
        { id: "o_2", name: "CMD-o_2" },
        { id: "o_1", name: "CMD-o_1" },
      ],
    });
  });

  it("un ordre identique n'écrit rien, pas même au journal (C7)", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1", "o_2"]));
    const { handler, events } = reorder(rounds);

    await handler.execute(
      new ReorderDeliveryRoundCommand("r_1", { stopIds: ["r_1_s1", "r_1_s2"], version: 1 }),
    );

    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("refuse ce qui n'est pas une permutation exacte (I2)", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1", "o_2"]));
    const { handler } = reorder(rounds);

    await expect(
      handler.execute(new ReorderDeliveryRoundCommand("r_1", { stopIds: ["r_1_s1"], version: 1 })),
    ).rejects.toThrow(InvalidStopOrderError);
  });
});

describe("RemoveDeliveryStopHandler", () => {
  it("retire, libère la commande, et la cite", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1", "o_2"]));
    const { clock, events, uow } = tools();

    await new RemoveDeliveryStopHandler(rounds, ORDERS, clock, events, uow).execute(
      new RemoveDeliveryStopCommand("r_1", "r_1_s1", { version: 1 }),
    );

    expect(rounds.stored("r_1")?.orderIds).toEqual(["o_2"]);
    expect(await rounds.liveHolderOf("o_1")).toBeNull();
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      order: { id: "o_1", name: "CMD-o_1" },
    });
  });

  it("cite par son seul id une commande que le commerce ne connaît plus", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_gone"]));
    const { clock, events, uow } = tools();

    await new RemoveDeliveryStopHandler(rounds, ORDERS, clock, events, uow).execute(
      new RemoveDeliveryStopCommand("r_1", "r_1_s1", { version: 1 }),
    );

    expect(events.traced[0]?.journalFact().payload).toMatchObject({ order: "o_gone" });
  });
});

describe("MoveDeliveryStopHandler — I7", () => {
  function move(rounds: InMemoryDeliveryRounds, vehicles?: InMemoryVehicles) {
    const { clock, events, uow } = tools();
    const fleet =
      vehicles ??
      new InMemoryVehicles(
        vehicle("v_1", "Kangoo", "AB-123-CD"),
        vehicle("v_2", "Trafic", "EF-456-GH"),
      );
    return {
      handler: new MoveDeliveryStopHandler(rounds, fleet, ORDERS, clock, events, uow),
      events,
    };
  }

  it("écrit les deux tournées ENSEMBLE, et UN seul fait (C7)", async () => {
    const rounds = new InMemoryDeliveryRounds(
      roundWith("r_1", DAY, "v_1", ["o_1", "o_2"]),
      roundWith("r_2", DAY, "v_2", ["o_3"]),
    );
    const { handler, events } = move(rounds);

    await handler.execute(
      new MoveDeliveryStopCommand("r_1", "r_1_s1", {
        toRoundId: "r_2",
        fromVersion: 1,
        toVersion: 1,
      }),
    );

    expect(rounds.moves).toEqual([["r_1", "r_2"]]);
    expect(rounds.saved).toEqual([]);
    expect(rounds.stored("r_1")?.orderIds).toEqual(["o_2"]);
    expect(rounds.stored("r_2")?.orderIds).toEqual(["o_3", "o_1"]);
    expect(events.factTypes()).toEqual(["delivery_round.stop_moved"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectId: "r_2",
      payload: {
        order: { id: "o_1", name: "CMD-o_1" },
        from: { round: { id: "r_1", name: "Véhicule v_1" }, passage: 1 },
        position: 2,
      },
    });
  });

  it("refuse si l'une des deux versions est périmée", async () => {
    const rounds = new InMemoryDeliveryRounds(
      roundWith("r_1", DAY, "v_1", ["o_1"]),
      roundWith("r_2", DAY, "v_2", []),
    );
    const { handler } = move(rounds);

    await expect(
      handler.execute(
        new MoveDeliveryStopCommand("r_1", "r_1_s1", {
          toRoundId: "r_2",
          fromVersion: 1,
          toVersion: 7,
        }),
      ),
    ).rejects.toThrow(DeliveryRoundStaleError);
    expect(rounds.moves).toEqual([]);
  });

  it("refuse vers un véhicule retiré avant ce jour (C14)", async () => {
    const retired = vehicle("v_2", "Trafic", "EF-456-GH");
    retired.retire(new Date("2030-03-10T10:00:00.000Z"));
    const rounds = new InMemoryDeliveryRounds(
      roundWith("r_1", DAY, "v_1", ["o_1"]),
      roundWith("r_2", DAY, "v_2", []),
    );
    const { handler } = move(
      rounds,
      new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"), retired),
    );

    await expect(
      handler.execute(
        new MoveDeliveryStopCommand("r_1", "r_1_s1", {
          toRoundId: "r_2",
          fromVersion: 1,
          toVersion: 1,
        }),
      ),
    ).rejects.toThrow(VehicleInactiveOnDayError);
  });
});
