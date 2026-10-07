import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import type { FoldViewToggleOption } from 'fold-ng';

import type { MapDeparture } from './delivery-map/delivery-map';
import { type PlannedRound, stopPointOf } from './delivery-planning';
import { type ListSlot, passageCountLabel, windowShortLabel } from './delivery-rounds';
import {
  alertCountOf,
  type BoardDrop,
  type BoardOrder,
  type BoardRound,
  cardMetaOf,
  cardTitleOf,
  mapRowPrefixOf,
  plannedOfBoard,
  POOL_KEY,
  type VehicleGroup,
} from './rounds-board-model';

/**
 * Les textes et les lignes que l'organisateur de tournées dérive de son état
 * de vue — le véhicule ouvert, les tournées regardées par la carte. Sortis de
 * `rounds-board.ts` en fonctions pures : le composant garde l'état, ceci le lit.
 */

/** La carte regarde le véhicule ouvert seul… */
export const SCOPE_VEHICLE = 'vehicle';
/** … ou toutes les tournées, les autres estompées. */
export const SCOPE_ALL = 'all';

/** Deux segments toujours, comme la maquette ; sur « Toutes », « Ce véhicule » ne vise rien. */
export const MAP_SCOPE_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: SCOPE_VEHICLE, label: 'Ce véhicule' },
  { value: SCOPE_ALL, label: 'Toutes' },
];

/** Une ligne de la liste sous la carte. */
export interface MapRow {
  readonly orderId: string;
  readonly number: number;
  readonly color: string;
  readonly title: string;
  readonly window: string;
  readonly clash: boolean;
}

/** « 6 arrêts · départ et retour Fournil · passage 2 en tirets ». */
export function mapSubtitleOf(
  mains: readonly BoardRound[],
  departure: MapDeparture | null,
  inVehicle: boolean,
): string {
  const count = mains.reduce((total, round) => total + round.stops.length, 0);
  const parts = [count === 1 ? '1 arrêt' : `${String(count)} arrêts`];
  if (departure !== null) {
    parts.push(`départ et retour ${departure.label}`);
  }
  if (inVehicle && mains.length > 1) {
    parts.push('passage 2 en tirets');
  }
  return parts.join(' · ');
}

/** La liste sous la carte, numérotée par tournée et colorée par véhicule. */
export function mapRowsOf(
  mains: readonly BoardRound[],
  inVehicle: boolean,
  colorOf: (vehicleId: string) => string,
): readonly MapRow[] {
  return mains.flatMap((round) =>
    round.stops.map((stop, index) => ({
      orderId: stop.orderId,
      number: index + 1,
      color: colorOf(round.vehicleId),
      title: `${mapRowPrefixOf(round, inVehicle, mains.length > 1)}${cardTitleOf(stop)}`,
      window: windowShortLabel(stop.window),
      clash: stop.windowClash !== null,
    })),
  );
}

/** Ce que la carte ne montre pas, dit sous elle : arrêts non situés, ordre intenable. */
export function mapNoteOf(mains: readonly BoardRound[]): string {
  const stops = mains.flatMap((round) => round.stops);
  const missing = stops.filter((stop) => stopPointOf({ sheet: stop.sheet }) === null).length;
  const parts: string[] = [];
  if (missing === 1) {
    parts.push('1 arrêt non situé, absent de la carte.');
  } else if (missing > 1) {
    parts.push(`${String(missing)} arrêts non situés, absents de la carte.`);
  }
  if (stops.some((stop) => stop.windowClash !== null)) {
    parts.push('Fenêtre intenable : l’ordre fait revenir en arrière.');
  }
  return parts.join(' ');
}

/** « Passage 1 » / « Tournée unique ». */
export function passageColumnTitle(rounds: readonly BoardRound[], index: number): string {
  return rounds.length > 1
    ? `Passage ${String(rounds[index]?.passage ?? index + 1)}`
    : 'Tournée unique';
}

/** « part en premier » / « après le passage 1 ». */
export function passageNoteOf(rounds: readonly BoardRound[], index: number): string | null {
  if (rounds.length < 2) {
    return null;
  }
  const previous = rounds[index - 1];
  return previous === undefined
    ? 'part en premier'
    : `après le passage ${String(previous.passage)}`;
}

/** Un onglet véhicule : son nom, ce qu'il compte, et ce qui y est à régler. */
export interface VehicleTab {
  readonly vehicleId: string;
  readonly label: string;
  readonly count: string;
  readonly alerts: number;
}

/** Ce qui est à régler dans plusieurs tournées, additionné. */
export function alertTotalOf(rounds: readonly BoardRound[]): number {
  return rounds.reduce((total, round) => total + alertCountOf(round), 0);
}

/** Les onglets, un par véhicule du jour. */
export function vehicleTabsOf(groups: readonly VehicleGroup[]): readonly VehicleTab[] {
  return groups.map((group) => ({
    vehicleId: group.vehicleId,
    label: group.vehicleName,
    count: passageCountLabel(group.rounds.length),
    alerts: alertTotalOf(group.rounds),
  }));
}

/** Les tournées des autres véhicules, estompées quand un véhicule est ouvert. */
export function mapMutedOf(
  rounds: readonly BoardRound[],
  vehicle: VehicleGroup | null,
): ReadonlySet<string> {
  return new Set(
    vehicle === null
      ? []
      : rounds.filter((round) => round.vehicleId !== vehicle.vehicleId).map((round) => round.key),
  );
}

/** Les passages après le premier du véhicule ouvert, en tirets. */
export function mapDashedOf(vehicle: VehicleGroup | null): ReadonlySet<string> {
  return new Set(vehicle === null ? [] : vehicle.rounds.slice(1).map((round) => round.key));
}

/** Le sous-titre de « À répartir » : en aperçu, ce que le calcul a laissé. */
export function poolSubtitleOf(preview: boolean): string {
  return preview
    ? 'Ce que le calcul n’a pas placé, avec sa raison.'
    : 'Dans aucune tournée : aucune ne doit partir oubliée.';
}

/** Un glisser lâché en `to` : la commande portée, et la place qu'elle quitte. */
export function draggedTo(event: CdkDragDrop<string, string, string>, to: ListSlot): BoardDrop {
  return {
    orderId: event.item.data,
    from: { list: event.previousContainer.data, index: event.previousIndex },
    to,
  };
}

/** « Mettre dans » : la commande `index` de « À répartir », en fin de `round`. */
export function putDropOf(order: BoardOrder, index: number, round: BoardRound): BoardDrop {
  return {
    orderId: order.orderId,
    from: { list: POOL_KEY, index },
    to: { list: round.key, index: round.stops.length },
  };
}

/** La fiche du client dont le carnet porte l'adresse ; `null` sans carnet. */
export function carnetUrlOf(order: BoardOrder): string | null {
  const company = order.sheet?.addressBook?.companyId;
  return company === undefined
    ? null
    : `/comptes-clients/${encodeURIComponent(company)}/informations`;
}

/** « CMD-2041 · Val-d’Isère » sur la carte d'une commande à répartir. */
export function orderMetaOf(order: BoardOrder): string {
  return cardMetaOf(order.reference, order.sheet);
}

/** La fenêtre d'une commande à répartir, lue sur sa feuille de route. */
export function orderWindowOf(order: BoardOrder): string {
  return windowShortLabel(order.sheet?.window ?? null);
}

/** Les tournées que la carte trace : celles qui ont au moins un arrêt. */
export function mapRoundsOf(shown: readonly BoardRound[]): readonly PlannedRound[] {
  return shown.filter((round) => round.stops.length > 0).map(plannedOfBoard);
}
