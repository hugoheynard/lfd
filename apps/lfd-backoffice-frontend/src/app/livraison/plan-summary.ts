import type { GpsPoint } from '@lfd/contracts';

import type { PlannedRound, PlannedStop } from './delivery-planning';

/**
 * Ce que l'écran « Planifier » LIT d'une composition déjà construite : le nom
 * et le point d'un arrêt, le décompte de l'en-tête. Sorti de
 * `delivery-planning.ts`, qui garde ce qui la construit et la modifie.
 * Type-only sur le contrat, pour la même raison que lui.
 */

/**
 * Le nom d'un arrêt : le LIBELLÉ DE L'ADRESSE livrée (« Le Chalet »), parce
 * qu'un client peut être livré à plusieurs endroits et que c'est l'endroit
 * qu'on cherche ; sinon la raison sociale ; sinon la référence seule.
 */
export function stopNameOf(stop: Pick<PlannedStop, 'reference' | 'sheet'>): string {
  if (stop.sheet === null) {
    return stop.reference;
  }
  const label = stop.sheet.address?.label.trim() ?? '';
  return label === '' ? stop.sheet.customerLabel : label;
}

/** Le point de l'arrêt, lu dans le carnet d'adresses ; `null` : pas de repère. */
export function stopPointOf(stop: Pick<PlannedStop, 'sheet'>): GpsPoint | null {
  return stop.sheet?.addressBook?.gps ?? null;
}

/** Ce que l'en-tête compte : ce qui demande l'attention, avant le détail. */
export interface PlanSummary {
  readonly deliveries: number;
  readonly vans: number;
  readonly late: number;
  readonly notReady: number;
  /** La distance totale des tournées chronométrées, en mètres. */
  readonly meters: number;
  /** Les tournées non vides — un véhicule peut en faire plusieurs. */
  readonly rounds: number;
}

export function planSummary(rounds: readonly PlannedRound[]): PlanSummary {
  const stops = rounds.flatMap((round) => round.stops);
  return {
    deliveries: stops.length,
    vans: new Set(
      rounds.filter((round) => round.stops.length > 0).map((round) => round.vehicleName),
    ).size,
    late: stops.filter((stop) => stop.windowMissed).length,
    notReady: stops.filter((stop) => stop.sheet?.state === 'expected').length,
    meters: rounds.reduce((sum, round) => sum + (round.timing?.meters ?? 0), 0),
    rounds: rounds.filter((round) => round.stops.length > 0).length,
  };
}
