import type { PlannedRound, PlannedTiming } from './delivery-planning';
import { timeLabel } from '../shared/window-label';
import type { BoardRound } from './rounds-board-model';

/**
 * Ce que la carte et l'en-tête d'une tournée lisent du tableau : le format de
 * la carte, la liste sous la carte, la durée et la distance. Sorti de
 * `rounds-board-model.ts`.
 */

/** Une tournée du tableau, au format que lit la carte. */
export function plannedOfBoard(round: BoardRound): PlannedRound {
  return {
    key: round.key,
    roundId: round.roundId,
    vehicleId: round.vehicleId,
    vehicleName: round.vehicleName,
    passage: round.passage,
    lock: round.frozen ? 'departed' : null,
    kept: false,
    keptReason: null,
    touched: false,
    timing: round.timing,
    geometry: round.geometry,
    stops: round.stops.map((stop) => ({
      orderId: stop.orderId,
      reference: stop.reference,
      arrival: null,
      window: stop.window,
      // La carte marque en rouge un retard de l'aperçu comme une place intenable (CA5).
      windowMissed: stop.windowMissed || stop.placementLate,
      sheet: stop.sheet,
    })),
  };
}

/** La liste sous la carte : « P1 · Bistrot du Vallon », « Kangoo · Le Refuge ». */
export function mapRowPrefixOf(round: BoardRound, inVehicle: boolean, several: boolean): string {
  if (!several) {
    return '';
  }
  if (inVehicle) {
    return `P${String(round.passage)} · `;
  }
  const first = round.vehicleName.trim().split(/\s+/u)[0] ?? round.vehicleName;
  return round.passage > 1 ? `${first} ${String(round.passage)} · ` : `${first} · `;
}

const METERS_PER_KM = 1000;

/** « 42 km » — à l'entier ; sous le kilomètre, « < 1 km » plutôt qu'un « 0 km » qui ment. */
export function roundKmLabel(meters: number): string {
  const km = Math.round(meters / METERS_PER_KM);
  return meters < METERS_PER_KM || km < 1 ? '< 1 km' : `${km.toLocaleString('fr-FR')} km`;
}

/** « Départ 5 h 40 · Retour 8 h 15 · 42 km » — l'en-tête d'une tournée proposée. */
export function roundTimingLabel(timing: PlannedTiming): string {
  return `Départ ${timeLabel(timing.departureTime)} · Retour ${timeLabel(timing.returnTime)} · ${roundKmLabel(timing.meters)}`;
}
