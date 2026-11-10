import type { AnnouncedPickupDiscounts } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../platform/time/clock.js";
import { PickupDiscountAnnouncer } from "../../pickup-addresses/domain/pickup-discount.announcer.js";
import { announcedPickupDiscounts } from "../domain/pickup-discount-announcement.js";
import { BasketPromotionReader } from "../domain/ports/basket-promotion.reader.js";

/**
 * **L'annonce d'un point, tirée des promotions panier** (plan des promotions,
 * § 14 B5, lot L8) : la même lecture que la caisse (`BasketPromotions.resolve`) : les promotions panier
 * non archivées, jugées à l'instant du `Clock`.
 */
@Injectable()
export class PromotionPickupDiscountAnnouncer extends PickupDiscountAnnouncer {
  constructor(
    private readonly promotions: BasketPromotionReader,
    private readonly clock: Clock,
  ) {
    super();
  }

  async announced(
    pickupIds: readonly string[],
  ): Promise<ReadonlyMap<string, AnnouncedPickupDiscounts>> {
    const at = this.clock.now();
    const live = await this.promotions.live();
    return new Map(pickupIds.map((id) => [id, announcedPickupDiscounts(live, id, at)]));
  }
}
