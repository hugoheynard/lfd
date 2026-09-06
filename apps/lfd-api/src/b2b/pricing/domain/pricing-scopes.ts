import type { PricingContext } from "./price-rule.js";

/**
 * **Ce qu'un PANIER vise** — l'union des portées de ses articles, plus son
 * audience.
 *
 * ## Pourquoi cette valeur existe
 *
 * Les matériaux de prix se lisaient **une fois par article** : trois requêtes
 * par ligne, chacune avec le même `WHERE` à un identifiant près. Un panier de
 * vingt lignes en faisait soixante, sur le chemin qui facture.
 *
 * Ce que le `WHERE` sélectionne ne dépend en réalité que de deux choses : la
 * **fenêtre** (l'instant, gelé pour tout l'appel) et l'**audience** (le client,
 * gelé aussi). Seule la portée varie d'un article à l'autre — et c'est une
 * égalité sur un identifiant, donc un `IN`.
 *
 * ## Un `WHERE`, deux entrées
 *
 * 🔴 La lecture de lot est désormais **l'unique** lecture. `candidatesFor` — la
 * question d'un seul article, que le tableau de bord et le simulateur posent
 * encore — se réécrit **par-dessus**, en réduisant le panier à un article.
 *
 * Sans ça, deux clauses décriraient la même sélection et divergeraient le jour
 * où l'une des deux apprend une condition. C'est le mode de panne
 * qu'`archived-at.ts` documente en toutes lettres : « deux vérités […] ne se
 * remarquent que le jour où elles divergent, et ce jour-là c'est un prix qu'on
 * n'explique plus ».
 */
export interface PricingScopes {
  /** L'instant de résolution — le même pour tout le panier, par décision. */
  readonly at: Date;
  readonly companyId: string | null;
  readonly segmentId: string | null;
  /** Les familles visées par au moins un article du panier. */
  readonly categoryIds: readonly string[];
  readonly productSkus: readonly string[];
  readonly variantSkus: readonly string[];
}

/**
 * Le panier réduit à **un seul article** — l'ancienne question, posée à la
 * nouvelle lecture.
 *
 * C'est la pièce qui garantit qu'il n'y a qu'un `WHERE` : `candidatesFor` ne
 * fabrique plus sa propre clause, elle passe par ici.
 */
export function scopesOf(context: PricingContext): PricingScopes {
  return {
    at: context.at,
    companyId: context.companyId,
    segmentId: context.segmentId,
    categoryIds: [context.categoryId],
    productSkus: [context.productSku],
    variantSkus: [context.variantSku],
  };
}

/**
 * Les portées de **tout un panier**, dédoublonnées.
 *
 * Les doublons ne changeraient aucun résultat — un `IN` les absorbe — mais ils
 * gonfleraient la requête à proportion du panier, ce que ce hissage existe
 * précisément pour éviter.
 */
export function scopesOfAll(contexts: readonly PricingContext[]): PricingScopes | null {
  const first = contexts[0];
  if (first === undefined) {
    return null;
  }
  return {
    at: first.at,
    companyId: first.companyId,
    segmentId: first.segmentId,
    categoryIds: [...new Set(contexts.map((c) => c.categoryId))],
    productSkus: [...new Set(contexts.map((c) => c.productSku))],
    variantSkus: [...new Set(contexts.map((c) => c.variantSku))],
  };
}
