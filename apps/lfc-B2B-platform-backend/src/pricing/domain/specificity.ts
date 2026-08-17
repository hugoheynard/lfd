import { AmbiguousPriceRulesError } from "./pricing-errors.js";
import type { PriceAudience, PriceRule, PriceScope, PricingContext } from "./price-rule.js";

/**
 * **Qui gagne dans un étage**, et pourquoi.
 *
 * Le doc pose la règle « la plus spécifique sur les deux axes gagne » — mais
 * deux axes ne s'ordonnent pas tout seuls : une règle *produit / tous clients*
 * et une règle *globale / ce client* ne se dominent ni l'une ni l'autre. Il
 * fallait donc un ordre entre les axes, sans quoi le résultat aurait dépendu du
 * tri SQL, donc du hasard.
 *
 * **Décision : l'audience prime sur la portée produit.** Une règle qui vise CE
 * client est plus spécifique qu'une règle qui vise ce produit pour tout le
 * monde. L'inverse laisserait une promotion générale écraser un engagement
 * négocié individuellement — exactement ce qu'un client appelle pour contester.
 *
 * Troisième critère, le palier : à audience et portée égales, le seuil de
 * quantité le **plus haut** parmi ceux atteints gagne. C'est ce qui fait
 * fonctionner l'étage volume sans traitement particulier — « 100+ » bat « 50+ »
 * parce qu'il est plus spécifique, pas parce que c'est le volume.
 */

const AUDIENCE_RANK: Readonly<Record<PriceAudience["type"], number>> = {
  all: 0,
  segment: 1,
  company: 2,
};

/**
 * Exporté parce que le **plancher** s'y adosse : il n'a ni étage ni audience,
 * mais il a une portée, et elle se résout selon le même ordre. Deux échelles de
 * spécificité pour la même notion finiraient par diverger d'un cran.
 */
export const SCOPE_RANK: Readonly<Record<PriceScope["type"], number>> = {
  global: 0,
  category: 1,
  product: 2,
  variant: 3,
};

/** Les trois critères, du plus fort au plus faible. */
type Specificity = readonly [audience: number, scope: number, minQuantity: number];

function specificityOf(rule: PriceRule): Specificity {
  return [AUDIENCE_RANK[rule.audience.type], SCOPE_RANK[rule.scope.type], rule.minQuantity ?? 0];
}

/** Ordre lexicographique sur les trois critères. `0` = strictement aussi spécifiques. */
function compare(left: Specificity, right: Specificity): number {
  for (let index = 0; index < left.length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

/**
 * **Laquelle de ces deux règles gagne son étage** — positif si la gauche gagne,
 * `0` si aucune ne domine.
 *
 * Exporté pour la **frise** des recouvrements : elle doit dire qui évince qui,
 * et elle doit le dire avec l'ordre qui facture. Réimplémenter la comparaison
 * là-bas aurait donné un écran qui désigne un gagnant, et une caisse qui en
 * applique un autre — le genre de divergence qu'on ne découvre qu'au litige.
 */
export function compareSpecificity(left: PriceRule, right: PriceRule): number {
  return compare(specificityOf(left), specificityOf(right));
}

/** La portée vise-t-elle cet article ? Un `id` qui ne correspond pas l'exclut. */
export function matchesScope(scope: PriceScope, context: PricingContext): boolean {
  switch (scope.type) {
    case "global":
      return true;
    case "category":
      return scope.id === context.categoryId;
    case "product":
      return scope.id === context.productSku;
    case "variant":
      return scope.id === context.variantSku;
  }
}

/**
 * La règle vise-t-elle ce client ?
 *
 * Une commande **sans entreprise** (parcours zéro friction) ne peut satisfaire
 * ni `company` ni `segment` : elle ne prend que les règles ouvertes à tous. Ce
 * n'est pas un cas limite, c'est le parcours par défaut de la boutique.
 */
function matchesAudience(audience: PriceAudience, context: PricingContext): boolean {
  switch (audience.type) {
    case "all":
      return true;
    case "segment":
      return audience.id !== null && audience.id === context.segmentId;
    case "company":
      return audience.id !== null && audience.id === context.companyId;
  }
}

/**
 * La règle est-elle en vigueur à l'instant demandé ?
 *
 * Borne basse **incluse**, borne haute **exclue** : deux règles qui se succèdent
 * au même instant ne se chevauchent alors jamais, et personne n'a à se demander
 * laquelle s'applique à minuit pile.
 */
function isInForce(rule: PriceRule, at: Date): boolean {
  if (rule.validFrom.getTime() > at.getTime()) {
    return false;
  }
  return rule.validTo === null || rule.validTo.getTime() > at.getTime();
}

/**
 * La règle a-t-elle été **interrompue** avant cet instant ?
 *
 * Comparé à l'instant de résolution et non à « maintenant », et c'est ce qui rend
 * la suspension honnête : une promotion suspendue le 12 s'appliquait encore le
 * 10. Un simple booléen `paused` aurait effacé la distinction et fait mentir
 * toute relecture d'une date passée.
 *
 * Ce que ce champ ne sait pas dire, c'est qu'une règle **reprise** a été
 * suspendue un moment : la reprise l'efface. Cet intervalle vit dans le journal,
 * qui est l'endroit fait pour ça — et les commandes déjà passées portent leur
 * trace figée, donc rien de facturé ne dépend de cette relecture.
 */
function isSuspended(rule: PriceRule, at: Date): boolean {
  return rule.suspendedFrom !== null && rule.suspendedFrom.getTime() <= at.getTime();
}

/** Toutes les conditions d'application, réunies. */
export function applies(rule: PriceRule, context: PricingContext): boolean {
  return (
    isInForce(rule, context.at) &&
    !isSuspended(rule, context.at) &&
    matchesScope(rule.scope, context) &&
    matchesAudience(rule.audience, context) &&
    (rule.minQuantity === null || context.quantity >= rule.minQuantity)
  );
}

/**
 * La règle gagnante d'un étage, ou `null` si aucune ne s'applique — l'étage est
 * alors **transparent**, il laisse passer le prix entrant.
 *
 * @throws {AmbiguousPriceRulesError} deux règles applicables strictement aussi
 *   spécifiques. La base l'interdit par une contrainte d'exclusion ; on le
 *   revérifie ici parce qu'une fonction pure doit être déterministe même quand
 *   on l'appelle avec des données fabriquées à la main — un test, un import, une
 *   migration.
 */
export function winnerOf(rules: readonly PriceRule[], context: PricingContext): PriceRule | null {
  // Déstructuré plutôt qu'indexé : `first` est alors typé non-`undefined` sans
  // assertion. Une garde `length === 0` ne l'apprend pas au compilateur, et il
  // aurait fallu lui mentir avec un `as`.
  const [first, ...rest] = rules.filter((rule) => applies(rule, context));
  if (first === undefined) {
    return null;
  }

  let best = first;
  let bestScore = specificityOf(best);
  let tie: PriceRule | null = null;

  for (const candidate of rest) {
    const score = specificityOf(candidate);
    const delta = compare(score, bestScore);
    if (delta > 0) {
      best = candidate;
      bestScore = score;
      tie = null;
    } else if (delta === 0) {
      tie = candidate;
    }
  }

  if (tie !== null) {
    throw new AmbiguousPriceRulesError(best.stage, best.id, tie.id);
  }
  return best;
}
