import { RoutingSettings } from "../../value-objects/routing-settings.js";
import { proposeRounds } from "../propose-rounds.js";
import { measure, recordedCost, recordedStops } from "./recorded-day.js";

const VEHICLES = [
  { id: "v1", name: "Camionnette 1" },
  { id: "v2", name: "Camionnette 2" },
  { id: "v3", name: "Camionnette 3" },
];

function proposeRecordedDay(): ReturnType<typeof proposeRounds> {
  return proposeRounds({
    depotId: "depot",
    stops: recordedStops((keptRound) => !keptRound).map((stop) => ({ ...stop, homeRoundId: null })),
    vehicles: VEHICLES,
    recomposable: [],
    cost: recordedCost(),
    settings: RoutingSettings.defaults(),
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
  it("tient en deux tournées, sans passage d'un seul arrêt, sans attente ni retard", () => {
    const proposal = proposeRecordedDay();

    expect(proposal.overflow).toEqual([]);
    expect(measure(proposal.tours)).toEqual({
      tours: 2,
      km: 261,
      minutes: 396,
      waitMinutes: 0,
      lateStops: 0,
      singleStopTours: 0,
    });
    expect(proposal.tours.every((tour) => tour.rank === 1 && !tour.overDuration)).toBe(true);
  });

  it("place les onze livraisons, chacune une fois", () => {
    const placed = proposeRecordedDay().tours.flatMap((tour) => tour.stops.map((stop) => stop.id));

    expect([...placed].sort()).toEqual(
      recordedStops((keptRound) => !keptRound)
        .map((stop) => stop.id)
        .sort(),
    );
  });

  it("est déterministe : même journée, même proposition", () => {
    expect(proposeRecordedDay()).toEqual(proposeRecordedDay());
  });
});
