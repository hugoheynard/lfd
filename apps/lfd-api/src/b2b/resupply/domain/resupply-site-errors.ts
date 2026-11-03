import { ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le point de retrait n'existe pas, ou est archivé. Une erreur du POINT, pas
 * du reçu : six gestes la lèvent (demande, envoi du fournil, sortie de
 * réserve, reçu sans commande, alerte, nom — compté le 2026-11-03). Son code
 * garde la valeur `resupply.receipt.site_unknown` déjà servie aux écrans :
 * une valeur n'est pas un nom.
 */
export class ResupplySiteUnknownError extends ResourceNotFoundError {
  constructor(readonly siteId: string) {
    super(
      "resupply.receipt.site_unknown",
      "Ce point de retrait n'existe pas ou a été archivé : choisissez-en un autre.",
    );
  }
}
