import { SharedBinToRedoError } from "../../errors/delivery-bin-declaration-errors.js";
import { DeliveryRound } from "../delivery-round.js";
import type { StopReadiness } from "../departure-readiness.js";
import {
  DeliveryRoundDepartedError,
  DeliveryRoundNotReadyError,
  EmptyDeliveryRoundError,
} from "../../errors/delivery-loading-errors.js";

// Des jours comparés entre eux seulement, jamais à l'horloge.
const DAY = "2030-03-12";
const AT = new Date(0);
const LATER = new Date(60_000);

function round(departedAt: Date | null = null): DeliveryRound {
  return DeliveryRound.restore({
    id: "r_1",
    serviceDay: DAY,
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

function ready(overrides: Partial<Record<string, StopReadiness["state"]>> = {}): StopReadiness[] {
  return [
    { stopId: "s_1", reference: "C-1", state: overrides["s_1"] ?? "loaded", binsToRedo: [] },
    { stopId: "s_2", reference: "C-2", state: overrides["s_2"] ?? "loaded", binsToRedo: [] },
  ];
}

describe("DeliveryRound — partir (lot 4, L4-C4, Q14)", () => {
  it("part quand chaque arrêt vivant est chargé : départ posé, version avancée", () => {
    const subject = round();

    subject.depart(LATER, ready());

    expect(subject.departedAt).toEqual(LATER);
    expect(subject.version).toBe(4);
    expect(subject.toSnapshot().departedAt).toEqual(LATER);
  });

  it("refuse un arrêt non étiqueté et un arrêt partiel, en listant leurs références", () => {
    const subject = round();

    expect(() => subject.depart(LATER, ready({ s_1: "unlabelled", s_2: "partial" }))).toThrow(
      /sans bac déclaré : C-1.*restent à charger : C-2/u,
    );
    expect(subject.departedAt).toBeNull();
    expect(subject.version).toBe(3);
  });

  /** Lot 4 bis, v2-4 : un bac partagé séparé par une recomposition ne part pas. */
  it("refuse un arrêt dont un bac partagé est à refaire, avec la phrase qui le dit", () => {
    const subject = round();
    const [first, second] = ready();
    const readiness = [
      { ...(first ?? ready()[0]!), binsToRedo: ["HHHHHH"] },
      ...(second === undefined ? [] : [second]),
    ];

    expect(() => subject.depart(LATER, readiness)).toThrow(SharedBinToRedoError);
    expect(() => subject.depart(LATER, readiness)).toThrow(
      "« Kangoo blanc » ne peut pas partir — le bac partagé HHHHHH (C-1) n'est plus entre deux arrêts consécutifs : recolisez-le ou remettez les arrêts côte à côte.",
    );
    expect(subject.departedAt).toBeNull();
  });

  /** L4-C17 : « tous chargés » est vrai sur un ensemble vide — l'absence ne fait pas partir. */
  it("tient pour non étiqueté un arrêt que l'état de chargement ne cite pas", () => {
    const subject = round();

    expect(() => subject.depart(LATER, ready().slice(0, 1))).toThrow(DeliveryRoundNotReadyError);
  });

  it("refuse une tournée vide", () => {
    const empty = DeliveryRound.restore({ ...round().toSnapshot(), stops: [] });

    expect(() => empty.depart(LATER, [])).toThrow(EmptyDeliveryRoundError);
  });

  it("refuse de partir deux fois", () => {
    expect(() => round(AT).depart(LATER, ready())).toThrow(DeliveryRoundDepartedError);
  });

  describe("partie, elle ne se compose plus (I6)", () => {
    it.each([
      ["affecter", (subject: DeliveryRound) => subject.assign("s_9", "o_9", LATER)],
      ["réordonner", (subject: DeliveryRound) => subject.reorder(["s_2", "s_1"], LATER)],
      ["retirer", (subject: DeliveryRound) => subject.remove("s_1", LATER)],
      ["détacher", (subject: DeliveryRound) => subject.detach("s_1", LATER)],
      [
        "recevoir",
        (subject: DeliveryRound) => subject.attach({ id: "s_9", orderId: "o_9" }, LATER),
      ],
    ])("refuse %s", (_label, gesture) => {
      const subject = round(AT);

      expect(() => gesture(subject)).toThrow(DeliveryRoundDepartedError);
      expect(subject.orderIds).toEqual(["o_1", "o_2"]);
      expect(subject.version).toBe(3);
    });
  });
});
