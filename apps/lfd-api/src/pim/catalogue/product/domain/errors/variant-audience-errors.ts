import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'audience par déclinaison
 * (`documentation/catalogue/plan-audience-par-declinaison.md`, A2 et A3).
 *
 * Tous des 409 : la demande est bien formée, c'est l'état de la fiche qui la
 * refuse. Deux raisons les fondent. Le défaut suit toujours sa fiche — sinon
 * « la fiche se vend à X » cesserait d'être vrai à l'écran, et la fiche
 * pourrait disparaître d'un rayon par son défaut. Et une déclinaison autre que
 * le défaut ne paraît nulle part, ni au rayon ni au réassort, si sa fiche ne
 * montre pas chaque déclinaison en vignette.
 */
export class DefaultVariantOwnAudienceError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.audience_on_default",
      `La déclinaison « ${variantSku} » est la déclinaison par défaut : elle vend toujours à ` +
        "l'audience de sa fiche. Pour changer à qui elle vend, changez l'audience de la fiche, " +
        "ou faites d'une autre déclinaison le défaut.",
    );
  }
}

/** A3 : poser une audience propre demande que la fiche montre chaque déclinaison. */
export class VariantAudienceWithoutTilesError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.audience_without_tiles",
      `La déclinaison « ${variantSku} » ne peut pas avoir sa propre audience : sa fiche ne ` +
        "montre que son défaut au rayon et au réassort, et cette déclinaison n'y paraîtrait " +
        "nulle part. Cochez d'abord « Montrer chaque déclinaison en vignette ».",
    );
  }
}

/** A2, premier geste : changer de défaut vers une déclinaison qui a sa propre audience. */
export class OwnAudienceVariantNotDefaultableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.own_audience_not_defaultable",
      `La déclinaison « ${variantSku} » a sa propre audience : la remettre sur celle de la ` +
        "fiche avant d'en faire le défaut. Le défaut vend toujours à l'audience de sa fiche.",
    );
  }
}

/** A2, deuxième geste : décocher les vignettes d'une fiche dont une déclinaison a sa propre audience. */
export class TilesHoldVariantAudienceError extends BusinessError {
  constructor(readonly variantSkus: readonly string[]) {
    super(
      "catalogue.product.tiles_hold_variant_audience",
      `La fiche ne peut plus montrer seulement son défaut : ${variantSkus.map((sku) => `« ${sku} »`).join(", ")} ` +
        "a sa propre audience et ne paraîtrait plus nulle part (les déclinaisons arrêtées " +
        "comptent, elles peuvent être restaurées). Remettez d'abord ces déclinaisons sur " +
        "l'audience de la fiche.",
    );
  }
}

/** A2, troisième geste : restaurer une déclinaison à audience propre sur une fiche sans vignettes. */
export class RestoredVariantAudienceWithoutTilesError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.restored_audience_without_tiles",
      `La déclinaison « ${variantSku} » a sa propre audience, et sa fiche ne montre que son ` +
        "défaut : restaurée, elle ne paraîtrait nulle part. Cochez d'abord « Montrer chaque " +
        "déclinaison en vignette ».",
    );
  }
}
