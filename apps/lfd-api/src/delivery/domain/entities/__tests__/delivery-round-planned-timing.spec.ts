import { DeliveryRound } from "../delivery-round.js";
import { DeliveryRoundDepartedError } from "../../errors/delivery-loading-errors.js";
import { PlannedTiming } from "../../value-objects/planned-timing.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const AT = new Date(1_000);
const TIMING = PlannedTiming.of({
  departureAt: new Date(3_600_000),
  returnAt: new Date(7_200_000),
  meters: 42_000,
});

function planned(departedAt: Date | null = null): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: "2030-03-12",
    vehicleId: "v_1",
    vehicleName: "Kangoo",
    passage: 1,
    version: 3,
    departedAt,
    driverStaffId: null,
    plannedTiming: departedAt === null ? TIMING : null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    stops: [
      { id: "s_1", orderId: "o_1", position: 1, closedAt: null },
      { id: "s_2", orderId: "o_2", position: 2, closedAt: null },
    ],
  });
}

describe("DeliveryRound — l'horaire prévu (I10)", () => {
  it("se relit et se rend tel quel", () => {
    const round = planned();
    expect(round.plannedTiming).toBe(TIMING);
    expect(round.toSnapshot().plannedTiming).toBe(TIMING);
    expect(round.version).toBe(3);
  });

  it("absent à la réhydratation, il vaut `null`", () => {
    const { plannedTiming: _ignored, ...state } = planned().toSnapshot();
    expect(DeliveryRound.restore(state).plannedTiming).toBeNull();
  });

  it("se pose par `planTiming`, et la version avance", () => {
    const round = DeliveryRound.restore({ ...planned().toSnapshot(), plannedTiming: null });
    round.planTiming(TIMING, AT);
    expect(round.plannedTiming).toBe(TIMING);
    expect(round.version).toBe(4);
  });

  it("le même horaire reposé ne change rien : la version n'avance pas", () => {
    const round = planned();
    round.planTiming(
      PlannedTiming.of({
        departureAt: TIMING.departureAt,
        returnAt: TIMING.returnAt,
        meters: TIMING.meters,
      }),
      AT,
    );
    expect(round.version).toBe(3);
  });

  it.each([
    ["affecter", (round: DeliveryRound) => round.assign("s_3", "o_3", AT)],
    ["retirer", (round: DeliveryRound) => void round.remove("s_1", AT)],
    ["détacher (déplacer)", (round: DeliveryRound) => void round.detach("s_2", AT)],
    [
      "rattacher (déplacer)",
      (round: DeliveryRound) => round.attach({ id: "s_9", orderId: "o_9" }, AT),
    ],
    ["réordonner", (round: DeliveryRound) => void round.reorder(["s_2", "s_1"], AT)],
  ])("%s l'efface : un chiffre périmé est pire qu'aucun", (_gesture, gesture) => {
    const round = planned();
    gesture(round);
    expect(round.plannedTiming).toBeNull();
    expect(round.toSnapshot().plannedTiming).toBeNull();
  });

  it("un réordonnancement qui ne change rien le garde", () => {
    const round = planned();
    expect(round.reorder(["s_1", "s_2"], AT)).toBe(false);
    expect(round.plannedTiming).toBe(TIMING);
  });

  it("une tournée partie ne se planifie plus (I6)", () => {
    expect(() => planned(new Date(2_000)).planTiming(TIMING, AT)).toThrow(
      DeliveryRoundDepartedError,
    );
  });
});
