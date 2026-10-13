import { HeldAfterCommit } from "../../../platform/database/__tests__/held-after-commit.js";
import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { BackgroundWork } from "../../../platform/events/background-work.js";
import { RecordingPublisher } from "../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import type { TransferSiteFacts } from "../../channels/commerce/index.js";
import { InMemoryVehicles, vehicle } from "../commands/__tests__/fleet-doubles.js";
import { InMemoryDeliveryRounds, roundWith } from "../commands/__tests__/round-doubles.js";
import {
  FixedFleet,
  RoundsReaderOver,
  vehicleView,
} from "../commands/__tests__/routing-doubles.js";
import { type TransferPlace, TransferPlaceFinder } from "../transfer-placer.js";
import { TransferPlacement } from "../transfer-placement.js";
import {
  FixedTransferSites,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
  plannedTransfer,
} from "./transfer-doubles.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);

const SITE: TransferSiteFacts = {
  siteId: "site_vv",
  label: "Val Village",
  gps: { lat: 45.4, lng: 6.9 },
  mode: "integrated",
  arrivalBy: "07:30",
};

/** La place que la route aurait trouvée, donnée d'avance. */
class FixedPlaceFinder extends TransferPlaceFinder {
  readonly asked: string[] = [];

  constructor(private readonly place: TransferPlace | null) {
    super();
  }

  placeFor(day: string): Promise<TransferPlace | null> {
    this.asked.push(day);
    return Promise.resolve(this.place);
  }
}

function setup(options: {
  readonly rounds?: InMemoryDeliveryRounds;
  readonly place?: TransferPlace | null;
  readonly site?: TransferSiteFacts;
  readonly fleet?: readonly string[];
}) {
  const transfers = new InMemoryInternalTransfers(plannedTransfer("t_1", DAY, AT, ["o_v1"]));
  const rounds = options.rounds ?? new InMemoryDeliveryRounds();
  const finder = new FixedPlaceFinder(options.place ?? null);
  const events = new RecordingPublisher();
  const fleetIds = options.fleet ?? ["v_1", "v_2"];
  const placement = new TransferPlacement(
    new InternalTransfersReaderOver(transfers),
    transfers,
    new FixedTransferSites([options.site ?? SITE]),
    finder,
    rounds,
    new RoundsReaderOver(rounds),
    new FixedFleet(fleetIds.map((id) => vehicleView(id, `Véhicule ${id}`))),
    new InMemoryVehicles(...fleetIds.map((id) => vehicle(id, `Véhicule ${id}`, "AB-123-CD"))),
    new FixedIdGenerator("st"),
    new FixedClock(AT),
    events,
    new DirectUnitOfWork(),
    new HeldAfterCommit(),
    new BackgroundWork(),
  );
  return { placement, rounds, events, finder };
}

describe("TransferPlacement — placer les transferts du jour (lot T1, Q-T9, Q-T13)", () => {
  it("intégré : insère l'arrêt dans la tournée que la route a choisie", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1", "o_2"]));
    const { placement, events } = setup({
      rounds,
      place: { roundId: "r_1", after: 1, addedSeconds: 300, version: 1 },
    });

    expect(await placement.placeDay(DAY)).toBe(1);

    const round = rounds.stored("r_1");
    expect(round?.liveStops.map((stop) => stop.kind)).toEqual(["order", "transfer", "order"]);
    expect(round?.transferIds).toEqual(["t_1"]);
    expect(events.factTypes()).toEqual(["internal_transfer.placed"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ dedicated: false });
  });

  it("repli automatique : aucune tournée à temps → une tournée dédiée sur un véhicule libre", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"]));
    const { placement, events } = setup({ rounds, place: null });

    await placement.placeDay(DAY);

    const dedicated = rounds.all().find((round) => round.id !== "r_1");
    expect(dedicated?.vehicleId).toBe("v_2");
    expect(dedicated?.liveStops).toEqual([
      { kind: "transfer", id: "st_000002", transferId: "t_1" },
    ]);
    expect(events.factTypes()).toEqual(["delivery_round.opened", "internal_transfer.placed"]);
    expect(events.traced[1]?.journalFact().payload).toMatchObject({ dedicated: true });
  });

  it("mode dédié : ne cherche aucune tournée existante", async () => {
    const { placement, finder, rounds } = setup({ site: { ...SITE, mode: "dedicated" } });

    await placement.placeDay(DAY);

    expect(finder.asked).toEqual([]);
    expect(rounds.all().map((round) => round.transferIds)).toEqual([["t_1"]]);
  });

  it("sans véhicule libre : reste prévu, sans arrêt, et le journal le dit (Q-T13)", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"]));
    const { placement, events } = setup({ rounds, fleet: ["v_1"] });

    expect(await placement.placeDay(DAY)).toBe(0);

    expect(rounds.all().map((round) => round.transferIds)).toEqual([[]]);
    expect(events.traced[0]?.journalFact()).toMatchObject({
      type: "internal_transfer.unplaced",
      payload: { cause: "no_vehicle" },
    });
  });

  it("une tournée changée depuis la lecture : on n'insère pas au jugé, on replie", async () => {
    const rounds = new InMemoryDeliveryRounds(roundWith("r_1", DAY, "v_1", ["o_1"]));
    const { placement } = setup({
      rounds,
      place: { roundId: "r_1", after: 0, addedSeconds: 0, version: 99 },
    });

    await placement.placeDay(DAY);

    expect(rounds.stored("r_1")?.transferIds).toEqual([]);
    expect(rounds.all().some((round) => round.transferIds.includes("t_1"))).toBe(true);
  });

  it("un site sans point GPS : rien n'est placé, le journal dit pourquoi", async () => {
    const { placement, events, rounds } = setup({ site: { ...SITE, gps: null } });

    await placement.placeDay(DAY);

    expect(rounds.all()).toEqual([]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ cause: "site_not_located" });
  });
});
