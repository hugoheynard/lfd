/**
 * Le cron demande d'annuler les commandes boutique restées non réglées au-delà
 * de leur délai (plan `documentation/order/plan-commandes-non-reglees.md`,
 * §2.3, §4.5). Sans paramètre : l'instant est celui du `Clock`.
 */
export class ExpireUnsettledShopOrdersCommand {}

export type { UnsettledShopOrderExpiryReport } from "../services/unsettled-shop-order-expiry.service.js";
