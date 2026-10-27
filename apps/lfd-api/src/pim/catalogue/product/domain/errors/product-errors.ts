import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";
import { ALLERGEN_CONTRADICTION_GAP, type ActivationGaps } from "../services/activation-gaps.js";
import {
  ALLERGENS_GAP,
  PRICE_GAP,
  PRO_PRICE_GAP,
  PRO_PRICE_RULE_GAP,
  VAT_GAP_PREFIX,
} from "../services/variant-completeness.js";

export class ProductNotFoundError extends ResourceNotFoundError {
  constructor(readonly productId: string) {
    super("catalogue.product.not_found", `Produit « ${productId} » inconnu.`);
  }
}

/** La déclinaison visée n'appartient pas au produit (ou n'existe pas). */
export class VariantNotFoundError extends ResourceNotFoundError {
  constructor(
    readonly productId: string,
    readonly variantId: string,
  ) {
    super(
      "catalogue.variant.not_found",
      `Déclinaison « ${variantId} » inconnue pour le produit « ${productId} ».`,
    );
  }
}

/**
 * Invariant 2 du socle, vu depuis la persistance : un produit a **au moins
 * une** déclinaison et **exactement une** par défaut. La ligne lue ne le
 * respecte pas — on refuse de la rendre plutôt que de laisser une donnée
 * incohérente ressortir vers les canaux.
 */
export class InvalidProductVariantsError extends DomainError {
  constructor(
    readonly productId: string,
    reason: string,
  ) {
    super("catalogue.product.invalid_variants", `Produit « ${productId} » incohérent : ${reason}.`);
  }
}

/** Une quantité de conditionnement qui n'emballe rien : zéro, négative, ou non entière. */
export class InvalidPackagingQuantityError extends DomainError {
  constructor(received: number) {
    super(
      "catalogue.packaging.invalid_quantity",
      `Quantité de conditionnement impossible (${String(received)}) : ` +
        `attendu un entier strictement positif — un conditionnement emballe au moins une unité.`,
    );
  }
}

/** Un prix ou un poids qui n'a pas de sens : négatif, fractionnaire, infini. */
export class InvalidVariantPricingError extends DomainError {
  constructor(field: string, received: number) {
    super(
      "catalogue.variant.invalid_pricing",
      `Valeur impossible pour « ${field} » (${String(received)}) : ` +
        `attendu un entier positif ou nul.`,
    );
  }
}

/**
 * Un prix pro HT saisi que la fiche ne peut pas ranger : plus de cinq
 * décimales, négatif, ou hors de la colonne (lot P du plan
 * `plan-catalogue-synchronise-par-audience.md`).
 */
export class InvalidProPriceError extends DomainError {
  constructor(received: string, expected: string) {
    super(
      "catalogue.variant.invalid_pro_price",
      `Prix pro HT impossible (« ${received} ») : attendu ${expected}. ` +
        `Corriger le montant dans la section « Tarif » de la déclinaison.`,
    );
  }
}

/**
 * Le pré-remplissage du prix pro écrirait un HT différent de celui que le fil
 * sert aujourd'hui (lot P, P5). Un seul écart refuse tout : le pré-remplissage
 * promet qu'aucun prix servi ne change à la bascule.
 */
export class ProPricePrefillMismatchError extends BusinessError {
  constructor(readonly mismatches: number) {
    super(
      "catalogue.pro_price_prefill.mismatch",
      `Pré-remplissage refusé : ${mismatches} déclinaison(s) recevraient un prix pro HT ` +
        `différent de celui servi aujourd'hui. Relire l'aperçu dans « Règles comptables » ` +
        `(la méthode est-elle encore « Ratio » ?) avant de recommencer.`,
    );
  }
}

/** Ce qu'un manque se dit à l'écran, avec le geste qui le répare. */
const GAP_LABEL: Readonly<Record<string, string>> = {
  [PRICE_GAP]: "prix public (section « Tarif »)",
  [ALLERGENS_GAP]:
    "déclaration d'allergènes (section « Allergènes » — « aucun allergène » est une réponse)",
  [PRO_PRICE_GAP]: "prix pro HT (section « Tarif »)",
  [PRO_PRICE_RULE_GAP]: "rapport pro non réglé (écran « Règles comptables »)",
  [ALLERGEN_CONTRADICTION_GAP]:
    "la composition cite un allergène que la déclaration ne porte pas (section « Allergènes »)",
};

function gapLabel(gap: string): string {
  if (gap.startsWith(VAT_GAP_PREFIX)) {
    return `taux de TVA « ${gap.slice(VAT_GAP_PREFIX.length)} » (famille ou fiche)`;
  }
  return GAP_LABEL[gap] ?? gap;
}

/**
 * `activate` refusée : aucune déclinaison n'est complète (lot 2b de
 * `plan-catalogue-synchronise-par-audience.md`, C1 et 2b3). Remplace aussi
 * l'ancien refus des allergènes par déclinaison (`not_publishable`) : une
 * déclinaison sans déclaration n'empêche plus d'activer, elle n'est pas vendue.
 *
 * Le message nomme chaque déclinaison et ce qui lui manque, avec l'écran qui
 * le répare : il est lu par du personnel devant la fiche, pas devant le code.
 * Il dit aussi qu'une seule suffit, pour qu'on ne croie pas devoir tout remplir.
 */
export class ProductNotActivatableError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly gaps: ActivationGaps,
  ) {
    super("catalogue.product.not_activatable", describeGaps(gaps));
  }
}

function describeGaps(gaps: ActivationGaps): string {
  if (gaps.allDiscontinued) {
    return (
      "Activation refusée : toutes les déclinaisons sont arrêtées — en rouvrir une et la " +
      "compléter."
    );
  }
  const lines = Object.entries(gaps.byVariant).map(
    ([sku, missing]) => `${sku} : ${missing.map(gapLabel).join(", ")}`,
  );
  return (
    `Activation refusée : aucune déclinaison n'est complète, et il en suffit d'une — ` +
    `${lines.join(" ; ")}.`
  );
}

/** Ce qu'une déclinaison contredit : son SKU, et les codes cités non déclarés. */
export interface AllergenContradiction {
  readonly sku: string;
  readonly declaresNone: boolean;
  readonly allergenCodes: readonly string[];
}

/**
 * `activate` refusée : la composition cite un allergène que la déclaration
 * d'une déclinaison ne porte pas — ou qu'elle dit « aucun allergène » (le pain
 * sans blé qui cite la farine). Décision de Hugo du 2026-10-27 : bloquant.
 *
 * Le message nomme chaque déclinaison, les codes, et les deux gestes de
 * sortie : reprendre l'allergène dans la déclaration, ou retirer l'ingrédient.
 */
export class ProductAllergenContradictionError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly contradictions: readonly AllergenContradiction[],
  ) {
    super("catalogue.product.allergen_contradiction", describeContradictions(contradictions));
  }
}

function describeContradictions(contradictions: readonly AllergenContradiction[]): string {
  const lines = contradictions.map(
    (entry) =>
      `${entry.sku} ${entry.declaresNone ? "déclare « aucun allergène » mais" : "ne déclare pas"} ` +
      `${entry.allergenCodes.join(", ")}${entry.declaresNone ? " est cité" : ""}`,
  );
  return (
    `Activation refusée : la composition cite des allergènes que la déclaration contredit — ` +
    `${lines.join(" ; ")}. Reprendre ces allergènes dans la section « Allergènes » de la ` +
    `déclinaison, ou retirer l'ingrédient de la composition.`
  );
}

/** Un produit archivé se restaure avant de se publier — jamais d'un geste. */
export class ArchivedProductNotPublishableError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.archived_not_publishable",
      "Ce produit est archivé : le restaurer avant de le publier.",
    );
  }
}

/**
 * On ne retire pas de la vente ce qui n'y est pas.
 *
 * Le refus existe parce que son absence coûtait cher : le back-office envoyait
 * sa demande de RESTAURATION sur cette route, `unpublish()` ne faisait rien sur
 * un archivé, et tout le monde lisait un succès — l'écran passait la fiche en
 * « Brouillon », le journal enregistrait un retrait de la vente, la base restait
 * archivée (audit 2026-09-01). Le message dit donc le geste attendu.
 */
export class ArchivedProductNotWithdrawableError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.archived_not_withdrawable",
      "Ce produit est archivé : c'est « Restaurer » qu'il faut, pas « Dépublier ».",
    );
  }
}

/**
 * On ne restaure que ce qui est archivé.
 *
 * Sans ce refus, restaurer un produit **en ligne** le rétrogradait en brouillon
 * sans un mot : `restore()` posait `draft` sans regarder d'où il venait.
 */
export class NotArchivedProductNotRestorableError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly status: string,
  ) {
    super(
      "catalogue.product.not_archived_not_restorable",
      "Ce produit n'est pas archivé : il n'y a rien à restaurer.",
    );
  }
}

/**
 * Une dérogation de taux visant un contexte que le registre ne connaît pas.
 *
 * Même refus que sur la famille, et pour la même raison : la clé serait
 * persistée sans ligne de registre en face, et personne ne saurait plus dire ce
 * qu'elle facturait.
 */
export class ProductUnknownContextError extends BusinessError {
  constructor(readonly contextKey: string) {
    super(
      "catalogue.product.unknown_sales_context",
      `Contexte de vente « ${contextKey} » inconnu.`,
    );
  }
}

/**
 * Une déclaration de publiabilité sans auteur identifié.
 *
 * Elle ne se refuse pas par prudence technique : une déclaration EST une
 * signature, et une signature anonyme n'engage personne. Le cas se produit hors
 * requête HTTP — un seed, un cron — c'est-à-dire exactement là où personne n'a
 * regardé la fiche.
 */
export class AnonymousReadinessError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.anonymous_readiness",
      "Déclarer une fiche publiable demande une identité : personne ne signe à la place de personne.",
    );
  }
}

/** On ne se prononce pas sur une fiche retirée du catalogue. */
export class ArchivedProductNotReadyError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.archived_not_ready",
      "Ce produit est archivé : le restaurer avant de le déclarer publiable.",
    );
  }
}

/** On ne retire pas une signature que personne n'a posée. */
export class ProductNotDeclaredReadyError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.not_declared_ready",
      "Cette fiche n'est pas déclarée publiable : il n'y a pas de signature à retirer.",
    );
  }
}

/** Une fiche archivée ne bouge plus, sa signature non plus. */
export class ArchivedProductReadinessError extends BusinessError {
  constructor(readonly productId: string) {
    super(
      "catalogue.product.archived_readiness",
      "Ce produit est archivé : le restaurer avant de retirer sa signature.",
    );
  }
}

/**
 * La déclinaison par défaut ne peut pas suivre la fiche réglementaire… d'elle-même.
 *
 * Le refus est ici et **aussi** en base (`CHECK`) : une fiche qui hérite d'elle
 * même n'est jamais déclarée et n'est jamais refusée — elle passerait donc la
 * mise en vente sans qu'aucun allergène ait été écrit.
 */
export class DefaultVariantCannotFollowItselfError extends DomainError {
  constructor(sku: string) {
    super(
      "catalogue.variant.default_cannot_follow_itself",
      `La déclinaison « ${sku} » est celle par défaut : elle porte sa fiche réglementaire, ` +
        `elle ne peut pas la suivre.`,
    );
  }
}

/**
 * On ne se désaligne pas d'une fiche qu'on n'a pas — et on n'aligne pas ce qui
 * n'appartient pas à ce produit.
 */
export class VariantNotInProductError extends DomainError {
  constructor(productId: string, variantId: string) {
    super(
      "catalogue.variant.not_in_product",
      `La déclinaison « ${variantId} » n'appartient pas au produit « ${productId} ».`,
    );
  }
}
