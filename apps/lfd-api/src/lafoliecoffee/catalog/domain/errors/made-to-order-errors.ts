import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

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

/**
 * On veut attribuer à un compte client un article qui n'est pas sur mesure.
 *
 * Seul le sur mesure s'attribue (`plan-fin-du-sur-mesure.md`, D2, décidé par
 * Hugo le 2026-11-27) : un article ordinaire est servi à toute son audience.
 * La base tient la même règle par une clé ; ce refus-ci la dit en mots.
 */
export class OrdinaryArticleReservationError extends BusinessError {
  constructor(readonly sku: string) {
    super(
      "catalog.reservation.not_custom_recipe",
      `Seul un article sur mesure s'attribue à des comptes clients. Activez « sur mesure » sur la déclinaison ${sku} dans sa fiche, puis attribuez-la.`,
    );
  }
}
