import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { DeliveryRoundStaleError } from "../../../domain/errors/delivery-round-errors.js";
import {
  LoadedRoundRemovalError,
  PastServiceDayCompositionError,
} from "../../../domain/errors/delivery-round-removal-errors.js";
import { OpenDeliveryRoundHandler } from "../open-delivery-round.handler.js";
import { OpenDeliveryRoundCommand } from "../open-delivery-round.command.js";
import { RemoveDeliveryRoundCommand } from "../remove-delivery-round.command.js";
import { RemoveDeliveryRoundHandler } from "../remove-delivery-round.handler.js";
import { ReorderDeliveryRoundCommand } from "../reorder-delivery-round.command.js";
import { ReorderDeliveryRoundHandler } from "../reorder-delivery-round.handler.js";
import { InMemoryVehicles, vehicle } from "./fleet-doubles.js";
import {
  deliveryOn,
  FixedDeliveryOrders,
  FixedLoadedStops,
  InMemoryDeliveryRounds,
  roundWith,
} from "./round-doubles.js";
import { InMemoryInternalTransfers } from "../../__tests__/transfer-doubles.js";

// L'horloge est FIGÉE à l'instant 0 : son jour de Paris est le 1970-01-01. Les
// jours ci-dessous se lisent par rapport à elle, jamais au mur.
const TODAY = "1970-01-01";
const YESTERDAY = "1969-12-31";
const ORDERS = new FixedDeliveryOrders(["o_1", "o_2"].map((id) => deliveryOn(id, TODAY)));

function remove(rounds: InMemoryDeliveryRounds, loaded: readonly string[] = []) {
  const events = new RecordingPublisher();
  const handler = new RemoveDeliveryRoundHandler(
    rounds,
    new FixedLoadedStops(loaded),
    ORDERS,
    new InMemoryInternalTransfers(),
    new FixedClock(new Date(0)),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, events };
}

describe("RemoveDeliveryRoundHandler", () => {
  it("retire chaque arrêt comme à la main, et inscrit UN fait qui les cite", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", TODAY, "v_1", ["o_1", "o_2"]));
    const { handler, events } = remove(rounds);

    await handler.execute(new RemoveDeliveryRoundCommand("r_1", { version: 1 }));

    expect(rounds.stored("r_1")?.removedAt).toEqual(new Date(0));
    expect(await rounds.liveHolderOf("o_1")).toBeNull();
    expect(events.traced.map((event) => event.journalFact().type)).toEqual([
      "delivery_round.removed",
    ]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      orders: [
        { id: "o_1", name: "ORD-o_1" },
        { id: "o_2", name: "ORD-o_2" },
      ],
      transfers: [],
    });
  });

  it("rejouée sur une tournée supprimée : sans effet, rien ne s'inscrit", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", TODAY, "v_1", ["o_1"]));
    await remove(rounds).handler.execute(new RemoveDeliveryRoundCommand("r_1", { version: 1 }));
    const { handler, events } = remove(rounds);

    await handler.execute(new RemoveDeliveryRoundCommand("r_1", { version: 1 }));

    expect(events.traced).toEqual([]);
    expect(rounds.saved).toEqual(["r_1"]);
  });

  it("refuse une version périmée", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", TODAY, "v_1", ["o_1"]));

    await expect(
      remove(rounds).handler.execute(new RemoveDeliveryRoundCommand("r_1", { version: 7 })),
    ).rejects.toThrow(DeliveryRoundStaleError);
  });

  it("refuse une tournée dont un bac est chargé, sans rien écrire", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", TODAY, "v_1", ["o_1", "o_2"]));
    const { handler, events } = remove(rounds, ["r_1_s2"]);

    await expect(
      handler.execute(new RemoveDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(LoadedRoundRemovalError);
    expect(rounds.saved).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("refuse une journée passée", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", YESTERDAY, "v_1", ["o_1"]));

    await expect(
      remove(rounds).handler.execute(new RemoveDeliveryRoundCommand("r_1", { version: 1 })),
    ).rejects.toThrow(PastServiceDayCompositionError);
  });
});

describe("on ne compose pas une journée passée (2026-10-26)", () => {
  const tools = () => ({
    clock: new FixedClock(new Date(0)),
    events: new RecordingPublisher(),
    uow: new DirectUnitOfWork(),
  });

  it("ouvrir une tournée la veille de l'horloge est refusé, aujourd'hui permis", async () => {
    const rounds = new InMemoryDeliveryRounds();
    const { clock, events, uow } = tools();
    const vehicles = new InMemoryVehicles(vehicle("v_1", "Kangoo", "AB-123-CD"));
    const handler = new OpenDeliveryRoundHandler(
      rounds,
      vehicles,
      new FixedIdGenerator("id"),
      clock,
      events,
      uow,
    );

    await expect(
      handler.execute(new OpenDeliveryRoundCommand({ day: YESTERDAY, vehicleId: "v_1" })),
    ).rejects.toThrow(PastServiceDayCompositionError);
    await expect(
      handler.execute(new OpenDeliveryRoundCommand({ day: TODAY, vehicleId: "v_1" })),
    ).resolves.toEqual(expect.any(String));
  });

  it("réordonner une tournée d'une journée passée est refusé", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", YESTERDAY, "v_1", ["o_1", "o_2"]));
    const { clock, events, uow } = tools();
    const handler = new ReorderDeliveryRoundHandler(rounds, ORDERS, clock, events, uow);

    await expect(
      handler.execute(
        new ReorderDeliveryRoundCommand("r_1", { stopIds: ["r_1_s2", "r_1_s1"], version: 1 }),
      ),
    ).rejects.toThrow(PastServiceDayCompositionError);
  });
});
