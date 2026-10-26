import { DeliveryRound, type DeliveryRoundState } from "../delivery-round.js";
import { DeliveryRoundDepartedError } from "../../errors/delivery-loading-errors.js";
import {
  DeliveryRoundRemovedError,
  LoadedRoundRemovalError,
  PastServiceDayCompositionError,
} from "../../errors/delivery-round-removal-errors.js";

// Des jours de service comparés entre eux seulement (`today` est donné), jamais à l'horloge.
const DAY = "2030-03-12";
const DAY_BEFORE = "2030-03-11";
const DAY_AFTER = "2030-03-13";
const AT = new Date(0);
const LATER = new Date(60_000);
const NONE: ReadonlySet<string> = new Set();

function round(overrides: Partial<DeliveryRoundState> = {}): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
    vehicleId: "v_1",
    vehicleName: "Kangoo blanc",
    passage: 1,
    version: 4,
    departedAt: null,
    driverStaffId: null,
    createdAt: AT,
    updatedAt: AT,
    stops: [
      { kind: "order", id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { kind: "transfer", id: "s_2", transferId: "t_1", position: 2, closedAt: null },
      { kind: "order", id: "s_3", orderId: "o_3", position: 3, closedAt: null },
    ],
    ...overrides,
  });
}

describe("DeliveryRound.removeRound", () => {
  it("retire tous les arrêts à leur position, transfert compris, et marque la tournée supprimée", () => {
    const subject = round();

    const removed = subject.removeRound(LATER, DAY, NONE);

    expect(removed.map((stop) => stop.id)).toEqual(["s_1", "s_2", "s_3"]);
    const snapshot = subject.toSnapshot();
    expect(snapshot.stops).toEqual([]);
    expect(snapshot.removedStops.map((stop) => [stop.id, stop.position, stop.removedAt])).toEqual([
      ["s_1", 1, LATER],
      ["s_2", 2, LATER],
      ["s_3", 3, LATER],
    ]);
    expect(snapshot).toMatchObject({ removedAt: LATER, version: 5, plannedTiming: null });
  });

  it("supprime une tournée vide, et une tournée d'un jour à venir", () => {
    const subject = round({ serviceDay: DAY_AFTER, stops: [] });

    expect(subject.removeRound(LATER, DAY, NONE)).toEqual([]);
    expect(subject.removedAt).toEqual(LATER);
  });

  it("refuse une journée passée", () => {
    expect(() => round({ serviceDay: DAY_BEFORE }).removeRound(LATER, DAY, NONE)).toThrow(
      PastServiceDayCompositionError,
    );
  });

  it("refuse une tournée partie, et une tournée rentrée", () => {
    expect(() => round({ departedAt: AT }).removeRound(LATER, DAY, NONE)).toThrow(
      DeliveryRoundDepartedError,
    );
    const returned = round({
      departedAt: AT,
      returned: { at: AT, byStaffId: "st_1", byName: "Colette" },
    });
    expect(() => returned.removeRound(LATER, DAY, NONE)).toThrow(DeliveryRoundDepartedError);
  });

  it("refuse dès qu'un arrêt a un bac chargé, en disant de décharger d'abord", () => {
    const subject = round();

    expect(() => subject.removeRound(LATER, DAY, new Set(["s_3"]))).toThrow(
      LoadedRoundRemovalError,
    );
    expect(() => subject.removeRound(LATER, DAY, new Set(["s_3"]))).toThrow(
      /déchargez d'abord les bacs de cette tournée/u,
    );
    expect(subject.toSnapshot().stops).toHaveLength(3);
  });

  it("une tournée supprimée ne reprend aucun geste de composition", () => {
    const subject = round({ removedAt: AT, stops: [] });

    expect(() => subject.assign("s_9", "o_9", LATER)).toThrow(DeliveryRoundRemovedError);
    expect(() => subject.removeRound(LATER, DAY, NONE)).toThrow(DeliveryRoundRemovedError);
  });
});
