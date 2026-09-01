import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../../platform/shared/errors/app-error.js";

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
 * Invariant 7 du socle : `PublishProduct` est **refusée** si une déclinaison
 * active n'a pas de fiche réglementaire.
 *
 * Le message nomme les références en cause : « ce produit n'est pas
 * publiable » n'aide personne devant un produit à six déclinaisons.
 */
export class ProductNotPublishableError extends BusinessError {
  constructor(
    readonly productId: string,
    readonly missingSheetSkus: readonly string[],
  ) {
    super(
      "catalogue.product.not_publishable",
      `Publication refusée : fiche réglementaire manquante sur ${missingSheetSkus.join(", ")}.`,
    );
  }
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
 * Une dérogation pour un contexte que la **famille ne vend pas**.
 *
 * Déroger là où rien ne se vend, c'est décider d'un prix pour une vente qui
 * n'a pas lieu — et gonfler le compte d'usages d'un taux que plus rien ne
 * facture, donc bloquer sa suppression pour rien. La règle est la même que sur
 * la famille : elle change juste de porteur.
 */
export class ProductVatWithoutChannelError extends BusinessError {
  constructor(readonly contextKey: string) {
    super(
      "catalogue.product.tva_without_channel",
      `La famille ne vend pas en « ${contextKey} » : son taux ne se redéfinit pas.`,
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
