import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Le logo du bon de commande manque sur le disque de l'application. */
export class OrderSheetLogoUnavailableError extends TechnicalError {
  constructor(
    readonly path: string,
    cause: unknown,
  ) {
    super(
      "orders.sheet.logo_unavailable",
      `Le logo « ${path} » du bon de commande est illisible : aucun bon PDF ne peut être rendu. Vérifier que le dossier assets/ de l'API est déployé avec elle.`,
      cause,
    );
  }
}
