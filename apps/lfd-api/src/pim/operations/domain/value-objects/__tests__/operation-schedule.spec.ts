import {
  InvalidOperationDayError,
  InvalidOperationInstantError,
  InvalidOperationScheduleError,
} from "../../errors/operation-errors.js";
import { OperationSchedule, type OperationScheduleInput } from "../operation-schedule.js";

/**
 * Noël 2026, tel que le plan le dessine (D2). Les instants sont comparés entre
 * eux et à des `now` écrits à côté — jamais à l'horloge.
 */
const NOEL: OperationScheduleInput = {
  announceFrom: new Date("2026-10-31T23:00:00.000Z"), // 1er nov. 00:00 Paris
  orderFrom: new Date("2026-11-14T23:00:00.000Z"), // 15 nov. 00:00 Paris
  orderUntil: new Date("2026-12-21T11:00:00.000Z"), // 21 déc. 12:00 Paris
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
};

const at = (iso: string) => new Date(iso);

function refusal(input: Partial<OperationScheduleInput>): string {
  try {
    OperationSchedule.of({ ...NOEL, ...input });
  } catch (error) {
    if (error instanceof InvalidOperationScheduleError) {
      return error.code;
    }
    throw error;
  }
  return "accepté";
}

describe("OperationSchedule — les invariants de D2", () => {
  it("accepte le calendrier de Noël", () => {
    expect(refusal({})).toBe("accepté");
  });

  it("accepte une commande qui ouvre dès l'annonce (orderFrom absent, ou égal)", () => {
    expect(refusal({ orderFrom: null })).toBe("accepté");
    expect(refusal({ orderFrom: NOEL.announceFrom })).toBe("accepté");
  });

  it("refuse une annonce postérieure à l'ouverture des commandes", () => {
    expect(refusal({ announceFrom: at("2026-11-20T00:00:00.000Z") })).toBe(
      "pim.operation.announce_after_order",
    );
  });

  it("refuse une clôture qui ne suit pas strictement l'ouverture", () => {
    expect(refusal({ orderUntil: NOEL.orderFrom ?? NOEL.announceFrom })).toBe(
      "pim.operation.order_window_empty",
    );
    // Sans `orderFrom`, c'est l'annonce qui ouvre : la même règle s'y applique.
    expect(refusal({ orderFrom: null, orderUntil: NOEL.announceFrom })).toBe(
      "pim.operation.order_window_empty",
    );
  });

  it("refuse des jours de retrait inversés, accepte un seul jour", () => {
    expect(refusal({ pickupFrom: "2026-12-25", pickupUntil: "2026-12-24" })).toBe(
      "pim.operation.pickup_window_inverted",
    );
    expect(refusal({ pickupFrom: "2026-12-24", pickupUntil: "2026-12-24" })).toBe("accepté");
  });

  /** fin(24 déc.) = 25 déc. 00:00 Paris = 24 déc. 23:00 UTC. La borne est incluse. */
  it("borne la clôture à la fin du dernier jour de retrait, heure de Paris", () => {
    expect(refusal({ orderUntil: at("2026-12-24T23:00:00.000Z") })).toBe("accepté");
    expect(refusal({ orderUntil: at("2026-12-24T23:00:00.001Z") })).toBe(
      "pim.operation.order_after_pickup_end",
    );
  });

  /**
   * Le dernier retrait le 24 octobre, veille du passage à l'heure d'hiver :
   * la fin tombe à 22 h UTC (encore l'heure d'été). Un calcul en heure
   * d'hiver aurait laissé passer une clôture une heure trop tardive.
   */
  it("calcule la fin au bon décalage la veille du passage à l'heure d'hiver", () => {
    const october = {
      announceFrom: at("2026-10-01T08:00:00.000Z"),
      orderFrom: null,
      pickupFrom: "2026-10-24",
      pickupUntil: "2026-10-24",
    };
    expect(refusal({ ...october, orderUntil: at("2026-10-24T22:00:00.000Z") })).toBe("accepté");
    expect(refusal({ ...october, orderUntil: at("2026-10-24T22:30:00.000Z") })).toBe(
      "pim.operation.order_after_pickup_end",
    );
  });

  it("nomme les dates en heure de Paris dans le refus", () => {
    expect(() =>
      OperationSchedule.of({ ...NOEL, orderUntil: at("2026-12-25T10:00:00.000Z") }),
    ).toThrow(/25\/12\/2026 à 11:00.*24\/12\/2026/u);
  });

  it("refuse un jour qui n'existe pas et un instant illisible", () => {
    expect(() => OperationSchedule.of({ ...NOEL, pickupUntil: "2026-12-32" })).toThrow(
      InvalidOperationDayError,
    );
    expect(() => OperationSchedule.of({ ...NOEL, orderUntil: new Date("pas une date") })).toThrow(
      InvalidOperationInstantError,
    );
  });
});

describe("OperationSchedule — l'état se calcule à l'instant donné", () => {
  const noel = OperationSchedule.of(NOEL);

  it.each([
    ["2026-10-31T22:59:59.999Z", "preparing"],
    ["2026-10-31T23:00:00.000Z", "announced"],
    ["2026-11-14T23:00:00.000Z", "open"],
    ["2026-12-21T10:59:59.999Z", "open"],
    ["2026-12-21T11:00:00.000Z", "closed"],
    ["2026-12-24T22:59:59.999Z", "closed"],
    ["2026-12-24T23:00:00.000Z", "ended"],
  ])("à %s, elle est « %s »", (now, state) => {
    expect(noel.stateAt(at(now))).toBe(state);
  });

  it("passe directement d'« en préparation » à « ouverte » quand on commande dès l'annonce", () => {
    const direct = OperationSchedule.of({ ...NOEL, orderFrom: null });

    expect(direct.stateAt(at("2026-10-31T23:00:00.000Z"))).toBe("open");
  });

  /** Le jour du passage à l'heure d'hiver dure 25 h : l'opération vit jusqu'à son minuit à lui. */
  it("s'éteint à minuit heure d'hiver quand le dernier retrait tombe le jour de la bascule", () => {
    const toussaint = OperationSchedule.of({
      announceFrom: at("2026-10-01T08:00:00.000Z"),
      orderFrom: null,
      orderUntil: at("2026-10-20T10:00:00.000Z"),
      pickupFrom: "2026-10-25",
      pickupUntil: "2026-10-25",
    });

    expect(toussaint.stateAt(at("2026-10-25T22:30:00.000Z"))).toBe("closed");
    expect(toussaint.stateAt(at("2026-10-25T23:00:00.000Z"))).toBe("ended");
  });
});
