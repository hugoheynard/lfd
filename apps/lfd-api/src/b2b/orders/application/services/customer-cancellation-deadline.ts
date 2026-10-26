import { Injectable } from "@nestjs/common";

import { CustomerCancellationSettingsReader } from "../../../order-opening/domain/ports/customer-cancellation-settings.reader.js";
import type { Order } from "../../domain/entities/order.js";

/**
 * **Le délai d'annulation du réglage du moment, figé sur la commande** (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, « Le délai
 * figé », Hugo 2026-10-26).
 *
 * Appelé par les deux passations CLIENT (`PlaceOrderHandler`,
 * `PlaceShopOrderHandler`), avant l'écriture. La saisie de l'équipe ne
 * l'appelle pas : elle porte toujours une société, et un pro n'a pas de délai.
 * La règle (qui reçoit un délai, et lequel) est celle de l'agrégat ; ce
 * service ne fait que lire le réglage.
 */
@Injectable()
export class CustomerCancellationDeadline {
  constructor(private readonly settings: CustomerCancellationSettingsReader) {}

  async fixOn(order: Order): Promise<void> {
    const { delayEnabled, hoursBefore } = await this.settings.current();
    order.fixCustomerCancellationDeadline({ delayEnabled, hoursBefore });
  }
}
