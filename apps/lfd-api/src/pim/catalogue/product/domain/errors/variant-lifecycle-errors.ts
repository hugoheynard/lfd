import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Les refus des deux gestes qui sortent une déclinaison de sa fiche — l'archiver,
 * ou en faire un produit (`plan-gestes-de-declinaison.md`, D1 et D2).
 *
 * Des `BusinessError` (409) : la demande est bien formée, c'est l'état de la
 * fiche qui la refuse, et chaque message dit le geste qui la rend possible.
 */

/** La déclinaison par défaut porte la fiche : on en désigne une autre d'abord. */
export class DefaultVariantNotDiscontinuableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.default_not_discontinuable",
      `La déclinaison « ${variantSku} » est celle par défaut de sa fiche : elle ne s'archive pas ` +
        "tant que d'autres déclinaisons sont en vente. Désignez-en d'abord une autre par défaut, " +
        "ou archivez la fiche entière.",
    );
  }
}

/** La dernière déclinaison vivante : c'est la fiche qu'on archive. */
export class LastLiveVariantNotDiscontinuableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.last_live_not_discontinuable",
      `La déclinaison « ${variantSku} » est la dernière encore en vente sur sa fiche : ` +
        "archivez la fiche entière plutôt que sa dernière déclinaison.",
    );
  }
}

/** Déjà archivée : il n'y a rien à archiver, ni à détacher. */
export class VariantAlreadyDiscontinuedError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.already_discontinued",
      `La déclinaison « ${variantSku} » est déjà archivée : elle n'est plus en vente, ` +
        "et on ne peut ni l'archiver de nouveau, ni en faire un produit.",
    );
  }
}

/** Le défaut ne se détache pas : il emporterait la fiche avec lui. */
export class DefaultVariantNotDetachableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.default_not_detachable",
      `La déclinaison « ${variantSku} » est celle par défaut de sa fiche : on n'en fait pas un ` +
        "produit séparé. Désignez-en d'abord une autre par défaut.",
    );
  }
}

/** Désarchiver ce qui n'est pas archivé n'a pas de sens. */
export class VariantNotDiscontinuedError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.not_discontinued",
      `La déclinaison « ${variantSku} » n'est pas archivée : elle est déjà en vente avec sa fiche.`,
    );
  }
}

/** Devenue un produit : la remettre en vente vendrait deux fois le même article. */
export class DetachedVariantNotRestorableError extends BusinessError {
  constructor(
    readonly variantSku: string,
    readonly productId: string,
    productLabel: string = productId,
  ) {
    super(
      "catalogue.variant.detached_not_restorable",
      `La déclinaison « ${variantSku} » est devenue le produit « ${productLabel} » : elle vit déjà ` +
        "sous cette fiche, et la désarchiver vendrait deux fois le même article. " +
        "Allez sur la fiche de ce produit pour le modifier.",
    );
  }
}
