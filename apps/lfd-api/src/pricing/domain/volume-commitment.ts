import type { PriceScope } from "./price-rule.js";

/**
 * **L'engagement de volume** — un client vise un volume sur une période, et le
 * barème se juge alors sur le **cumul** de cette période plutôt que sur la
 * quantité de chaque commande.
 *
 * **Le volume annoncé conditionne le prix** (décidé le 2026-08-18, corrigé le
 * 2026-08-19). La story est celle du commercial : Club Med dit « ma saison,
 * c'est 10 000 baguettes », et c'est CE nombre qui fait le prix — dès la
 * première commande, pas au bout de la neuf-millième pièce.
 *
 * La première écriture jugeait le palier sur le seul cumul mesuré. Elle
 * répondait à une autre question : celle d'un client qui n'a rien promis et que
 * l'on récompense à mesure. Un client qui annonce et paie le tarif d'entrée
 * pendant trois mois n'a, lui, rien obtenu de ce qu'il a négocié.
 *
 * D'où {@link retainedQuantity} : `max(promis, livré)`. Le promis ouvre le
 * palier immédiatement ; le livré prend le relais s'il dépasse la promesse — un
 * client qui commande plus que prévu ne doit pas rester bloqué au palier de son
 * annonce.
 *
 * **Ce que cela ouvre, et qui n'est pas tranché.** Le prix est accordé sur une
 * intention. Si la promesse n'est pas tenue, chaque facture émise reste juste et
 * aucune n'est révisée — mais la remise a été consentie sur un volume qui n'est
 * jamais venu. C'est exactement la charge de sortie anticipée que le simulateur
 * chiffre, et elle est désormais **entièrement portée par nous**. La compenser
 * demande une décision commerciale (clause de sortie, régularisation au terme)
 * qui n'est pas prise ici — et qui ne doit surtout pas être bricolée en douce
 * dans le moteur.
 */
export interface VolumeCommitment {
  readonly id: string;
  /** Un engagement vise TOUJOURS un client nommé : c'est une négociation. */
  readonly companyId: string;
  readonly scope: PriceScope;
  /** Le volume annoncé. **Il fait le prix** — cf. {@link retainedQuantity}. */
  readonly promisedQuantity: number;
  /** Borne basse **incluse**. */
  readonly validFrom: Date;
  /** Borne haute **exclue**, et jamais ouverte. */
  readonly validTo: Date;
}

/**
 * **La mesure sur laquelle le palier se juge** : `max(promis, livré)`.
 *
 * Le promis ouvre le palier **dès la première commande** — c'est la promesse
 * qu'on a vendue, et la faire attendre le volume réel reviendrait à ne pas
 * l'avoir accordée. Le livré reprend la main dès qu'il dépasse : un client qui
 * commande plus que prévu ne reste pas bloqué au palier de son annonce.
 *
 * Un `max` et non le promis seul, donc : sans lui, dépasser la promesse
 * coûterait un palier au client, ce qui est exactement l'inverse de ce qu'un
 * barème de volume est censé encourager.
 */
export function retainedQuantity(commitment: VolumeCommitment, cumulativeQuantity: number): number {
  return Math.max(commitment.promisedQuantity, cumulativeQuantity);
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
