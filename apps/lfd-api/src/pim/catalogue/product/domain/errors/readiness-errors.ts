import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

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
