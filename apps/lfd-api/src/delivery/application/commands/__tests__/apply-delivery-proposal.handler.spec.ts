import type { ApplyDeliveryProposalPayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { LoadedStopMoveError } from "../../../domain/errors/delivery-loading-errors.js";
import {
  OrderAlreadyInRoundError,
  OrderNotAssignableError,
} from "../../../domain/errors/delivery-round-errors.js";
import { ProposalOutdatedError } from "../../../domain/errors/delivery-routing-errors.js";
import { ApplyDeliveryProposalCommand } from "../apply-delivery-proposal.command.js";
import { ApplyDeliveryProposalHandler } from "../apply-delivery-proposal.handler.js";
import { InMemoryVehicles, vehicle } from "./fleet-doubles.js";
import {
  deliveryOn,
  FixedDeliveryOrders,
  FixedLoadedStops,
  InMemoryDeliveryRounds,
  roundWith,
} from "./round-doubles.js";
import { InMemoryProposals, RoundsReaderOver } from "./routing-doubles.js";

// Des jours comparés entre eux — jamais à l'horloge.
const DAY = "2030-03-12";
const OTHER_DAY = "2030-03-13";

function scene(loaded: readonly string[] = []) {
  const rounds = new InMemoryDeliveryRounds(
    roundWith("r1", DAY, "v1", ["o1", "o2"]),
    roundWith("r_other", OTHER_DAY, "v1", ["o9"]),
  );
  const proposals = new InMemoryProposals(rounds);
  const events = new RecordingPublisher();
  const handler = new ApplyDeliveryProposalHandler(
    rounds,
    new RoundsReaderOver(rounds),
    proposals,
    new InMemoryVehicles(
      vehicle("v1", "Kangoo", "AB-123-CD"),
      vehicle("v2", "Trafic", "EF-456-GH"),
    ),
    new FixedLoadedStops(loaded),
    new FixedDeliveryOrders([
      deliveryOn("o1", DAY),
      deliveryOn("o2", DAY),
      deliveryOn("o3", DAY),
      deliveryOn("o4", DAY, { status: "cancelled" }),
      deliveryOn("o9", DAY),
    ]),
    new FixedIdGenerator("id"),
    new FixedClock(new Date(0)),
    events,
    new DirectUnitOfWork(),
  );
  return { handler, rounds, proposals, events };
}

const PROPOSAL: ApplyDeliveryProposalPayload = {
  day: DAY,
  rounds: [
    { roundId: "r1", vehicleId: "v1", orderIds: ["o1"] },
    { roundId: null, vehicleId: "v2", orderIds: ["o3", "o2"] },
  ],
  versions: [{ roundId: "r1", version: 1 }],
};

describe("ApplyDeliveryProposalHandler — « Appliquer » (L7-C6, L7-C11, L7-C14)", () => {
  it("ouvre, déplace la même ligne, affecte, réordonne — et trace UN fait", async () => {
    const { handler, rounds, proposals, events } = scene();

    await handler.execute(new ApplyDeliveryProposalCommand(PROPOSAL));

    expect(rounds.stored("r1")?.orderIds).toEqual(["o1"]);
    const opened = rounds.all().find((round) => round.vehicleId === "v2");
    expect(opened?.orderIds).toEqual(["o3", "o2"]);
    expect(opened?.passage).toBe(1);
    expect(opened?.liveStops.find((stop) => stop.orderId === "o2")?.id).toBe("r1_s2");
    expect(proposals.applied[0]?.movedStops).toEqual([
      { stopId: "r1_s2", fromVehicleName: "Véhicule v1" },
    ]);
    expect(events.factTypes()).toEqual(["delivery_round.proposal_applied"]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      subjectType: "delivery_day",
      subjectId: DAY,
      payload: {
        day: DAY,
        rounds: [
          {
            round: { name: "Trafic" },
            passage: 1,
            opened: true,
            before: [],
            after: [
              { id: "o3", name: "CMD-o3" },
              { id: "o2", name: "CMD-o2" },
            ],
          },
          {
            round: { id: "r1", name: "Véhicule v1" },
            opened: false,
            before: [
              { id: "o1", name: "CMD-o1" },
              { id: "o2", name: "CMD-o2" },
            ],
            after: [{ id: "o1", name: "CMD-o1" }],
          },
        ],
      },
    });
  });

  it("une version périmée : « reproposez », rien d'écrit", async () => {
    const { handler, proposals, events } = scene();

    await expect(
      handler.execute(
        new ApplyDeliveryProposalCommand({
          ...PROPOSAL,
          versions: [{ roundId: "r1", version: 0 }],
        }),
      ),
    ).rejects.toThrow(ProposalOutdatedError);
    expect(proposals.applied).toEqual([]);
    expect(events.traced).toEqual([]);
  });

  it("une version absente vaut une version périmée", async () => {
    const { handler } = scene();

    await expect(
      handler.execute(new ApplyDeliveryProposalCommand({ ...PROPOSAL, versions: [] })),
    ).rejects.toThrow("Reproposez");
  });

  it("ne déplace jamais un arrêt dont un sac est chargé", async () => {
    const { handler, proposals } = scene(["r1_s2"]);

    await expect(handler.execute(new ApplyDeliveryProposalCommand(PROPOSAL))).rejects.toThrow(
      LoadedStopMoveError,
    );
    expect(proposals.applied).toEqual([]);
  });

  it("refuse une commande annulée depuis la proposition", async () => {
    const { handler } = scene();

    await expect(
      handler.execute(
        new ApplyDeliveryProposalCommand({
          ...PROPOSAL,
          rounds: [...PROPOSAL.rounds, { roundId: null, vehicleId: "v1", orderIds: ["o4"] }],
        }),
      ),
    ).rejects.toThrow(OrderNotAssignableError);
  });

  it("refuse une commande placée entre-temps dans une tournée d'un autre jour (I3)", async () => {
    const { handler } = scene();

    await expect(
      handler.execute(
        new ApplyDeliveryProposalCommand({
          ...PROPOSAL,
          rounds: [...PROPOSAL.rounds, { roundId: null, vehicleId: "v1", orderIds: ["o9"] }],
        }),
      ),
    ).rejects.toThrow(OrderAlreadyInRoundError);
  });

  it("deux tournées à ouvrir pour un même véhicule prennent deux passages", async () => {
    const { handler, rounds } = scene();

    await handler.execute(
      new ApplyDeliveryProposalCommand({
        day: DAY,
        rounds: [
          { roundId: null, vehicleId: "v2", orderIds: ["o3"] },
          { roundId: null, vehicleId: "v2", orderIds: ["o2"] },
        ],
        versions: [{ roundId: "r1", version: 1 }],
      }),
    );

    const passages = rounds
      .all()
      .filter((round) => round.vehicleId === "v2")
      .map((round) => round.passage)
      .sort();
    expect(passages).toEqual([1, 2]);
    // r1 n'est que source : il garde ce que la proposition ne lui prend pas.
    expect(rounds.stored("r1")?.orderIds).toEqual(["o1"]);
  });
});
