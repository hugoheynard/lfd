import type {
  DeliveryLoadingPlanBinView,
  DeliveryLoadingPlanStackView,
  DeliveryLoadingPlanStepView,
  DeliveryLoadingPlanView,
  LoadDeliveryBinPayload,
} from '@lfd/contracts';

import { halfLabel } from './delivery-loading';
import { planBinKey } from './delivery-loading-plan';

/**
 * **Les rangées du plancher, et ce qu'on met dans chacune** — des dérivations
 * pures. Le serveur rend la rangée de chaque pile posée au sol
 * (`placement.row`, 1 = le fond) ; l'écran regroupe, ordonne, et croise avec
 * l'ordre du plan pour dire, pile par pile, quels bacs poser du bas vers le
 * haut.
 */

/** Un bac (ou une moitié) dans sa pile, tel qu'on le pose. */
export interface RowBin {
  readonly key: string;
  readonly binId: string;
  readonly code: string;
  /** « Bac M · ½ gauche · ❄ ». */
  readonly typeLabel: string;
  readonly stopPosition: number;
  readonly customerLabel: string;
  readonly reference: string;
  readonly loaded: boolean;
}

/** Une pile de la rangée, ses bacs du bas vers le haut. */
export interface RowStack {
  readonly stackIndex: number;
  readonly binTypeName: string;
  readonly bins: readonly RowBin[];
  readonly loaded: boolean;
}

/** Une rangée du plancher : sa bande sur le dessin, ses piles de gauche à droite. */
export interface FloorRow {
  readonly row: number;
  readonly label: string;
  /** Début et profondeur de la bande depuis le fond, en cm du dessin. */
  readonly x: number;
  readonly depth: number;
  readonly stacks: readonly RowStack[];
  readonly binCount: number;
  readonly loadedCount: number;
}

/** Où va un bac : sa rangée et sa pile. */
export interface BinLocation {
  readonly row: number;
  readonly stackIndex: number;
  readonly code: string;
}

/** « Bac M · ½ gauche · ❄ » — le type d'un bac, en une ligne courte. */
export function binTypeLabel(
  bin: Pick<DeliveryLoadingPlanBinView, 'binTypeName' | 'half' | 'isotherm'>,
): string {
  return [bin.binTypeName, halfLabel(bin.half), bin.isotherm ? '❄' : null]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/**
 * Les bacs de chaque pile, du bas vers le haut. L'ordre du plan EST l'ordre de
 * pose : ses étapes vont dans l'ordre de chargement et chaque bac va sur sa
 * pile au moment de son étape, donc le premier rencontré est en bas. Le
 * client d'une moitié est celui de SA commande (`bin.reference`), pas
 * forcément celui de l'étape qui la charge.
 */
export function binsByStack(
  order: readonly DeliveryLoadingPlanStepView[],
  loaded: ReadonlySet<string>,
): ReadonlyMap<number, readonly RowBin[]> {
  const byReference = new Map(order.map((step) => [step.reference, step]));
  const stacks = new Map<number, RowBin[]>();
  for (const step of order) {
    for (const bin of step.bins) {
      const owner = byReference.get(bin.reference) ?? step;
      const key = planBinKey(bin);
      const line: RowBin = {
        key,
        binId: bin.binId,
        code: bin.code,
        typeLabel: binTypeLabel(bin),
        stopPosition: owner.stopPosition,
        customerLabel: owner.customerLabel,
        reference: bin.reference,
        loaded: loaded.has(key),
      };
      stacks.set(bin.stackIndex, [...(stacks.get(bin.stackIndex) ?? []), line]);
    }
  }
  return stacks;
}

/**
 * Les rangées du plancher, du fond vers les portes, chacune avec ses piles de
 * gauche à droite (vu des portes : `y` croissant). Seules les piles posées au
 * sol y entrent ; le hors-plancher et la caisse réfrigérée se disent à part.
 */
export function floorRows(
  stacks: readonly DeliveryLoadingPlanStackView[],
  order: readonly DeliveryLoadingPlanStepView[],
  loaded: ReadonlySet<string>,
): readonly FloorRow[] {
  const bins = binsByStack(order, loaded);
  const rows = new Map<
    number,
    { x: number; end: number; stacks: { y: number; stack: RowStack }[] }
  >();
  for (const stack of stacks) {
    const placement = stack.placement;
    if (placement?.kind !== 'floor') {
      continue;
    }
    const stackBins = bins.get(stack.stackIndex) ?? [];
    const entry = rows.get(placement.row) ?? { x: placement.xCm, end: 0, stacks: [] };
    entry.x = Math.min(entry.x, placement.xCm);
    entry.end = Math.max(entry.end, placement.xCm + placement.depthCm);
    entry.stacks.push({
      y: placement.yCm,
      stack: {
        stackIndex: stack.stackIndex,
        binTypeName: stack.binTypeName,
        bins: stackBins,
        loaded: stackBins.length > 0 && stackBins.every((bin) => bin.loaded),
      },
    });
    rows.set(placement.row, entry);
  }
  return [...rows]
    .sort(([a], [b]) => a - b)
    .map(([row, entry]) => {
      const rowStacks = [...entry.stacks].sort((a, b) => a.y - b.y).map((s) => s.stack);
      const all = rowStacks.flatMap((stack) => stack.bins);
      return {
        row,
        label: `Rangée ${String(row)}`,
        x: entry.x,
        depth: entry.end - entry.x,
        stacks: rowStacks,
        binCount: all.length,
        loadedCount: all.filter((bin) => bin.loaded).length,
      };
    });
}

/** La rangée à charger maintenant : la première, depuis le fond, qui a un bac à charger. */
export function currentRow(rows: readonly FloorRow[]): number | null {
  return rows.find((row) => row.loadedCount < row.binCount)?.row ?? null;
}

/** Où va le bac désigné par un scan — ou `null` s'il n'est pas posé au sol. */
export function locateBin(
  rows: readonly FloorRow[],
  payload: LoadDeliveryBinPayload,
): BinLocation | null {
  for (const row of rows) {
    for (const stack of row.stacks) {
      const bin = stack.bins.find((candidate) =>
        'binId' in payload ? candidate.binId === payload.binId : candidate.code === payload.code,
      );
      if (bin !== undefined) {
        return { row: row.row, stackIndex: stack.stackIndex, code: bin.code };
      }
    }
  }
  return null;
}

/**
 * « Ce bac va rangée 3, pile 2 » quand il n'est pas de la rangée ouverte —
 * une aide, pas un refus : le bac est chargé quand même. `null` s'il en est,
 * ou s'il n'a pas de place au sol.
 */
export function outOfRowNotice(location: BinLocation | null, openRow: number): string | null {
  if (location === null || location.row === openRow) {
    return null;
  }
  return `Le bac ${location.code} va rangée ${String(location.row)}, pile ${String(location.stackIndex)} — pas dans cette rangée.`;
}

/**
 * Une tuile de pile : un bac physique tel qu'on le voit. Les deux moitiés
 * d'un bac PARTAGÉ font une seule tuile — elles se scannent chacune, mais on
 * les pose ensemble, au même étage.
 */
export interface StackTile {
  readonly key: string;
  /** Une moitié, ou les deux d'un bac partagé, dans l'ordre du plan. */
  readonly bins: readonly RowBin[];
  readonly stopPositions: readonly number[];
  readonly half: boolean;
  readonly shared: boolean;
  readonly isotherm: boolean;
  /** Posé derrière d'autres bacs (seconde passe du plan, compactée). */
  readonly behind: boolean;
  readonly loaded: boolean;
}

/** Les deux moitiés d'un même bac partagé : chacune nomme la commande de l'autre. */
function partners(a: DeliveryLoadingPlanBinView, b: DeliveryLoadingPlanBinView): boolean {
  return (
    a.half !== null &&
    b.half !== null &&
    a.sharedWithReference === b.reference &&
    b.sharedWithReference === a.reference
  );
}

function tileOf(bins: readonly RowBin[], plans: readonly DeliveryLoadingPlanBinView[]): StackTile {
  return {
    key: bins.map((bin) => bin.key).join('+'),
    bins,
    stopPositions: [...new Set(bins.map((bin) => bin.stopPosition))],
    half: plans.some((plan) => plan.half !== null),
    shared: bins.length > 1,
    isotherm: plans.some((plan) => plan.isotherm),
    behind: plans.some((plan) => plan.behind),
    loaded: bins.every((bin) => bin.loaded),
  };
}

/** Les tuiles de chaque pile, du bas vers le haut ({@link binsByStack}, moitiés partagées réunies). */
export function stackTiles(
  order: readonly DeliveryLoadingPlanStepView[],
  loaded: ReadonlySet<string>,
): ReadonlyMap<number, readonly StackTile[]> {
  const plans = new Map(order.flatMap((step) => step.bins).map((bin) => [planBinKey(bin), bin]));
  const tiles = new Map<number, readonly StackTile[]>();
  for (const [stackIndex, bins] of binsByStack(order, loaded)) {
    const stack: StackTile[] = [];
    for (let i = 0; i < bins.length; i += 1) {
      const here = bins[i];
      const above = bins[i + 1];
      const plan = here === undefined ? undefined : plans.get(here.key);
      const next = above === undefined ? undefined : plans.get(above.key);
      if (here === undefined || plan === undefined) {
        continue;
      }
      if (above !== undefined && next !== undefined && partners(plan, next)) {
        stack.push(tileOf([here, above], [plan, next]));
        i += 1;
      } else {
        stack.push(tileOf([here], [plan]));
      }
    }
    tiles.set(stackIndex, stack);
  }
  return tiles;
}

/** Le bac à poser maintenant : celui qu'on a désigné, ou le premier à charger dans l'ordre. */
export interface NextBin {
  readonly key: string;
  readonly bin: DeliveryLoadingPlanBinView;
  /** L'arrêt de SA commande — pour une moitié partagée, pas forcément celui de l'étape. */
  readonly stopPosition: number;
  readonly customerLabel: string;
}

/**
 * Le prochain bac : le bac désigné (`picked`, une clé {@link planBinKey}) s'il
 * n'est pas chargé, sinon le premier non chargé dans l'ordre du plan. `null`
 * quand tout est chargé.
 */
export function nextBin(
  plan: Pick<DeliveryLoadingPlanView, 'order'>,
  loaded: ReadonlySet<string>,
  picked: string | null,
): NextBin | null {
  const byReference = new Map(plan.order.map((step) => [step.reference, step]));
  const pending = plan.order.flatMap((step) =>
    step.bins
      .filter((bin) => !loaded.has(planBinKey(bin)))
      .map((bin) => {
        const owner = byReference.get(bin.reference) ?? step;
        return {
          key: planBinKey(bin),
          bin,
          stopPosition: owner.stopPosition,
          customerLabel: owner.customerLabel,
        };
      }),
  );
  return pending.find((entry) => entry.key === picked) ?? pending[0] ?? null;
}
