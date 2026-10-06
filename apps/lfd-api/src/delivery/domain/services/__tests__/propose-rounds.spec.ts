import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { type PlannableStop, type ProposalInput, proposeRounds } from "../propose-rounds.js";
import { DAY_START, durationOf } from "../route-timing.js";
import { lineCost } from "./line-cost.js";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const SIX = 6 * HOUR;
const TEN = 10 * HOUR;
const settings = (maxRoundMinutes: number, stopMinutes = 0): RoutingSettings =>
  RoutingSettings.define({ ...RoutingSettings.DEFAULTS, maxRoundMinutes, stopMinutes });

const loose = (id: string): PlannableStop => ({ id, window: null, homeRoundId: null });
const home = (id: string, roundId: string): PlannableStop => ({
  id,
  window: null,
  homeRoundId: roundId,
});

function input(
  overrides: Partial<ProposalInput> & Pick<ProposalInput, "stops" | "cost">,
): ProposalInput {
  return {
    depotId: "depot",
    vehicles: [{ id: "v1", name: "Kangoo" }],
    recomposable: [],
    settings: settings(240),
    ...overrides,
  };
}

describe("proposer (L7-C5, L7-C15, L7b-C1 à C3)", () => {
  const twoSides = lineCost({ depot: 0, e1: 3, e2: 4, e3: 5, w1: -3, w2: -4, w3: -5 });
  const sides = ["e1", "e2", "e3", "w1", "w2", "w3"].map(loose);

  /**
   * Réécrit le 2026-09-29 (lot 7 bis) : l'ancien test attendait « un côté par
   * véhicule », ce que faisait la répartition par proximité (k-medoids) même
   * quand un seul véhicule tenait tout. Le calcul par insertion n'ouvre une
   * tournée que si elle paie.
   */
  it("un seul véhicule quand sa tournée tient : pas de tournée ouverte pour rien", () => {
    const proposal = proposeRounds(
      input({
        cost: twoSides,
        stops: sides,
        vehicles: [
          { id: "v2", name: "Trafic" },
          { id: "v1", name: "Kangoo" },
        ],
      }),
    );

    expect(proposal.tours).toHaveLength(1);
    expect(proposal.tours[0]?.stops).toHaveLength(6);
    expect(proposal.overflow).toEqual([]);
  });

  /**
   * Réécrit le 2026-10-03 (CA2, Q2) : c'était la durée maximale (30 min) qui
   * forçait la répartition. Elle ne refuse plus rien ; ce sont les échéances
   * qui la forcent désormais.
   */
  it("répartit entre les véhicules quand un seul ne tient pas les échéances, un côté chacun", () => {
    // e3 et w3, aux deux bouts, ferment à 0 h 12 : un seul véhicule en
    // manquerait un, même parti à minuit.
    const wide = lineCost({ depot: 0, e1: 6, e2: 8, e3: 10, w1: -6, w2: -8, w3: -10 });
    const tight = { start: null, end: DAY_START + 12 * MINUTE };
    const proposal = proposeRounds(
      input({
        cost: wide,
        stops: sides.map((stop) =>
          stop.id === "e3" || stop.id === "w3" ? { ...stop, window: tight } : stop,
        ),
        vehicles: [
          { id: "v2", name: "Trafic" },
          { id: "v1", name: "Kangoo" },
        ],
      }),
    );

    const byVehicle = new Map(
      proposal.tours.map((tour) => [tour.vehicleId, tour.stops.map((stop) => stop.id).sort()]),
    );
    expect([...byVehicle.values()].sort()).toEqual([
      ["e1", "e2", "e3"],
      ["w1", "w2", "w3"],
    ]);
    expect(proposal.tours.every((tour) => tour.rank === 1 && tour.roundId === null)).toBe(true);
    expect(proposal.tours.flatMap((tour) => tour.timed.missed)).not.toContain(true);
    expect(proposal.overflow).toEqual([]);
  });

  it("est déterministe : même état, même proposition (L7-C12)", () => {
    const first = proposeRounds(input({ cost: twoSides, stops: sides }));
    const again = proposeRounds(input({ cost: twoSides, stops: [...sides].reverse() }));

    expect(again).toEqual(first);
  });

  /**
   * Réécrit le 2026-10-03 (CA2, Q2) : la durée maximale découpait. Un second
   * passage ne s'ouvre plus que s'il coûte moins qu'une tournée qui attend :
   * ici cinq heures devant la porte de b.
   */
  it("ouvre un second passage du même véhicule quand l'attente coûterait plus (Q13)", () => {
    const cost = lineCost({ depot: 0, a: 10, b: -10 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: [
          { ...loose("a"), window: { start: null, end: DAY_START + 30 * MINUTE } },
          { ...loose("b"), window: { start: 8 * HOUR, end: 8 * HOUR + 30 * MINUTE } },
        ],
      }),
    );

    expect(proposal.tours.map((tour) => [tour.vehicleId, tour.rank])).toEqual([
      ["v1", 1],
      ["v1", 2],
    ]);
    const [first, second] = proposal.tours;
    expect(second?.timed.departure).toBeGreaterThanOrEqual(first?.timed.return ?? Infinity);
    expect(proposal.tours.flatMap((tour) => tour.timed.missed)).toEqual([false, false]);
  });

  /** Réécrit le 2026-10-03 (CA2, Q2) : la durée maximale faisait déborder. */
  it("un seul passage permis : tout tient dans le premier, signalé long (Q2)", () => {
    const cost = lineCost({ depot: 0, a: 10, b: 11, c: -10, d: -11 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: ["a", "b", "c", "d"].map(loose),
        settings: settings(30),
        passageLimits: new Map([["v1", 1]]),
      }),
    );

    expect(proposal.tours).toHaveLength(1);
    expect(proposal.tours[0]?.overDuration).toBe(true);
    expect(proposal.overflow).toEqual([]);
  });

  it("aucun passage permis : tout déborde, signalé", () => {
    const proposal = proposeRounds(
      input({
        cost: lineCost({ depot: 0, a: 10 }),
        stops: [loose("a")],
        passageLimits: new Map([["v1", 0]]),
      }),
    );

    expect(proposal.tours).toEqual([]);
    expect(proposal.overflow).toEqual(["a"]);
  });

  it("compte le temps d'arrêt dans la durée signalée", () => {
    const cost = lineCost({ depot: 0, a: 5, b: 6 });

    // 5 + 1 + 6 = 12 minutes de route ; avec 10 minutes par arrêt, 32 > 30.
    const proposal = proposeRounds(
      input({ cost, stops: ["a", "b"].map(loose), settings: settings(30, 10) }),
    );

    expect(proposal.tours).toHaveLength(1);
    expect(proposal.tours[0]?.overDuration).toBe(true);
  });

  it("une tournée de plus de 240 minutes est acceptée, mais signalée longue (CA2, Q2)", () => {
    // Deux heures dix de route à l'aller, autant au retour.
    const cost = lineCost({ depot: 0, near: 2, far: 130 });

    const proposal = proposeRounds(input({ cost, stops: ["near", "far"].map(loose) }));

    expect(proposal.overflow).toEqual([]);
    expect(proposal.tours).toHaveLength(1);
    const [tour] = proposal.tours;
    const timed = tour?.timed;
    expect(timed === undefined ? 0 : durationOf(timed)).toBeGreaterThan(240 * MINUTE);
    expect(tour?.overDuration).toBe(true);
  });

  it("un arrêt qui déborde et AVAIT une tournée y reste, et la tournée est signalée trop longue", () => {
    const cost = lineCost({ depot: 0, far: 20 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: [home("far", "r_old")],
        recomposable: [{ roundId: "r_old", vehicleId: "v9", vehicleName: "Vieux", passage: 1 }],
        settings: settings(30),
        passageLimits: new Map([["v1", 0]]),
      }),
    );

    expect(proposal.overflow).toEqual([]);
    const kept = proposal.tours.find((tour) => tour.roundId === "r_old");
    expect(kept?.stops.map((s) => s.id)).toEqual(["far"]);
    expect(kept?.overDuration).toBe(true);
  });

  it("reprend les tournées recomposables du véhicule dans l'ordre de leur passage", () => {
    const cost = lineCost({ depot: 0, a: 10, b: -10 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: [
          { ...home("a", "r2"), window: { start: null, end: DAY_START + 30 * MINUTE } },
          { ...loose("b"), window: { start: 8 * HOUR, end: 8 * HOUR + 30 * MINUTE } },
        ],
        recomposable: [
          { roundId: "r2", vehicleId: "v1", vehicleName: "Kangoo", passage: 2 },
          { roundId: "r1", vehicleId: "v1", vehicleName: "Kangoo", passage: 1 },
        ],
      }),
    );

    expect(proposal.tours.map((tour) => tour.roundId)).toEqual(["r1", "r2"]);
  });

  /**
   * Réécrit le 2026-10-03 (CA2) : au départ fixé à 6 h, l'arrêt qui ferme à
   * 6 h 05 devait passer en premier. Le départ se calcule désormais à rebours :
   * quel que soit l'ordre, on part assez tôt, et personne n'est en retard.
   */
  it("part assez tôt pour l'arrêt dont le créneau finit tôt (L7-C4, CA2)", () => {
    const near = lineCost({ depot: 0, minus1: -1, plus4: 4 });
    const proposal = proposeRounds(
      input({
        cost: near,
        stops: [
          loose("minus1"),
          { ...loose("plus4"), window: { start: null, end: SIX + 5 * MINUTE } },
        ],
      }),
    );

    const [tour] = proposal.tours;
    expect(tour?.timed.missed).toEqual([false, false]);
    expect(tour?.timed.departure).toBeLessThan(SIX);
  });

  it("tient compte du sens : une matrice asymétrique change l'ordre", () => {
    // Redescendre vers les petites abscisses coûte 10 minutes de plus : on
    // monte d'abord jusqu'au bout, pour ne redescendre qu'une fois.
    const oneWay = lineCost({ depot: 0, plus1: 1, minus2: -2, plus4: 4 }, 10);

    const proposal = proposeRounds(
      input({ cost: oneWay, stops: ["plus1", "minus2", "plus4"].map(loose) }),
    );

    expect(proposal.tours[0]?.stops.map((s) => s.id)).toEqual(["plus1", "plus4", "minus2"]);
  });

  it("ne rend un arrêt hors créneau que si aucune place ne l'évite (L7b-C1)", () => {
    // a et b ferment à 0 h 15, aux deux bouts : un seul véhicule arriverait en
    // retard chez l'un des deux, même parti à minuit (CA2). Le second véhicule
    // les tient tous les deux.
    const cost = lineCost({ depot: 0, a: 10, b: -10 });
    const early = { start: null, end: DAY_START + 15 * MINUTE };

    const proposal = proposeRounds(
      input({
        cost,
        stops: [
          { ...loose("a"), window: early },
          { ...loose("b"), window: early },
        ],
        vehicles: [
          { id: "v1", name: "Kangoo" },
          { id: "v2", name: "Trafic" },
        ],
      }),
    );

    expect(proposal.tours).toHaveLength(2);
    expect(proposal.tours.flatMap((tour) => tour.timed.missed)).toEqual([false, false]);
    expect(new Set(proposal.tours.map((tour) => tour.vehicleId)).size).toBe(2);
  });

  it("préfère la première tournée d'un véhicule libre à un second passage (L7b-C3)", () => {
    // Même lieu, créneaux de 6 h et de 10 h : une seule tournée attendrait
    // quatre heures, ce qui coûte plus qu'une tournée ouverte. Deux tournées,
    // donc — mais sur deux véhicules, pas deux passages du même.
    const cost = lineCost({ depot: 0, a: 10, b: 10 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: [
          { ...loose("a"), window: { start: SIX, end: SIX + 30 * MINUTE } },
          { ...loose("b"), window: { start: TEN, end: TEN + 30 * MINUTE } },
        ],
        vehicles: [
          { id: "v1", name: "Kangoo" },
          { id: "v2", name: "Trafic" },
        ],
      }),
    );

    expect(proposal.tours.map((tour) => [tour.vehicleId, tour.rank])).toEqual([
      ["v1", 1],
      ["v2", 1],
    ]);
  });

  it("n'ouvre pas de second passage pour un arrêt que la tournée pouvait prendre", () => {
    // Le cas des Arcs (2026-09-29) : deux arrêts voisins, créneaux 6 h 30-8 h
    // et 8 h-9 h. L'ancien calcul en faisait deux allers-retours.
    const cost = lineCost({ depot: 0, a: 50, b: 52 });

    const proposal = proposeRounds(
      input({
        cost,
        stops: [
          { ...loose("a"), window: { start: SIX + 30 * MINUTE, end: 8 * HOUR } },
          { ...loose("b"), window: { start: 8 * HOUR, end: 9 * HOUR } },
        ],
        settings: settings(240, 5),
      }),
    );

    expect(proposal.tours.map((tour) => tour.stops.map((s) => s.id))).toEqual([["a", "b"]]);
    expect(proposal.tours[0]?.timed.missed).toEqual([false, false]);
  });

  it("sans arrêt situé, rien à proposer", () => {
    expect(proposeRounds(input({ cost: lineCost({ depot: 0 }), stops: [] }))).toEqual({
      tours: [],
      overflow: [],
      capacityRefused: [],
    });
  });
});
