import { TechnicalError } from "../shared/errors/app-error.js";

/** Le logo de la marque manque sur le disque de l'application. */
export class BrandLogoUnavailableError extends TechnicalError {
  constructor(
    readonly path: string,
    cause: unknown,
  ) {
    super(
      "brand.logo_unavailable",
      `Le logo « ${path} » est illisible : aucun papier PDF qui le porte (bon de commande, matrice des allergènes) ne peut être rendu. Vérifier que le dossier assets/ de l'API est déployé avec elle.`,
      cause,
    );
  }
}
