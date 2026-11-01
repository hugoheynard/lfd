import type { LogisticsCategory } from '../shared/logistics-colors/logistics-category';
import {
  groupOf,
  MINUTES_PER_HOUR,
  type SlotClock,
  type SlotGroup,
  type SlotRow,
} from './handover-slots';
import { inRoutes } from './route-filter';

/*
 * **La mise en page de la colonne 3** (Supervision v2, A8) — au-dessus des
 * tranches que `handover-slots.ts` construit : le filtre d'acheminement,
 * le repère « Maintenant », les tranches terminées descendues en bas.
 */

/**
 * Ne garder que les lignes retenues par le filtre d'acheminement (2026-11-01 :
 * multi-sélection, `route-filter.ts`), comptes recalculés et tranches vides
 * retirées. Rien de coché = toutes les tranches telles quelles.
 */
export function atRoutes(
  groups: readonly SlotGroup[],
  selected: readonly string[],
  modeOf: (row: SlotRow) => LogisticsCategory,
): SlotGroup[] {
  if (selected.length === 0) {
    return [...groups];
  }
  return groups
    .map((group) => groupOf(group.key, inRoutes(group.rows, selected, modeOf)))
    .filter((group) => group.rows.length > 0);
}

/** Les lignes non annulées des tranches — ce que comptent les options du filtre. */
export function liveRows(groups: readonly SlotGroup[]): readonly SlotRow[] {
  return groups.flatMap((group) => group.rows).filter((row) => row.state !== 'cancelled');
}

/** Une tranche PASSÉE où tout ce qui était attendu est parti (A8). */
export function isFinished(group: SlotGroup, clock: SlotClock | undefined): boolean {
  return (
    clock !== undefined &&
    group.endMinutes !== null &&
    group.endMinutes <= clock.minutes &&
    group.handedOver > 0 &&
    group.handedOver === group.expected
  );
}

export type SlotItem =
  | { readonly kind: 'now'; readonly label: string }
  | { readonly kind: 'group'; readonly group: SlotGroup; readonly finished: boolean }
  | { readonly kind: 'finished'; readonly count: number };

/**
 * **L'ordre de la colonne** (A8) : les tranches vivantes, le repère
 * « Maintenant » avant la première qui n'a pas commencé, puis — sous
 * « Terminées · n » — les tranches passées où tout est parti.
 */
export function slotLayout(
  groups: readonly SlotGroup[],
  clock: SlotClock | undefined,
): readonly SlotItem[] {
  const finished = groups.filter((group) => isFinished(group, clock));
  const live = groups.filter((group) => !isFinished(group, clock));
  const items: SlotItem[] = [];
  const label = clock?.label ?? null;
  const now: SlotItem | null =
    label === null || groups.length === 0 ? null : { kind: 'now', label };
  let placed = now === null;
  for (const group of live) {
    const started =
      group.endMinutes !== null && group.endMinutes - MINUTES_PER_HOUR <= (clock?.minutes ?? 0);
    if (now !== null && !placed && !started) {
      items.push(now);
      placed = true;
    }
    items.push({ kind: 'group', group, finished: false });
  }
  if (now !== null && !placed) {
    items.push(now);
  }
  if (finished.length > 0) {
    items.push({ kind: 'finished', count: finished.length });
    items.push(...finished.map((group) => ({ kind: 'group' as const, group, finished: true })));
  }
  return items;
}

/** Les commandes d'un métier, annulées exclues — le compteur de l'onglet. */
export function totalOf(groups: readonly SlotGroup[]): number {
  return groups.reduce((sum, group) => sum + group.expected, 0);
}
