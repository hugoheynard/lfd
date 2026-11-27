import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de l'audience par déclinaison
 * (`documentation/catalogue/plan-audience-par-declinaison.md`, A2 et A3).
 *
 * Des 409 : la demande est bien formée, c'est l'état de la fiche qui la
 * refuse. Le défaut suit toujours sa fiche — sinon « la fiche se vend à X »
 * cesserait d'être vrai à l'écran, et la fiche pourrait disparaître d'un rayon
 * par son défaut.
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

/** A2 : changer de défaut vers une déclinaison qui a sa propre audience. */
export class OwnAudienceVariantNotDefaultableError extends BusinessError {
  constructor(readonly variantSku: string) {
    super(
      "catalogue.variant.own_audience_not_defaultable",
      `La déclinaison « ${variantSku} » a sa propre audience : la remettre sur celle de la ` +
        "fiche avant d'en faire le défaut. Le défaut vend toujours à l'audience de sa fiche.",
    );
  }
}
