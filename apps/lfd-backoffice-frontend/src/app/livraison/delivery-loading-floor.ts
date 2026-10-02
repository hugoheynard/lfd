import type { DeliveryLoadingPlanStackView, DeliveryLoadingPlanStepView } from '@lfd/contracts';

import { planBinKey } from './delivery-loading-plan';

/**
 * Nombre de teintes de la palette des arrêts (`loading-floor.scss`,
 * `.hue-0` … `.hue-5`). Deux arrêts consécutifs n'ont jamais la même ; la
 * couleur double le numéro, elle ne le remplace pas.
 */
export const STOP_HUE_COUNT = 6;

/** La teinte d'un arrêt : sa position dans la tournée, en boucle sur la palette. */
export function stopHue(stopPosition: number): number {
  return (((stopPosition - 1) % STOP_HUE_COUNT) + STOP_HUE_COUNT) % STOP_HUE_COUNT;
}

/** Une tranche de pile : la part d'un arrêt, dans sa couleur. */
export interface FloorStackBand {
  readonly stopPosition: number;
  readonly hue: number;
  /** Abscisse et profondeur de la tranche, en cm du dessin, relatives à la pile. */
  readonly offset: number;
  readonly depth: number;
}

/** Une pile dessinée sur le plancher vu de dessus : son rectangle et son étiquette. */
export interface FloorStackShape {
  readonly stackIndex: number;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly across: number;
  /** Les arrêts de la pile, du bas vers le haut : « 6 », « 6·5 ». */
  readonly label: string;
  readonly title: string;
  /** Taille du numéro, en cm du dessin : lisible sans déborder de la pile. */
  readonly fontSize: number;
  /** Une tranche par arrêt, du fond vers les portes dans l'ordre bas → haut de la pile. */
  readonly bands: readonly FloorStackBand[];
  /** Tous les bacs de la pile sont scannés. */
  readonly loaded: boolean;
}

/** Les tranches d'une pile : sa profondeur partagée à parts égales entre ses arrêts. */
function stackBands(stopPositions: readonly number[], depth: number): readonly FloorStackBand[] {
  const slice = depth / Math.max(stopPositions.length, 1);
  return stopPositions.map((stopPosition, index) => ({
    stopPosition,
    hue: stopHue(stopPosition),
    offset: index * slice,
    depth: slice,
  }));
}

/** Le numéro occupe deux cinquièmes du plus petit côté de la pile. */
const LABEL_RATIO = 0.4;

/**
 * Les piles posées au sol (G5), prêtes à dessiner : `x` depuis le fond (la
 * cloison, à gauche du dessin), `y` depuis le flanc gauche. Les piles hors
 * plancher ou en caisse réfrigérée n'ont pas de place : elles se disent en
 * phrase ({@link unplacedStacksLabel}).
 */
export function floorStackShapes(
  stacks: readonly DeliveryLoadingPlanStackView[],
  loadedStacks: ReadonlySet<number> = new Set(),
): readonly FloorStackShape[] {
  return stacks.flatMap((stack) => {
    const placement = stack.placement;
    if (placement?.kind !== 'floor') {
      return [];
    }
    const loaded = loadedStacks.has(stack.stackIndex);
    const stops = stack.stopPositions.map(String).join('·');
    return [
      {
        stackIndex: stack.stackIndex,
        bands: stackBands(stack.stopPositions, placement.depthCm),
        loaded,
        x: placement.xCm,
        y: placement.yCm,
        depth: placement.depthCm,
        across: placement.widthCm,
        label: loaded ? `✓ ${stops}` : stops,
        fontSize: Math.round(Math.min(placement.depthCm, placement.widthCm) * LABEL_RATIO),
        title: `Pile ${String(stack.stackIndex)} · ${stack.binTypeName} — arrêts ${stack.stopPositions.map(String).join(', ')}${loaded ? ' — chargée' : ''}`,
      },
    ];
  });
}

/** « Pile 4 (arrêt 1) » … pour les piles d'un genre de place, ou `null` s'il n'y en a pas. */
export function unplacedStacksLabel(
  stacks: readonly DeliveryLoadingPlanStackView[],
  kind: 'off_floor' | 'refrigerated',
): string | null {
  const named = stacks
    .filter((stack) => stack.placement?.kind === kind)
    .map(
      (stack) =>
        `pile ${String(stack.stackIndex)} (arrêt${stack.stopPositions.length > 1 ? 's' : ''} ${stack.stopPositions.map(String).join(', ')})`,
    );
  if (named.length === 0) {
    return null;
  }
  const prefix = kind === 'off_floor' ? 'Hors plancher' : 'En caisse réfrigérée';
  return `${prefix} : ${named.join(' ; ')}`;
}

/**
 * Les piles dont tous les bacs sont scannés, croisées depuis l'ordre du plan
 * (chaque bac y porte sa pile) et les bacs chargés de la vue du chargement.
 * Une pile sans aucun bac connu n'est pas comptée chargée.
 */
export function loadedStackIndexes(
  order: readonly DeliveryLoadingPlanStepView[],
  loaded: ReadonlySet<string>,
): ReadonlySet<number> {
  const complete = new Map<number, boolean>();
  for (const bin of order.flatMap((step) => step.bins)) {
    complete.set(
      bin.stackIndex,
      (complete.get(bin.stackIndex) ?? true) && loaded.has(planBinKey(bin)),
    );
  }
  return new Set([...complete].filter(([, done]) => done).map(([index]) => index));
}

/** Une ligne de légende : un arrêt présent au sol, sa couleur, son client. */
export interface FloorLegendStop {
  readonly stopPosition: number;
  readonly hue: number;
  readonly label: string;
}

/** La légende arrêt → couleur → client, des seuls arrêts dessinés, dans l'ordre de la tournée. */
export function floorLegend(
  stacks: readonly DeliveryLoadingPlanStackView[],
  order: readonly Pick<
    DeliveryLoadingPlanStepView,
    'stopPosition' | 'reference' | 'customerLabel'
  >[],
): readonly FloorLegendStop[] {
  const drawn = new Set(
    stacks.filter((s) => s.placement?.kind === 'floor').flatMap((s) => s.stopPositions),
  );
  return [...order]
    .filter((step) => drawn.has(step.stopPosition))
    .sort((a, b) => a.stopPosition - b.stopPosition)
    .map((step) => ({
      stopPosition: step.stopPosition,
      hue: stopHue(step.stopPosition),
      label: `${step.customerLabel} · ${step.reference}`,
    }));
}
