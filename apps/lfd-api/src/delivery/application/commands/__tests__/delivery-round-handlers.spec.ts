import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  DeliveryRoundStaleError,
  OrderAlreadyInRoundError,
  OrderNotAssignableError,
  VehicleInactiveOnDayError,
} from "../../../domain/errors/delivery-round-errors.js";
import { AssignDeliveryStopCommand } from "../assign-delivery-stop.command.js";
import { AssignDeliveryStopHandler } from "../assign-delivery-stop.handler.js";
import { OpenDeliveryRoundCommand } from "../open-delivery-round.command.js";
import { OpenDeliveryRoundHandler } from "../open-delivery-round.handler.js";
import { InMemoryVehicles, vehicle } from "./fleet-doubles.js";
import { FixedBroughtBackOrders } from "./brought-back-doubles.js";
import {
  deliveryOn,
  FixedDeliveryOrders,
  InMemoryDeliveryRounds,
  roundWith,
} from "./round-doubles.js";

// Des jours comparés entre eux et à des retraits écrits ici — jamais à l'horloge.
const DAY = "2030-03-12";
const NOW = new Date(0);

function tools() {
  return {
    ids: new FixedIdGenerator("id"),
    clock: new FixedClock(NOW),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  };
}

describe("OpenDeliveryRoundHandler", () => {
  function open(rounds: InMemoryDeliveryRounds, vehicles: InMemoryVehicles) {
    const { ids, clock, events, uow } = tools();
    const handler = new OpenDeliveryRoundHandler(rounds, vehicles, ids, clock, events, uow);
    return { handler, events };
  }

  it("ouvre le passage 1, puis le passage 2 du même véhicule (Q13), et le trace", async () => {
    const rounds = new InMemoryDeliveryRounds();
    const { handler, events } = open(
      rounds,
      new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD")),
    );

    const first = await handler.execute(
      new OpenDeliveryRoundCommand({ day: DAY, vehicleId: "v_1" }),
    );
    const second = await handler.execute(
      new OpenDeliveryRoundCommand({ day: DAY, vehicleId: "v_1" }),
    );

    expect([rounds.stored(first)?.passage, rounds.stored(second)?.passage]).toEqual([1, 2]);
    expect(events.factTypes()).toEqual(["delivery_round.opened", "delivery_round.opened"]);
    expect(events.traced[1]?.journalFact().payload).toEqual({
      subjectLabel: "Kangoo",
      day: DAY,
      passage: 2,
    });
  });

  it("refuse un véhicule retiré avant ce jour, sans rien écrire", async () => {
    const retired = vehicle("v_1", "Kangoo", "AB-123-CD");
    retired.retire(new Date("2030-03-10T10:00:00.000Z"));
    const rounds = new InMemoryDeliveryRounds();
    const { handler, events } = open(rounds, new InMemoryVehicles(retired));

    await expect(
      handler.execute(new OpenDeliveryRoundCommand({ day: DAY, vehicleId: "v_1" })),
    ).rejects.toThrow(VehicleInactiveOnDayError);
    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });
});

describe("AssignDeliveryStopHandler", () => {
  function assign(
    rounds: InMemoryDeliveryRounds,
    orders: FixedDeliveryOrders,
    vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD")),
    broughtBack = new FixedBroughtBackOrders(),
  ) {
    const { ids, clock, events, uow } = tools();
    const handler = new AssignDeliveryStopHandler(
      rounds,
      vehicles,
      orders,
      broughtBack,
      ids,
      clock,
      events,
      uow,
    );
    return { handler, events };
  }

  it("ajoute en dernier, rend l'arrêt, et cite la commande par son numéro", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"]));
    const { handler, events } = assign(rounds, new FixedDeliveryOrders([deliveryOn("o_2", DAY)]));

    const stopId = await handler.execute(
      new AssignDeliveryStopCommand("r_1", { orderId: "o_2", version: 1 }),
    );

    expect(stopId).toBe("id_000001");
    expect(rounds.stored("r_1")?.orderIds).toEqual(["o_1", "o_2"]);
    expect(rounds.stored("r_1")?.version).toBe(2);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      order: { id: "o_2", name: "CMD-o_2" },
      position: 2,
    });
  });

  it("refuse une version périmée, sans rien écrire", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", []));
    const { handler } = assign(rounds, new FixedDeliveryOrders([deliveryOn("o_1", DAY)]));

    await expect(
      handler.execute(new AssignDeliveryStopCommand("r_1", { orderId: "o_1", version: 0 })),
    ).rejects.toThrow(DeliveryRoundStaleError);
    expect(rounds.saved).toEqual([]);
  });

  it.each([
    ["annulée", deliveryOn("o_1", DAY, { status: "cancelled" }), /annulée/u],
    ["passée en retrait", deliveryOn("o_1", DAY, { delivery: false }), /retrait/u],
    ["d'un autre jour", deliveryOn("o_1", "2030-03-13"), /pas à livrer ce jour-là/u],
  ])("refuse une commande %s", async (_label, order, message) => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", []));
    const { handler } = assign(rounds, new FixedDeliveryOrders([order]));
    const assigning = handler.execute(
      new AssignDeliveryStopCommand("r_1", { orderId: "o_1", version: 1 }),
    );

    await expect(assigning).rejects.toThrow(OrderNotAssignableError);
    await expect(assigning).rejects.toThrow(message);
  });

  it("une commande RAPPORTÉE entre dans une tournée d'un autre jour, sa date inchangée (RL1)", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", []));
    const brought = new FixedBroughtBackOrders([
      { orderId: "o_1", broughtBackAt: new Date("2030-03-11T15:00:00.000Z") },
    ]);
    const orders = new FixedDeliveryOrders([deliveryOn("o_1", "2030-03-11")]);
    const { handler } = assign(rounds, orders, undefined, brought);

    await handler.execute(new AssignDeliveryStopCommand("r_1", { orderId: "o_1", version: 1 }));

    expect(rounds.stored("r_1")?.orderIds).toEqual(["o_1"]);
    expect((await orders.byIds(["o_1"]))[0]?.day).toBe("2030-03-11");
  });

  it("une commande rapportée PUIS annulée reste refusée (RL1)", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", []));
    const brought = new FixedBroughtBackOrders([
      { orderId: "o_1", broughtBackAt: new Date("2030-03-11T15:00:00.000Z") },
    ]);
    const orders = new FixedDeliveryOrders([
      deliveryOn("o_1", "2030-03-11", { status: "cancelled" }),
    ]);
    const { handler } = assign(rounds, orders, undefined, brought);

    await expect(
      handler.execute(new AssignDeliveryStopCommand("r_1", { orderId: "o_1", version: 1 })),
    ).rejects.toThrow(/annulée/u);
  });

  it("refuse une commande inconnue du commerce", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", []));
    const { handler } = assign(rounds, new FixedDeliveryOrders());

    await expect(
      handler.execute(new AssignDeliveryStopCommand("r_1", { orderId: "o_x", version: 1 })),
    ).rejects.toThrow(/n'existe pas/u);
  });

  it("🔴 refuse une commande déjà dans une tournée vivante d'un AUTRE jour, en la nommant (I3)", async () => {
    const rounds = new InMemoryDeliveryRounds(
      roundWith("r_1", DAY, "v_1", []),
      roundWith("r_0", "2030-03-11", "v_1", ["o_1"]),
    );
    const { handler, events } = assign(rounds, new FixedDeliveryOrders([deliveryOn("o_1", DAY)]));
    const assigning = handler.execute(
      new AssignDeliveryStopCommand("r_1", { orderId: "o_1", version: 1 }),
    );

    await expect(assigning).rejects.toThrow(OrderAlreadyInRoundError);
    await expect(assigning).rejects.toThrow(/Véhicule v_1.*2030-03-11/u);
    expect(events.traced).toEqual([]);
  });

  it("refuse d'affecter à une tournée dont le véhicule a été retiré depuis (C14)", async () => {
    const retired = vehicle("v_1", "Kangoo", "AB-123-CD");
    retired.retire(new Date("2030-03-10T10:00:00.000Z"));
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", []));
    const { handler } = assign(
      rounds,
      new FixedDeliveryOrders([deliveryOn("o_1", DAY)]),
      new InMemoryVehicles(retired),
    );

    await expect(
      handler.execute(new AssignDeliveryStopCommand("r_1", { orderId: "o_1", version: 1 })),
    ).rejects.toThrow(VehicleInactiveOnDayError);
  });
});
