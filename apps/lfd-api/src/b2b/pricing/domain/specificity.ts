import { AmbiguousPriceRulesError } from "./pricing-errors.js";
import { volumeQuantityOf } from "./price-rule.js";
import type {
  PriceAudience,
  PriceRule,
  PriceScope,
  PriceStage,
  PricingContext,
  RejectionCause,
} from "./price-rule.js";

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
function matchesAudience(audience: PriceAudience, context: PricingAudienceOf): boolean {
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
 * Le matériau est-il en vigueur à l'instant demandé ?
 *
 * Typé sur les deux champs qu'il lit, et non sur `PriceRule` : un barème porte
 * la même fenêtre sans être une règle, et {@link inForceFor} les traite
 * ensemble.
 *
 * Borne basse **incluse**, borne haute **exclue** : deux règles qui se succèdent
 * au même instant ne se chevauchent alors jamais, et personne n'a à se demander
 * laquelle s'applique à minuit pile.
 */
export function isInForce(
  rule: { readonly validFrom: Date; readonly validTo: Date | null },
  at: Date,
): boolean {
  if (rule.validFrom.getTime() > at.getTime()) {
    return false;
  }
  return rule.validTo === null || rule.validTo.getTime() > at.getTime();
}

/**
 * Le matériau a-t-il été **interrompu** avant cet instant ?
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
function isSuspended(rule: { readonly suspendedFrom: Date | null }, at: Date): boolean {
  return rule.suspendedFrom !== null && rule.suspendedFrom.getTime() <= at.getTime();
}

/**
 * **Ce qu'il faut savoir pour juger fenêtre et audience** — l'instant et le
 * client, rien de plus.
 *
 * Resserré sur les trois champs réellement lus, comme `inForceFor` l'a été sur
 * ses items et pour la même raison : `PricingScopes` porte exactement ces
 * trois-là sans être un contexte d'article, et le cache des matériaux doit
 * pouvoir filtrer sans en inventer un.
 */
export interface PricingAudienceOf {
  readonly at: Date;
  readonly companyId: string | null;
  readonly segmentId: string | null;
}

/**
 * Les étages dont le seuil parle du **contrat**, et non du panier.
 *
 * `mercuriale` et `volume` négocient une saison : « 10 000 baguettes sur
 * l'année ». Leur seuil se lit donc sur la mesure de l'engagement quand il y en
 * a un. `promotion` et `geste` parlent de CETTE commande — « à partir de 50
 * pièces » sur une promotion est une incitation au panier, et la lire sur la
 * saison l'accorderait dès la première livraison d'un client annuel.
 */
const CONTRACT_STAGES: readonly PriceStage[] = ["mercuriale", "volume"];

/**
 * **Ce qui ne dépend pas de l'article** : la fenêtre, la suspension, l'audience.
 *
 * Les trois se jugent sur l'instant et sur le client, tous deux gelés pour la
 * durée d'un appel. Les passer une fois sur l'ensemble des matériaux, plutôt
 * qu'une fois par ligne de panier, est ce qui rend un chargement en lot aussi
 * étroit que les lectures par article qu'il remplace.
 *
 * 🔴 **Ce n'est pas un raccourci : `applies` refait le travail.** Filtrer ici ne
 * dispense de rien en aval, et c'est délibéré — la fonction pure doit rester
 * juste quand on l'appelle avec un tableau fabriqué à la main, ce qui est le cas
 * dans chacun de ses tests. Le gain est de ne pas transporter jusqu'à
 * `resolvePrice` des matériaux dont on sait déjà qu'ils ne diront rien.
 *
 * Générique sur la forme plutôt que sur `PriceRule` : un **barème** porte les
 * mêmes quatre champs sans être une règle, et un plancher n'en porte aucun —
 * il n'a ni fenêtre ni audience, par décision (cf. `ScopedPriceFloor`).
 */
export function inForceFor<
  T extends {
    readonly audience: PriceAudience;
    readonly validFrom: Date;
    readonly validTo: Date | null;
    readonly suspendedFrom: Date | null;
  },
>(items: readonly T[], context: PricingAudienceOf): T[] {
  return items.filter(
    (item) =>
      isInForce(item, context.at) &&
      !isSuspended(item, context.at) &&
      matchesAudience(item.audience, context),
  );
}

/**
 * Toutes les conditions d'application, réunies.
 *
 * Le seuil de quantité se juge sur **deux mesures différentes**, et c'est
 * délibéré — cf. {@link CONTRACT_STAGES}.
 *
 * Conséquence à connaître : **sans engagement, les paliers d'une mercuriale se
 * lisent sur la commande.** Une grille « 10 000+ à 1,50 € » posée sans
 * engagement n'ouvre son palier qu'à un client qui commande 10 000 pièces d'un
 * coup, et jamais à celui qui les étale sur la saison. C'est l'engagement qui
 * transforme un seuil de panier en seuil de saison, et c'est pour cela qu'un
 * devis négocié sur un volume annuel en demande un.
 */
export function applies(rule: PriceRule, context: PricingContext): boolean {
  const measured = CONTRACT_STAGES.includes(rule.stage)
    ? volumeQuantityOf(context)
    : context.quantity;
  return (
    isInForce(rule, context.at) &&
    !isSuspended(rule, context.at) &&
    matchesScope(rule.scope, context) &&
    matchesAudience(rule.audience, context) &&
    (rule.minQuantity === null || measured >= rule.minQuantity)
  );
}

/**
 * **Pourquoi cette règle ne s'applique pas ici**, ou `null` si elle s'applique.
 *
 * Les prédicats sont rejoués **dans l'ordre de {@link applies}**, et c'est tout
 * l'intérêt : une règle peut échouer sur plusieurs, et la première rencontrée
 * est celle qu'on nomme. Un `!applies(...)` suivi d'une cause unique dirait
 * « seuil non atteint » d'une promotion expirée — la trace mentirait sur le seul
 * écran qu'on ouvre en litige.
 *
 * 🔴 **Cette fonction n'est PAS la vérité de l'application** : c'est `applies`
 * qui décide, ici on explique. Les deux doivent rester d'accord, et le test le
 * tient sur les cinq prédicats plutôt que sur un cas.
 */
export function rejectionCauseOf(
  rule: PriceRule,
  context: PricingContext,
): Exclude<RejectionCause, "superseded" | "sealed"> | null {
  if (!isInForce(rule, context.at)) {
    return "expired";
  }
  if (isSuspended(rule, context.at)) {
    return "suspended";
  }
  if (!matchesScope(rule.scope, context)) {
    return "out_of_scope";
  }
  if (!matchesAudience(rule.audience, context)) {
    return "out_of_audience";
  }
  const measured = CONTRACT_STAGES.includes(rule.stage)
    ? volumeQuantityOf(context)
    : context.quantity;
  if (rule.minQuantity !== null && measured < rule.minQuantity) {
    return "below_threshold";
  }
  return null;
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
