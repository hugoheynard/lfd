import {
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Trop de commandes pour un récapitulatif (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, §6.5).
 */
export class OrderSummaryTooManyOrdersError extends DomainError {
  constructor(
    readonly requested: number,
    readonly max: number,
  ) {
    super(
      "orders.summary.too_many_orders",
      `Le récapitulatif porte sur ${max} commandes au plus ; ${requested} sont sélectionnées. ` +
        "Resserrer le filtre de dates ou de site, puis récapituler en plusieurs fois.",
    );
  }
}

/**
 * Des commandes demandées hors du périmètre du demandeur — ou inexistantes,
 * ce qu'on ne distingue pas : jamais de récapitulatif partiel (§2, §6.5).
 */
export class OrderSummaryOrdersNotFoundError extends ResourceNotFoundError {
  constructor(readonly orderIds: readonly string[]) {
    super(
      "orders.summary.orders_not_found",
      `Commande(s) introuvable(s) dans votre périmètre : ${orderIds.join(", ")}. ` +
        "Recharger la liste des commandes et refaire la sélection.",
    );
  }
}

/** Une borne de date du filtre placée après l'autre (§6.6). */
export class InvertedOrderDayRangeError extends DomainError {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(
      "orders.company_list.inverted_day_range",
      `Le filtre commence le ${from}, après sa fin le ${to}. ` +
        "Choisir une date de début antérieure ou égale à la date de fin.",
    );
  }
}
