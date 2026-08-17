import { AmbiguousPriceFloorsError } from "./pricing-errors.js";
import { matchesScope, SCOPE_RANK } from "./specificity.js";
import type { PriceFloor, PricingContext, ScopedPriceFloor } from "./price-rule.js";

/**
 * **Quel plancher s'applique** à cet article : le plus spécifique de ceux qui le
 * visent, ou `null` si aucun ne le vise.
 *
 * L'héritage est implicite et va dans le seul sens utile : un plancher posé sur
 * une famille couvre tous ses articles, et un plancher posé sur un article
 * **remplace** celui de sa famille au lieu de s'y ajouter. Deux planchers qui se
 * cumuleraient n'auraient aucune lecture — le plus haut gagnerait toujours, donc
 * le plus bas ne servirait à rien tout en restant affiché comme s'il servait.
 *
 * Remplacer plutôt que cumuler a un coût qu'il faut assumer : poser 1,00 € sur un
 * article dont la famille est à 1,50 € **descend** sa limite. C'est voulu — c'est
 * exactement le geste « cet article-là est une exception » — et c'est pour ça que
 * l'écran montre le plancher hérité à côté de celui qu'on pose.
 *
 * @throws {AmbiguousPriceFloorsError} deux planchers de même portée visent
 *   l'article. La base l'interdit par un index unique ; on le revérifie ici pour
 *   la même raison que pour les règles — une fonction pure doit être
 *   déterministe même appelée avec des données fabriquées à la main.
 */
export function resolveFloor(
  floors: readonly ScopedPriceFloor[],
  context: PricingContext,
): PriceFloor | null {
  const [first, ...rest] = floors.filter((candidate) => matchesScope(candidate.scope, context));
  if (first === undefined) {
    return null;
  }

  let best = first;
  let tie: ScopedPriceFloor | null = null;
  for (const candidate of rest) {
    const delta = SCOPE_RANK[candidate.scope.type] - SCOPE_RANK[best.scope.type];
    if (delta > 0) {
      best = candidate;
      tie = null;
    } else if (delta === 0) {
      tie = candidate;
    }
  }

  if (tie !== null) {
    throw new AmbiguousPriceFloorsError(best.id, tie.id);
  }
  return best.floor;
}
