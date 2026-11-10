import { ResourceNotFoundError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La société à qui l'on veut réserver un article n'existe pas.
 *
 * L'identifiant est opaque, sans clé étrangère (convention de la mercuriale,
 * `plan-articles-sur-mesure.md` § 4) : rien en base ne refuserait une ligne
 * qui ne désigne personne. Le refus est donc posé ici, avant l'écriture.
 */
export class ReservationCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "catalog.reservation.company_not_found",
      `La société ${companyId} est introuvable : rechargez la fiche client, elle a pu être fusionnée ou le lien est erroné.`,
    );
  }
}
