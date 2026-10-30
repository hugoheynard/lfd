import type { PickupDiscounts } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { PickupDiscountAnnouncer } from "../../pickup-addresses/domain/pickup-discount.announcer.js";
import { announcedPickupDiscounts } from "../domain/pickup-discount-announcement.js";
import { BasketPromotionReader } from "../domain/ports/basket-promotion.reader.js";
import { PromotionsSourceReader } from "../domain/ports/promotions-source.reader.js";
import { servesLegacy } from "../domain/promotions-source.js";

/**
 * **L'annonce d'un point, tirée des promotions panier** (plan des promotions,
 * § 14 B5, lot L8). Sous `legacy` et à l'ombre, rien n'est lu : la caisse
 * sert la remise du site, l'annonce aussi. Sous `promotions`, la même
 * lecture que la caisse (`BasketPromotions.resolve`) : les promotions panier
 * non archivées, jugées à l'instant du `Clock`.
 */
@Injectable()
export class PromotionPickupDiscountAnnouncer extends PickupDiscountAnnouncer {
  constructor(
    private readonly sources: PromotionsSourceReader,
    private readonly promotions: BasketPromotionReader,
    private readonly clock: Clock,
  ) {
    super();
  }

  async announced(
    pickupIds: readonly string[],
  ): Promise<ReadonlyMap<string, PickupDiscounts> | null> {
    if (servesLegacy(await this.sources.current())) {
      return null;
    }
    const at = this.clock.now();
    const live = await this.promotions.live();
    return new Map(pickupIds.map((id) => [id, announcedPickupDiscounts(live, id, at)]));
  }
}
