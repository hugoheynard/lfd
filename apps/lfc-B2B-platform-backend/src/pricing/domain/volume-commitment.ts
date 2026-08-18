import type { PriceScope } from "./price-rule.js";

/**
 * **L'engagement de volume** — un client vise un volume sur une période, et le
 * barème se juge alors sur le **cumul** de cette période plutôt que sur la
 * quantité de chaque commande.
 *
 * Décidé le 2026-08-18, contre le prix fixe daté. Les deux formes donnent le
 * MÊME prix au volume promis ; elles ne divergent que lorsque la promesse n'est
 * pas tenue — et c'est là que le choix se fait :
 *
 * - un **prix fixe** n'a aucune réponse arithmétique à la sous-performance. Il
 *   faut une clause, puis un rattrapage facturé rétroactivement : réécrire
 *   l'explication de factures déjà payées, ce que la trace figée sur la ligne
 *   existe précisément pour empêcher ;
 * - le **cumul** laisse le client au palier qu'il a réellement atteint. Chaque
 *   facture est juste au moment où elle est émise, aucune n'est jamais révisée,
 *   et les conditions de sortie deviennent de l'arithmétique au lieu d'un texte.
 *
 * Ce que ce n'est **pas** : une réservation. Rien n'est bloqué, rien n'est dû.
 * `promisedQuantity` sert au suivi et ne participe à aucun calcul — un prix qui
 * dépendrait de la promesse serait une remise accordée sur une intention.
 */
export interface VolumeCommitment {
  readonly id: string;
  /** Un engagement vise TOUJOURS un client nommé : c'est une négociation. */
  readonly companyId: string;
  readonly scope: PriceScope;
  /** Le volume visé. Pour l'écran, jamais pour le prix. */
  readonly promisedQuantity: number;
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue**, et jamais ouverte. */
  readonly validTo: Date;
}

/**
 * L'engagement **court-il** à cet instant ?
 *
 * Mêmes bornes que partout : basse incluse, haute exclue. Deux engagements qui
 * se succèdent au même instant ne se chevauchent donc jamais, et personne n'a à
 * se demander lequel s'applique à minuit pile.
 */
export function isRunningAt(commitment: VolumeCommitment, at: Date): boolean {
  return (
    commitment.validFrom.getTime() <= at.getTime() && commitment.validTo.getTime() > at.getTime()
  );
}

/**
 * L'engagement qui **couvre cet article** pour ce client, ou `null`.
 *
 * La portée se résout comme celle d'un plancher — la plus spécifique gagne —
 * mais sans arbitrage à écrire ici : la contrainte d'exclusion garantit qu'il
 * n'y a jamais deux engagements vivants sur la **même** cible, et deux cibles
 * différentes (le catalogue, un produit) se départagent par leur rang de portée.
 */
export function commitmentFor(
  commitments: readonly VolumeCommitment[],
  target: { readonly categoryId: string; readonly productSku: string; readonly variantSku: string },
  at: Date,
): VolumeCommitment | null {
  const covering = commitments
    .filter((commitment) => isRunningAt(commitment, at))
    .filter((commitment) => coversTarget(commitment.scope, target));
  return [...covering].sort((left, right) => rankOf(right.scope) - rankOf(left.scope))[0] ?? null;
}

function coversTarget(
  scope: PriceScope,
  target: { categoryId: string; productSku: string; variantSku: string },
): boolean {
  switch (scope.type) {
    case "global":
      return true;
    case "category":
      return scope.id === target.categoryId;
    case "product":
      return scope.id === target.productSku;
    case "variant":
      return scope.id === target.variantSku;
  }
}

const RANK: Readonly<Record<PriceScope["type"], number>> = {
  global: 0,
  category: 1,
  product: 2,
  variant: 3,
};

function rankOf(scope: PriceScope): number {
  return RANK[scope.type];
}
