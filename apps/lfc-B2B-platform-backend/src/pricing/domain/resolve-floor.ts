import { fractionByBasisPoints, fromCents, roundToCents } from "./exact-money.js";
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
/**
 * Le plancher gagnant **avec sa portée**.
 *
 * Rend la portée et non seulement la valeur : l'écran doit dire d'où vient la
 * limite qui s'applique — la sienne, ou celle de sa famille — et retrouver la
 * portée par comparaison de valeurs aurait confondu deux planchers réglés au
 * même montant.
 *
 * Il ne dit PAS quel étage s'ouvre : c'est une autre question, qui dépend de la
 * commande et de l'historique, et elle a sa propre fonction (`decideFloor`).
 */
export function resolveScopedFloor(
  floors: readonly ScopedPriceFloor[],
  context: PricingContext,
): ScopedPriceFloor | null {
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
  return best;
}

/**
 * Un plancher, **en centimes**, sur un article donné.
 *
 * Passe par la même arithmétique exacte que `resolvePrice` — et pas par un
 * `Math.round(canonical * bp / 10000)` qui aurait l'air identique. Les deux
 * divergeraient d'un centime sur certaines valeurs, et l'écran promettrait alors
 * une marge de négociation que la caisse refuserait : le pire endroit possible
 * pour un écart d'arrondi, parce qu'il se découvre devant le client.
 *
 * La fraction se calcule sur le **canonique**, jamais sur le prix altéré : un
 * plancher qui suivrait le prix vers le bas ne plancherait rien.
 */
export function floorCentsFor(floor: PriceFloor, canonicalCents: number): number {
  return floor.mode === "amount"
    ? floor.cents
    : roundToCents(fractionByBasisPoints(fromCents(canonicalCents), floor.bp));
}
