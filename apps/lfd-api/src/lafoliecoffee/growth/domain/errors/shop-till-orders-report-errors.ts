import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La période demandée au rapport des commandes à régler en boutique ne se lit
 * pas (400) : un jour qui n'existe pas, une fin avant le début, ou plus d'un
 * an. Le message dit la borne pour que la personne corrige sa saisie.
 */
export class ShopTillOrdersReportPeriodError extends DomainError {
  constructor(reason: string) {
    super("growth.shop_till_orders_report.invalid_period", reason);
  }
}
