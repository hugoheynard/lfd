import type { DeliveryLoadingPlanStackView } from '@lfd/contracts';

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
): readonly FloorStackShape[] {
  return stacks.flatMap((stack) => {
    const placement = stack.placement;
    if (placement?.kind !== 'floor') {
      return [];
    }
    return [
      {
        stackIndex: stack.stackIndex,
        x: placement.xCm,
        y: placement.yCm,
        depth: placement.depthCm,
        across: placement.widthCm,
        label: stack.stopPositions.map(String).join('·'),
        fontSize: Math.round(Math.min(placement.depthCm, placement.widthCm) * LABEL_RATIO),
        title: `Pile ${String(stack.stackIndex)} · ${stack.binTypeName} — arrêts ${stack.stopPositions.map(String).join(', ')}`,
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
