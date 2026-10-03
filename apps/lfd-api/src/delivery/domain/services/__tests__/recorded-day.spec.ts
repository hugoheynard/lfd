import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { proposeRounds } from "../propose-rounds.js";
import { busyStarts } from "../vehicle-availability.js";
import { measure, recordedCost, recordedStops } from "./recorded-day.js";

const VEHICLES = [
  { id: "v1", name: "Camionnette 1" },
  { id: "v2", name: "Camionnette 2" },
  { id: "v3", name: "Camionnette 3" },
];

const SECONDS_PER_MINUTE = 60;

/** 7 h 48 : le retour de la tournée chargée de Val d'Isère, telle qu'elle est composée. */
const KEPT_ROUND_RETURN_MINUTE = 7 * 60 + 48;

/** Camionnette 1 porte la tournée chargée de Val d'Isère (les six arrêts `k*`). */
function keptRoundStarts(settings: RoutingSettings) {
  const [first] = VEHICLES;
  return busyStarts({ depotId: "depot", cost: recordedCost(), settings }, [
    ...(first === undefined
      ? []
      : [
          {
            roundId: "kept",
            vehicle: first,
            passage: 1,
            stops: recordedStops((keptRound) => keptRound),
            departedAt: null,
          },
        ]),
  ]);
}

function proposeRecordedDay(
  options: {
    readonly settings?: RoutingSettings;
    readonly keptRound?: boolean;
    readonly vehicles?: typeof VEHICLES;
  } = {},
): ReturnType<typeof proposeRounds> {
  const settings = options.settings ?? RoutingSettings.defaults();
  return proposeRounds({
    depotId: "depot",
    stops: recordedStops((keptRound) => !keptRound).map((stop) => ({ ...stop, homeRoundId: null })),
    vehicles: options.vehicles ?? VEHICLES,
    recomposable: [],
    cost: recordedCost(),
    settings,
    ...(options.keptRound === true ? { starts: keptRoundStarts(settings) } : {}),
  });
}

/**
 * **Régression (L7b-C5)** : sur la journée du jeu de données, par la route
 * réelle, l'ancien calcul (k-medoids → ordre → découpe à 240 minutes)
 * proposait CINQ tournées pour onze livraisons — deux passages de deux arrêts
 * pour la même camionnette, deux passages d'UN arrêt pour une autre, 55 minutes
 * d'attente devant un créneau fermé. Mesuré le 2026-09-29 avant sa
 * suppression : 5 tournées, 409 km, 656 minutes, 55 minutes d'attente, aucun
 * retard, 2 tournées d'un seul arrêt.
 */
describe("la journée enregistrée (L7b-C5)", () => {
  /**
   * Remesuré le 2026-10-03 (CA2) : départ à rebours, durée maximale réduite à
   * un signal. Avant : 261 km, 396 min, 0 min d'attente, 2 arrêts dans la
   * marge. Sans marge visée, le départ au plus tard fait arriver À l'échéance
   * (4 arrêts dans les 20 dernières minutes) ; l'heuristique reste sur deux
   * tournées alors qu'une seule tiendrait (cf. le test suivant) : un optimum
   * local, pas une règle.
   */
  it("sans marge de sécurité : deux tournées, sans passage d'un seul arrêt, sans retard", () => {
    const settings = RoutingSettings.define({
      ...RoutingSettings.DEFAULTS,
      safetyMarginMinutes: 0,
    });
    const proposal = proposeRecordedDay({ settings });

    expect(proposal.overflow).toEqual([]);
    expect(measure(proposal.tours)).toEqual({
      tours: 2,
      km: 266,
      minutes: 427,
      waitMinutes: 27,
      lateStops: 0,
      singleStopTours: 0,
      marginStops: 4,
    });
    expect(proposal.tours.every((tour) => tour.rank === 1)).toBe(true);
  });

  /**
   * Lot 7 ter (L7t-C1) : la marge de 20 minutes passe avant les heures de
   * livreur. Remesuré le 2026-10-03 (CA2) : avant, la durée maximale de
   * 240 minutes imposait trois tournées (305 km, 465 min, un arrêt dans la
   * marge). Le départ visant la marge et la durée maximale n'étant plus
   * qu'un signal (Q2), une seule tournée, longue, tient tout le monde hors
   * de la marge.
   */
  it("avec la marge d'usine : une seule tournée, longue, personne dans la marge", () => {
    const proposal = proposeRecordedDay();

    expect(proposal.overflow).toEqual([]);
    expect(measure(proposal.tours)).toEqual({
      tours: 1,
      km: 258,
      minutes: 388,
      waitMinutes: 17,
      lateStops: 0,
      singleStopTours: 0,
      marginStops: 0,
    });
    expect(proposal.tours.every((tour) => tour.overDuration)).toBe(true);
  });

  it("place les onze livraisons, chacune une fois", () => {
    const placed = proposeRecordedDay().tours.flatMap((tour) => tour.stops.map((stop) => stop.id));

    expect([...placed].sort()).toEqual(
      recordedStops((keptRound) => !keptRound)
        .map((stop) => stop.id)
        .sort(),
    );
  });

  /**
   * Régression (L7t-C2) : Camionnette 1 chargée jusqu'à 7 h 48 recevait une
   * tournée à 6 h 23 — le calcul ne connaissait que les tournées qu'il
   * composait (constaté à l'écran le 2026-09-29, « pourquoi dans la démo j'ai
   * deux fois camionnette 1 ? »).
   */
  it("Camionnette 1 chargée jusqu'à 7 h 48 ne reçoit plus de tournée à 6 h 23", () => {
    const starts = keptRoundStarts(RoutingSettings.defaults());
    const proposal = proposeRecordedDay({ keptRound: true });
    const own = proposal.tours.filter((tour) => tour.vehicleId === "v1");

    expect(Math.floor((starts.get("v1")?.availableFrom ?? 0) / SECONDS_PER_MINUTE)).toBe(
      KEPT_ROUND_RETURN_MINUTE,
    );
    expect(
      own.every((tour) => tour.timed.departure >= KEPT_ROUND_RETURN_MINUTE * SECONDS_PER_MINUTE),
    ).toBe(true);
    expect(own.every((tour) => tour.rank >= 2)).toBe(true);
    expect(proposal.overflow).toEqual([]);
    expect(measure(proposal.tours)).toEqual({
      // Remesuré le 2026-10-03 (CA2) — avant : 3 tournées, 304 km, 467 min.
      tours: 1,
      km: 258,
      minutes: 388,
      waitMinutes: 17,
      lateStops: 0,
      singleStopTours: 0,
      marginStops: 0,
    });
  });

  /**
   * Depuis CA2 (2026-10-03), la journée tient en UNE tournée sur un autre
   * véhicule : Camionnette 1 ne reçoit plus rien, et le test précédent se
   * vérifiait sur une liste vide. Seule, elle doit bien recevoir le travail —
   * après son retour.
   */
  it("Camionnette 1 seule et chargée : sa tournée part après son retour, en second passage", () => {
    const [first] = VEHICLES;
    const proposal = proposeRecordedDay({
      keptRound: true,
      vehicles: first === undefined ? [] : [first],
    });

    expect(proposal.tours.length).toBeGreaterThan(0);
    expect(
      proposal.tours.every(
        (tour) =>
          tour.vehicleId === "v1" &&
          tour.rank >= 2 &&
          tour.timed.departure >= KEPT_ROUND_RETURN_MINUTE * SECONDS_PER_MINUTE,
      ),
    ).toBe(true);
  });

  it("un seul passage permis : Camionnette 1 chargée ne reçoit rien, le travail va aux autres", () => {
    const settings = RoutingSettings.define({
      ...RoutingSettings.DEFAULTS,
      multiplePassages: false,
    });
    const proposal = proposeRounds({
      depotId: "depot",
      stops: recordedStops((keptRound) => !keptRound).map((stop) => ({
        ...stop,
        homeRoundId: null,
      })),
      vehicles: VEHICLES,
      recomposable: [],
      cost: recordedCost(),
      settings,
      passageLimits: new Map([
        ["v1", 0],
        ["v2", 1],
        ["v3", 1],
      ]),
      starts: keptRoundStarts(settings),
    });

    expect(proposal.tours.some((tour) => tour.vehicleId === "v1")).toBe(false);
    expect(proposal.tours.flatMap((tour) => tour.stops)).toHaveLength(11);
  });

  it("est déterministe : même journée, même proposition", () => {
    expect(proposeRecordedDay()).toEqual(proposeRecordedDay());
  });
});
