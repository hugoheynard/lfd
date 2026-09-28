import { groupOf, MINUTES_PER_HOUR, type SlotClock, type SlotGroup } from './handover-slots';

/*
 * **La mise en page de la colonne 3** (Supervision v2, A8) — au-dessus des
 * tranches que `handover-slots.ts` construit : le filtre par point de retrait,
 * le repère « Maintenant », les tranches terminées descendues en bas.
 */

/** Ne garder que les commandes d'un point de retrait ; `null` = tous les points. */
export function atPoint(groups: readonly SlotGroup[], point: string | null): SlotGroup[] {
  if (point === null) {
    return [...groups];
  }
  return groups
    .map((group) =>
      groupOf(
        group.key,
        group.rows.filter((row) => row.pickupLabel === point),
      ),
    )
    .filter((group) => group.rows.length > 0);
}

/** Les points de retrait de la file, dans l'ordre alphabétique, avec leur compte. */
export function pickupPoints(
  groups: readonly SlotGroup[],
): readonly { readonly label: string; readonly count: number }[] {
  const counts = new Map<string, number>();
  for (const row of groups.flatMap((group) => group.rows)) {
    if (row.pickupLabel !== null && row.state !== 'cancelled') {
      counts.set(row.pickupLabel, (counts.get(row.pickupLabel) ?? 0) + 1);
    }
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([label, count]) => ({ label, count }));
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

/** La valeur « tous les points » du filtre — aucun libellé de point n'est vide. */
export const ALL_POINTS = '';

/** Les commandes d'un métier, annulées exclues — le compteur de l'onglet. */
export function totalOf(groups: readonly SlotGroup[]): number {
  return groups.reduce((sum, group) => sum + group.expected, 0);
}
