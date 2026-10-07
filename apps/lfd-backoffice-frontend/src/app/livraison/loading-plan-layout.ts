import { computed, type Signal } from '@angular/core';
import type { DeliveryLoadingPlanView } from '@lfd/contracts';

import { placementLine } from './delivery-loading-placement';
import {
  currentRow,
  floorRows,
  nextBin,
  type StackTile,
  stackTiles,
} from './delivery-loading-rows';
import { rowColumns, rowTabs, rowTitle, stackColumns, stackScales } from './delivery-loading-tiles';

/** Ce dont la mise en rangées a besoin : le plan lu, et ce que le livreur a fait. */
export interface LoadingPlanLayoutSources {
  readonly plan: Signal<DeliveryLoadingPlanView | null>;
  readonly loaded: Signal<ReadonlySet<string>>;
  /** Le bac désigné d'un toucher. */
  readonly picked: Signal<string | null>;
  /** La rangée figée d'un toucher sur un onglet. */
  readonly pinnedRow: Signal<number | null>;
}

/**
 * **Le plan de chargement mis en rangées, en piles et en onglets** — les
 * dérivations de l'écran « Charger », sorties du composant `LoadingRound` qui
 * garde le cycle de vie et les gestes. Ce sont des `computed` et non des
 * fonctions pures parce que la rangée ouverte suit le prochain bac, qui suit
 * les scans : le composant les relit telles quelles.
 */
export function loadingPlanLayout({ plan, loaded, picked, pinnedRow }: LoadingPlanLayoutSources) {
  const tiles = computed(() => {
    const current = plan();
    return current === null
      ? new Map<number, readonly StackTile[]>()
      : stackTiles(current.order, loaded());
  });
  /** Les proportions des bacs, sur le type le plus haut du plan. */
  const scales = computed(() => stackScales(plan()?.stacks ?? []));
  const rows = computed(() => {
    const current = plan();
    return current === null || current.floor === null
      ? []
      : floorRows(current.stacks, current.order, loaded());
  });
  const next = computed(() => {
    const current = plan();
    return current === null ? null : nextBin(current, loaded(), picked());
  });
  const nextKey = computed(() => next()?.key ?? null);
  const placement = computed(() => {
    const current = plan();
    const bin = next();
    return current === null || bin === null ? null : placementLine(current, bin.bin);
  });

  /** La rangée ouverte : figée d'un toucher, sinon celle du prochain bac. */
  const openRow = computed(() => {
    const all = rows();
    const pinned = pinnedRow();
    if (pinned !== null && all.some((row) => row.row === pinned)) {
      return pinned;
    }
    const stackIndex = next()?.bin.stackIndex;
    const own = all.find((row) => row.stacks.some((stack) => stack.stackIndex === stackIndex));
    return own?.row ?? currentRow(all) ?? all[0]?.row ?? null;
  });
  const openRowView = computed(() => {
    const row = rows().find((entry) => entry.row === openRow());
    return row === undefined
      ? null
      : {
          title: rowTitle(row.row, rows().at(-1)?.row ?? row.row),
          columns: rowColumns(row, tiles(), scales()),
        };
  });
  const tabs = computed(() => rowTabs(rows(), tiles(), nextKey()));

  /** Sans plancher : toutes les piles, dans l'ordre d'ouverture. */
  const allColumns = computed(() => stackColumns(plan()?.stacks ?? [], tiles(), scales()));
  const coldColumns = computed(() =>
    stackColumns(
      (plan()?.stacks ?? []).filter((stack) => stack.placement?.kind === 'refrigerated'),
      tiles(),
      scales(),
    ),
  );
  const offFloorColumns = computed(() =>
    stackColumns(
      (plan()?.stacks ?? []).filter((stack) => stack.placement?.kind === 'off_floor'),
      tiles(),
      scales(),
    ),
  );

  return {
    rows,
    next,
    nextKey,
    placement,
    openRow,
    openRowView,
    tabs,
    allColumns,
    coldColumns,
    offFloorColumns,
  };
}
