import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La période demandée au rapport du sur mesure par client ne se lit pas
 * (400) : un jour qui n'existe pas, une fin avant le début, ou plus d'un an.
 * Le message dit la borne pour que la personne corrige sa saisie.
 */
export class MadeToOrderReportPeriodError extends DomainError {
  constructor(reason: string) {
    super("growth.made_to_order_report.invalid_period", reason);
  }
}
