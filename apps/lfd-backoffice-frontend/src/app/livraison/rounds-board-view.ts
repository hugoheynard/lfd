import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import type { FoldSelectOption, FoldViewToggleOption } from 'fold-ng';

import type { MapDeparture } from './delivery-map/delivery-map';
import type { PlannedRound } from './delivery-planning';
import {
  type ListSlot,
  passageCountLabel,
  shortRoundLabel,
  windowShortLabel,
} from './delivery-rounds';
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

/** La vue « Par véhicule » de l'onglet Tournées — aussi sa valeur dans l'adresse. */
export const VIEW_VEHICLE = 'vehicule' as const;
/** La vue « Toutes » : les tournées côte à côte, sans carte. */
export const VIEW_ALL = 'toutes' as const;

/** Ce que l'onglet regarde : une vue, et en « Par véhicule », le véhicule demandé. */
export interface BoardFocus {
  readonly view: typeof VIEW_ALL | typeof VIEW_VEHICLE;
  /** Le véhicule demandé ; `null` : le premier du jour. */
  readonly vehicleId: string | null;
  /** Le passage regardé, à partir de 1 — remis à 1 à chaque changement de véhicule. */
  readonly passage: number;
  /** En « Toutes », la carte à côté d'une colonne de tous les arrêts (`?carte=1`). */
  readonly map: boolean;
}

export const ALL_FOCUS: BoardFocus = { view: VIEW_ALL, vehicleId: null, passage: 1, map: false };

export const BOARD_VIEW_OPTIONS: readonly FoldViewToggleOption[] = [
  { value: VIEW_ALL, label: 'Toutes' },
  { value: VIEW_VEHICLE, label: 'Par véhicule' },
];

/**
 * Le nom d'une tournée dans Tour manager : le véhicule, et « · P2 » quand il
 * part plusieurs fois ce jour-là — « Camionnette 1 · P1 » (Hugo, 2026-10-26).
 */
export function roundChoiceLabel(
  round: Pick<BoardRound, 'vehicleId' | 'vehicleName' | 'passage'>,
  rounds: readonly Pick<BoardRound, 'vehicleId'>[],
): string {
  const passages = rounds.filter((other) => other.vehicleId === round.vehicleId).length;
  return passages > 1 ? `${round.vehicleName} · P${String(round.passage)}` : round.vehicleName;
}

/** Un arrêt de la colonne « tous les arrêts » de « Toutes » sur la carte. */
export interface MapRow {
  readonly orderId: string;
  readonly number: number;
  readonly color: string;
  readonly title: string;
  readonly window: string;
  readonly clash: boolean;
}

/** Tous les arrêts, numérotés par tournée, marqués et colorés par véhicule. */
export function mapRowsOf(
  mains: readonly BoardRound[],
  colorOf: (vehicleId: string) => string,
): readonly MapRow[] {
  return mains.flatMap((round) =>
    round.stops.map((stop, index) => ({
      orderId: stop.orderId,
      number: index + 1,
      color: colorOf(round.vehicleId),
      title: `${mapRowPrefixOf(round, false, mains.length > 1)}${cardTitleOf(stop)}`,
      window: windowShortLabel(stop.window),
      clash: stop.windowClash !== null,
    })),
  );
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

/**
 * **Où un arrêt de transfert peut aller** : les autres tournées ENREGISTRÉES
 * (`roundId` connu) et non parties — le serveur refuserait les autres (I6).
 */
export function transferTargetsOf(
  rounds: readonly BoardRound[],
  fromKey: string,
): readonly FoldSelectOption<string>[] {
  return rounds
    .filter((round) => round.key !== fromKey && round.roundId !== null && !round.frozen)
    .map((round) => ({ value: round.key, label: shortRoundLabel(round) }));
}
