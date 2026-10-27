/*
 * L'union des allergènes que portent les ingrédients cités par une fiche —
 * servie au catalogue par `PrismaCitedAllergensReader`, qui la juge.
 */

/**
 * L'union des codes, dédupliquée. L'ordre vient des ingrédients, qui les
 * rangent déjà — un ensemble n'a pas d'ordre à défendre.
 */
export function citedUnion(lists: readonly (readonly string[])[]): readonly string[] {
  const codes = new Set<string>();
  for (const list of lists) {
    for (const code of list) {
      codes.add(code);
    }
  }
  return [...codes].sort((left, right) => {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  });
}
