import { BusinessError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de la **nature « maison »** d'un payeur (plan
 * `comptabilite/facturation/plan-restaurants-maison.md`, D3). Chaque message
 * nomme le cas réel et le geste de sortie.
 */

/** Un organisme public ne peut pas être un de nos restaurants. */
export class InHousePublicPayerError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.in_house.public_payer",
      "Ce compte est un organisme public : il ne peut pas être marqué « restaurant maison ». Un restaurant maison est une société à nous ; vérifiez la forme juridique du compte.",
    );
  }
}

/** Une correction d'identité ferait d'un restaurant maison un organisme public. */
export class InHousePayerBecomesPublicError extends BusinessError {
  constructor(readonly companyId: string) {
    super(
      "account.in_house.becomes_public",
      "Ce compte est marqué « restaurant maison » : il ne peut pas prendre la forme juridique d'un organisme public. Retirez d'abord la nature maison, sur sa fiche.",
    );
  }
}

/**
 * Marquer ou démarquer romprait un suivi de facturation : le principal suivi,
 * ou les sites qui suivent, n'auraient plus la même nature maison.
 */
export class InHouseAcrossBillingFollowError extends BusinessError {
  constructor(
    readonly companyId: string,
    readonly side: "principal" | "sites",
  ) {
    super(
      "account.in_house.across_billing_follow",
      side === "principal"
        ? "Ce site suit la facturation de son compte principal, qui n'aurait plus la même nature « maison ». Arrêtez d'abord ce suivi, ou changez la nature du principal."
        : "Des sites suivent la facturation de ce compte et n'auraient plus la même nature « maison ». Arrêtez d'abord leur suivi, ou changez leur nature.",
    );
  }
}

/** Un site ne suit la facturation que d'un principal de même nature maison. */
export class BillingFollowAcrossInHouseError extends BusinessError {
  constructor(readonly parentId: string) {
    super(
      "account.hierarchy.billing_across_in_house",
      "Ce site et son compte principal n'ont pas la même nature « restaurant maison » : il ne peut pas en suivre la facturation. Marquez ou démarquez d'abord l'un des deux.",
    );
  }
}
