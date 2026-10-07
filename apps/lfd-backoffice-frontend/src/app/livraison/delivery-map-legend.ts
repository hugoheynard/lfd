import type { PlannedRound } from './delivery-planning';

/**
 * **Ce que la carte dit à côté du dessin** — la légende des véhicules et les
 * tournées sans tracé. Dérivations pures, sorties du composant `DeliveryMap`.
 */

/** Une entrée de légende : un véhicule, sa couleur. */
export interface MapLegendEntry {
  readonly name: string;
  readonly color: string;
}

/** Les tournées qui ont des arrêts mais pas de tracé : la carte le dit (L10b-C4). */
export function untracedVehicles(rounds: readonly PlannedRound[]): string[] {
  return rounds
    .filter((round) => round.stops.length > 0 && round.timing !== null && round.geometry === null)
    .map((round) => round.vehicleName);
}

/** Un véhicule par entrée, dans l'ordre des tournées ; une tournée vide n'y entre pas. */
export function mapLegend(
  rounds: readonly PlannedRound[],
  colorOf: (round: PlannedRound) => string,
): MapLegendEntry[] {
  const seen = new Set<string>();
  return rounds.flatMap((round) => {
    if (seen.has(round.vehicleName) || round.stops.length === 0) {
      return [];
    }
    seen.add(round.vehicleName);
    return [{ name: round.vehicleName, color: colorOf(round) }];
  });
}
