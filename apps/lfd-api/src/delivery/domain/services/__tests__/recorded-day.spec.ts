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
  options: { readonly settings?: RoutingSettings; readonly keptRound?: boolean } = {},
): ReturnType<typeof proposeRounds> {
  const settings = options.settings ?? RoutingSettings.defaults();
  return proposeRounds({
    depotId: "depot",
    stops: recordedStops((keptRound) => !keptRound).map((stop) => ({ ...stop, homeRoundId: null })),
    vehicles: VEHICLES,
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
  it("sans marge de sécurité : deux tournées, sans passage d'un seul arrêt, sans attente ni retard", () => {
    const settings = RoutingSettings.define({
      ...RoutingSettings.DEFAULTS,
      safetyMarginMinutes: 0,
    });
    const proposal = proposeRecordedDay({ settings });

    expect(proposal.overflow).toEqual([]);
    expect(measure(proposal.tours)).toEqual({
      tours: 2,
      km: 261,
      minutes: 396,
      waitMinutes: 0,
      lateStops: 0,
      singleStopTours: 0,
      marginStops: 2,
    });
    expect(proposal.tours.every((tour) => tour.rank === 1 && !tour.overDuration)).toBe(true);
  });

  /**
   * Lot 7 ter (L7t-C1) : la marge de 20 minutes passe avant les heures de
   * livreur. Un arrêt de moins dans la marge coûte ici une tournée de plus
   * (3 au lieu de 2, 305 km au lieu de 261) — c'est l'ordre voulu par Hugo,
   * « on maximise pour le client ».
   */
  it("avec la marge d'usine : une tournée de plus, un arrêt de moins servi dans la marge", () => {
    const proposal = proposeRecordedDay();

    expect(proposal.overflow).toEqual([]);
    expect(measure(proposal.tours)).toEqual({
      tours: 3,
      km: 305,
      minutes: 465,
      waitMinutes: 7,
      lateStops: 0,
      singleStopTours: 0,
      marginStops: 1,
    });
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
      tours: 3,
      km: 304,
      minutes: 467,
      waitMinutes: 7,
      lateStops: 0,
      singleStopTours: 1,
      marginStops: 1,
    });
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
