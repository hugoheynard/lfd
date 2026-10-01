import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Des courriels « votre livraison est en route » ne sont pas partis (plan
 * `documentation/livraisons/plan-en-route.md`, PL3-D2). Levée APRÈS avoir
 * tenté toutes les commandes de la tournée : un envoi raté ne prive pas les
 * autres clients du leur. Lue dans le journal du travail de fond, jamais par un
 * client — la tournée, elle, est partie.
 */
export class DeliveryEnRouteMailFailedError extends TechnicalError {
  constructor(roundId: string, failedOrderIds: readonly string[], cause: unknown) {
    super(
      "DELIVERY_EN_ROUTE_MAIL_FAILED",
      `Tournée ${roundId} partie, mais le courriel « votre livraison est en route » n'a pas ` +
        `pu partir pour ${failedOrderIds.length} commande(s) : ${failedOrderIds.join(", ")}. ` +
        "Le départ n'est pas à refaire ; prévenir ces clients par téléphone si besoin.",
      cause,
    );
  }
}
