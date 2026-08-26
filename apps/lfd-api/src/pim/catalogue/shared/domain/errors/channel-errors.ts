import { BusinessError } from "../../../../../platform/shared/errors/app-error.js";

/** Une matrice de canaux ne cite que des points de vente qui existent. */
export class UnknownPointOfSaleError extends BusinessError {
  constructor(readonly pointOfSaleId: string) {
    super(
      "catalogue.channels.unknown_point_of_sale",
      `Le point de vente « ${pointOfSaleId} » n’existe pas.`,
    );
  }
}

/**
 * On ne vend pas un contexte là où il n'est pas offert.
 *
 * Vendre « sur place » depuis une boutique sans salle produisait une fiche
 * pour un lieu qui ne sert pas — et personne ne le voyait avant la projection.
 */
export class ContextNotOfferedError extends BusinessError {
  constructor(
    readonly pointOfSaleId: string,
    readonly contextKey: string,
  ) {
    super(
      "catalogue.channels.context_not_offered",
      `Ce point de vente n’offre pas le contexte « ${contextKey} ».`,
    );
  }
}
