import { Logger } from "@nestjs/common";
import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderPlacedEvent } from "../../domain/events/order-placed.event.js";
import { UnsettledShopOrderExpiry } from "../services/unsettled-shop-order-expiry.service.js";

/**
 * **Une seule commande boutique en attente par particulier** (plan
 * `documentation/order/plan-commandes-non-reglees.md`, §2.2, §4.4).
 *
 * Accroché au FAIT de passation et non aux deux handlers qui passent : le
 * remplacement ne peut ainsi jamais refuser la nouvelle commande — il tourne
 * après qu'elle est écrite, et son échec ne remonte pas. C'est l'adaptateur
 * qui décide si la nouvelle commande remplace quelque chose (le particulier
 * lui-même, sans société, carte) : une commande passée par le staff pour lui
 * ne remplace rien.
 *
 * Même bloc, même bus : rien ne traverse, et un redémarrage qui perd ce fait
 * laisse au cron d'expiration le soin de la commande précédente.
 */
@EventsHandler(OrderPlacedEvent)
export class ReplaceUnsettledShopOrders implements IEventHandler<OrderPlacedEvent> {
  private readonly logger = new Logger(ReplaceUnsettledShopOrders.name);

  constructor(
    private readonly expiry: UnsettledShopOrderExpiry,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: OrderPlacedEvent): void {
    if (event.companyId !== null) {
      return;
    }
    void this.work.track(this.run(event.orderId), "replace-unsettled-shop-orders");
  }

  private async run(orderId: string): Promise<void> {
    try {
      const report = await this.expiry.replaceEarlier(orderId);
      if (report.kept > 0) {
        this.logger.warn(
          `Commande ${orderId} : ${String(report.kept)} commande(s) précédente(s) gardée(s), ` +
            "leur paiement est en cours ou Stripe n'a pas répondu.",
        );
      }
    } catch (error) {
      this.logger.error(
        `Remplacement des commandes non réglées échoué (commande ${orderId})`,
        error,
      );
    }
  }
}
