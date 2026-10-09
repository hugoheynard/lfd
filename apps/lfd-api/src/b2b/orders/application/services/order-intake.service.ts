import { ordersOpenTo } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { OrderOpeningReader } from "../../../order-opening/domain/ports/order-opening.reader.js";
import { OrdersClosedForAudienceError } from "../../domain/errors/orders-closed-for-audience.error.js";
import { CustomerAudiences } from "./customer-audiences.service.js";

/**
 * **La boutique prend-elle cette commande ?** — le réglage « Ouverture de la
 * boutique » appliqué à la clientèle de qui commande.
 *
 * Appelé par les deux passations CLIENT seulement (`PlaceOrderHandler`,
 * `PlaceShopOrderHandler`), et jamais par `OrderDrafting` : la composition est
 * partagée avec la saisie du staff (`PlaceOrderForCustomerHandler`), que la
 * fermeture ne bloque PAS — l'équipe qui prend une commande au téléphone doit
 * pouvoir la saisir boutique fermée (Hugo, 2026-10-09).
 *
 * La clientèle se déduit par {@link CustomerAudiences}, la même règle que la
 * remise et la livraison : B2B pour une société active seulement.
 */
@Injectable()
export class OrderIntake {
  constructor(
    private readonly opening: OrderOpeningReader,
    private readonly audiences: CustomerAudiences,
  ) {}

  /**
   * `null` = espace perso ou commande sans compte : particulier.
   *
   * @throws {OrdersClosedForAudienceError} la boutique est fermée à cette clientèle.
   */
  async ensureOpenFor(companyId: string | null): Promise<void> {
    const audience = await this.audiences.of(companyId);
    if (!ordersOpenTo(await this.opening.current(), audience)) {
      throw new OrdersClosedForAudienceError(audience);
    }
  }
}
