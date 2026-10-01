import type { DepartureSheet } from "../../domain/entities/departure-sheet.js";
import type {
  DepartedStopRow,
  DriverRoundRow,
  DriverStopRow,
} from "../../domain/ports/driver-rounds.reader.js";
import {
  freezeOf,
  myDeliveryRoundView,
  type MyDeliveryRoundInputs,
} from "../my-delivery-round-view.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const AT = new Date(0);
const CARNET = { lat: 45.1, lng: 6.1 };
const FROZEN = { lat: 45.9, lng: 6.9 };

function stop(id: string, position: number, overrides: Partial<DriverStopRow> = {}): DriverStopRow {
  return {
    stopId: id,
    orderId: `o_${id}`,
    position,
    closedAt: null,
    departed: null,
    bins: 2,
    coldBins: 1,
    ...overrides,
  };
}

function frozen(rank: number | null, overrides: Partial<DepartedStopRow> = {}): DepartedStopRow {
  return {
    reference: "FIGÉE",
    customerLabel: "Refuge 1950",
    address: null,
    contact: { prenom: "Anne", nom: "Colin", telephone: "0600000000" },
    window: { start: "07:00", end: "09:00", source: "override" },
    signatureRequired: true,
    note: "par la cour",
    addressNote: "sonner",
    departureRank: rank,
    gps: rank === null ? null : FROZEN,
    depositAllowed: false,
    arrivedAt: null,
    ...overrides,
  };
}

function sheet(orderId: string): DepartureSheet {
  return {
    orderId,
    reference: `VIVE-${orderId}`,
    customerLabel: `Maison ${orderId}`,
    address: null,
    contact: null,
    window: null,
    signatureRequired: false,
    note: "",
    addressNote: null,
    depositAllowed: false,
    status: "active",
  };
}

function round(stops: readonly DriverStopRow[], departedAt: Date | null): DriverRoundRow {
  return {
    id: "r_1",
    serviceDay: "2030-03-12",
    vehicleName: "Kangoo",
    passage: 1,
    version: 4,
    departedAt,
    returnedAt: null,
    stops,
  };
}

function inputs(overrides: Partial<MyDeliveryRoundInputs>): MyDeliveryRoundInputs {
  return {
    round: round([], null),
    sheets: new Map(),
    carnetPoints: new Map(),
    procedures: new Map(),
    home: null,
    orderStates: new Map(),
    incidents: [],
    ...overrides,
  };
}

describe("myDeliveryRoundView — la vue du livreur (MT-D5 v2)", () => {
  it("au dépôt : l'ordre de composition, la feuille et le point VIVANTS", () => {
    const view = myDeliveryRoundView(
      inputs({
        round: round([stop("a", 1), stop("b", 2)], null),
        sheets: new Map([
          ["o_a", sheet("o_a")],
          ["o_b", sheet("o_b")],
        ]),
        carnetPoints: new Map([["o_a", CARNET]]),
      }),
    );

    expect(view.freeze).toBe("live");
    expect(view.stops.map((entry) => [entry.rank, entry.reference, entry.gps])).toEqual([
      [1, "VIVE-o_a", CARNET],
      [2, "VIVE-o_b", null],
    ]);
  });

  it("partie : l'ordre du RANG figé, et le point figé — pas le carnet corrigé en route", () => {
    const view = myDeliveryRoundView(
      inputs({
        // Les positions ont bougé depuis (lot 6) : le rang du départ fait foi.
        round: round(
          [
            stop("a", 1, { departed: frozen(2) }),
            stop("b", 2, { departed: frozen(1, { reference: "PREMIER" }) }),
          ],
          AT,
        ),
        carnetPoints: new Map([["o_a", CARNET]]),
      }),
    );

    expect(view.freeze).toBe("departure");
    expect(
      view.stops.map((entry) => [entry.rank, entry.stopId, entry.reference, entry.gps]),
    ).toEqual([
      [1, "b", "PREMIER", FROZEN],
      [2, "a", "FIGÉE", FROZEN],
    ]);
  });

  it("partie avant la migration : position et carnet, et la vue le dit (« non figés »)", () => {
    const view = myDeliveryRoundView(
      inputs({
        round: round([stop("a", 1, { departed: frozen(null) })], AT),
        carnetPoints: new Map([["o_a", CARNET]]),
      }),
    );

    expect(view.freeze).toBe("not_frozen");
    expect(view.stops[0]).toMatchObject({ rank: 1, gps: CARNET, reference: "FIGÉE" });
  });

  it("projette en liste blanche : tout l'arrêt, et AUCUN champ d'argent", () => {
    const view = myDeliveryRoundView(
      inputs({
        round: round([stop("a", 1, { departed: frozen(1) })], AT),
        procedures: new Map([
          ["o_a", [{ id: "st_1", title: "Cour", body: "", hasPhoto: true, photoRevision: "rev1" }]],
        ]),
      }),
    );

    expect(Object.keys(view.stops[0] ?? {}).sort()).toEqual(
      [
        "address",
        "addressNote",
        // Plan « À la porte », lot A : décidés, pas commodes (AP-D5, AP-D6, AP-Q6, AP-D2).
        "arrivedAt",
        "bins",
        "canDeposit",
        "closedAt",
        "coldBins",
        "contact",
        "customerLabel",
        "depositAllowed",
        "gps",
        "orderNote",
        "orderState",
        "procedure",
        "rank",
        "reference",
        "signatureRequired",
        "stopId",
        "window",
      ].sort(),
    );
    expect(JSON.stringify(view)).not.toMatch(/cents|price|total|amount|prix|montant/iu);
    expect(view.stops[0]?.procedure).toEqual([
      { id: "st_1", number: 1, title: "Cour", body: "", hasPhoto: true, photoRevision: "rev1" },
    ]);
    expect(view.stops[0]).toMatchObject({ bins: 2, coldBins: 1, signatureRequired: true });
  });

  it("une commande que le commerce ne connaît plus : rien d'inventé", () => {
    const view = myDeliveryRoundView(inputs({ round: round([stop("a", 1)], null) }));

    expect(view.stops[0]).toMatchObject({ reference: "", address: null, contact: null });
  });

  it("freezeOf : au dépôt, figée, non figée", () => {
    expect(freezeOf(round([stop("a", 1)], null))).toBe("live");
    expect(freezeOf(round([stop("a", 1, { departed: frozen(1) })], AT))).toBe("departure");
    expect(freezeOf(round([stop("a", 1)], AT))).toBe("not_frozen");
  });
});

describe("myDeliveryRoundView — à la porte (plan « À la porte », lot A)", () => {
  const ARRIVED = new Date(60_000);

  it("🔴 signature exigée ⇒ jamais de dépôt, même si l'adresse l'autorise (AP-Q6)", () => {
    const view = myDeliveryRoundView(
      inputs({
        round: round(
          [
            stop("a", 1, {
              departed: frozen(1, { depositAllowed: true, signatureRequired: true }),
            }),
            stop("b", 2, {
              departed: frozen(2, { depositAllowed: true, signatureRequired: false }),
            }),
            stop("c", 3, {
              departed: frozen(3, { depositAllowed: false, signatureRequired: false }),
            }),
          ],
          AT,
        ),
      }),
    );

    expect(view.stops.map((s) => [s.depositAllowed, s.canDeposit])).toEqual([
      [true, false],
      [true, true],
      [false, false],
    ]);
  });

  it("au dépôt, le dépôt autorisé se lit sur la feuille vivante", () => {
    const view = myDeliveryRoundView(
      inputs({
        round: round([stop("a", 1)], null),
        sheets: new Map([["o_a", { ...sheet("o_a"), depositAllowed: true }]]),
      }),
    );

    expect(view.stops[0]).toMatchObject({
      depositAllowed: true,
      canDeposit: true,
      arrivedAt: null,
    });
  });

  it("porte l'arrivée figée, l'état de la commande lu au commerce, et les signalements", () => {
    const view = myDeliveryRoundView(
      inputs({
        round: round(
          [
            stop("a", 1, { departed: frozen(1, { arrivedAt: ARRIVED }) }),
            stop("b", 2, { departed: frozen(2) }),
          ],
          AT,
        ),
        orderStates: new Map([["o_a", "handed_over"]]),
        incidents: [
          {
            id: "inc_1",
            roundId: "r_1",
            stopId: "b",
            orderReference: "FIGÉE",
            family: "doorstep",
            reason: "nobody_present",
            note: "",
            hasPhoto: false,
            reportedAt: ARRIVED,
            reportedBy: "staff_paul",
            reportedByName: "",
          },
        ],
      }),
    );

    expect(view.stops.map((s) => [s.arrivedAt, s.orderState])).toEqual([
      [ARRIVED.toISOString(), "handed_over"],
      [null, "open"],
    ]);
    expect(view.incidents).toEqual([
      expect.objectContaining({
        id: "inc_1",
        stopId: "b",
        reportedBy: { staffUserId: "staff_paul", name: null },
      }),
    ]);
  });
});
