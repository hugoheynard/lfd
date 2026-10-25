import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { ReserveShopRelease, type ShopRelease } from "../../channels/commerce/index.js";
import { PackingStockSentToShopEvent } from "../../domain/events/packing-stock-sent-to-shop.events.js";
import { PackingStockRepository } from "../../domain/ports/packing-stock.repository.js";

/**
 * L'implémentation de la sortie de réserve vers une boutique — cf.
 * {@link ReserveShopRelease} (plan A1, lot A1.4).
 *
 * La réserve, article par article, triés par SKU (l'ordre de tous ceux qui
 * la verrouillent), sous verrou ; `sendToShop` refuse si le libre manque, et
 * le refus remonte à l'appelant, qui défait tout. Puis le fait journalisé.
 * Tourne dans l'unité de travail de l'appelant : il n'en ouvre pas.
 */
@Injectable()
export class PackingReserveShopRelease extends ReserveShopRelease {
  constructor(
    private readonly stocks: PackingStockRepository,
    private readonly events: DomainEventPublisher,
  ) {
    super();
  }

  async send(release: ShopRelease): Promise<void> {
    const ordered = [...release.lines].sort((a, b) => a.sku.localeCompare(b.sku));
    for (const line of ordered) {
      const stock = await this.stocks.lock(release.serviceDay, line.sku);
      stock.sendToShop(line.quantity, line.productName);
      await this.stocks.save(stock);
    }
    await this.events.publishTraced(
      new PackingStockSentToShopEvent(
        release.serviceDay,
        release.siteId,
        release.siteLabel,
        release.resupplyId,
        ordered,
      ),
    );
  }
}
