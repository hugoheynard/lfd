import type {
  DeliveryLoadingPlanBinView,
  DeliveryLoadingPlanOverArchView,
  DeliveryLoadingPlanView,
} from '@lfd/contracts';

import { planBinKey } from './delivery-loading-plan';
import { floorRows, type StackTile, stackTiles } from './delivery-loading-rows';

/**
 * **La consigne de pose, dite comme le livreur la voit** — la rangée, la pile,
 * le côté et ce qu'il y a dessous. Sortie de `delivery-loading-rows.ts`, qui
 * DÉRIVE les rangées et les piles : ici, on ne fait que les mettre en mots.
 */

/** « le fond », « au milieu », « les portes » — où est une rangée, parmi `rowCount`. */
export function rowPlace(row: number, rowCount: number): string {
  if (row <= 1) {
    return 'le fond';
  }
  return row >= rowCount ? 'les portes' : 'au milieu';
}

/** « à gauche », « au milieu », « à droite » — la place d'une pile dans sa rangée, vu des portes. */
export function stackSide(index: number, count: number): string {
  if (index <= 0) {
    return 'à gauche';
  }
  return index >= count - 1 ? 'à droite' : 'au milieu';
}

/**
 * « au-dessus du passage de roue gauche, à partir de l'étage 2, 3 bacs au
 * plus » — une pile posée sur un passage de roue (G5b) : sans ça, le livreur
 * la poserait au sol, là où elle ne tient pas.
 */
export function overArchClause(overArch: DeliveryLoadingPlanOverArchView): string {
  const side = overArch.side === 'left' ? 'gauche' : 'droit';
  const bins = overArch.levels > 1 ? 'bacs' : 'bac';
  return `au-dessus du passage de roue ${side}, à partir de l’étage ${String(overArch.fromLevel)}, ${String(overArch.levels)} ${bins} au plus`;
}

/** La consigne de pose, en deux lignes : où, puis sur quoi. */
export interface PlacementLine {
  readonly lead: string;
  readonly detail: string;
}

/** « en bas », « sur le bac de l'arrêt 6 », « sur le bac partagé 1·2 » — ce qu'on voit sous le bac. */
function restingOn(tiles: readonly StackTile[], key: string): string {
  const index = tiles.findIndex((tile) => tile.bins.some((bin) => bin.key === key));
  const below = index > 0 ? tiles[index - 1] : undefined;
  if (below === undefined) {
    return 'en bas';
  }
  const stops = below.stopPositions.map(String).join('·');
  return below.shared ? `sur le bac partagé ${stops}` : `sur le bac de l’arrêt ${stops}`;
}

/**
 * **Où poser un bac, dit comme le livreur le voit** : la rangée et la pile,
 * puis le côté et ce qu'il y a dessous. « Sur le bac de l'arrêt 6 » est le
 * bac juste en dessous dans la pile — le repère qu'on a sous les yeux.
 * `null` si le bac n'est pas dans le plan.
 */
export function placementLine(
  plan: Pick<DeliveryLoadingPlanView, 'order' | 'stacks'>,
  target: Pick<DeliveryLoadingPlanBinView, 'binId' | 'half'>,
): PlacementLine | null {
  const key = planBinKey(target);
  const bin = plan.order.flatMap((step) => step.bins).find((entry) => planBinKey(entry) === key);
  const stack = plan.stacks.find((entry) => entry.stackIndex === bin?.stackIndex);
  if (bin === undefined || stack === undefined) {
    return null;
  }
  const below = restingOn(stackTiles(plan.order, new Set()).get(stack.stackIndex) ?? [], key);
  const pile = `Pile ${String(stack.stackIndex)}`;
  const placement = stack.placement;
  switch (placement?.kind) {
    case 'refrigerated':
      return { lead: 'Caisse froide ❄', detail: 'hors plancher · au froid' };
    case 'off_floor':
      return { lead: `${pile} · hors plancher`, detail: below };
    case 'floor': {
      const rows = floorRows(plan.stacks, plan.order, new Set());
      const row = rows.find((entry) => entry.row === placement.row);
      const index = row?.stacks.findIndex((entry) => entry.stackIndex === stack.stackIndex) ?? 0;
      const place = rowPlace(placement.row, rows.at(-1)?.row ?? placement.row);
      return {
        lead: `Rangée ${String(placement.row)} (${place}) · pile ${String(stack.stackIndex)}`,
        detail:
          placement.overArch === undefined
            ? `${stackSide(index, row?.stacks.length ?? 1)}, ${below}`
            : `${overArchClause(placement.overArch)}, ${below}`,
      };
    }
    case undefined:
      return { lead: `${pile} · ${stack.binTypeName}`, detail: below };
  }
}
