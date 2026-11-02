import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../../platform/time/clock.js";
import {
  type ShelfTodayQuestion,
  ShelfTodaySites,
} from "../../../order-cutoffs/domain/shelf-today-sites.js";
import { DayShelfStock } from "../../../resupply/application/day-shelf-stock.js";
import { SiteDaySettingsReader } from "../../domain/ports/site-day-settings.reader.js";
import { pickupLeftToday } from "../../domain/services/shelf-circuit.js";

/**
 * Les points qui vendent encore aujourd'hui sur leur vitrine (plan du jour J,
 * lot L4) — la MÊME règle de créneaux que la passation (`pickupLeftToday`), et
 * le MÊME reste (`DayShelfStock`) : la boutique ne propose pas aujourd'hui là
 * où la passation le refuserait. Sans verrou : il ouvre un écran.
 */
@Injectable()
export class OrderShelfTodaySites extends ShelfTodaySites {
  constructor(
    private readonly sites: SiteDaySettingsReader,
    private readonly stock: DayShelfStock,
    private readonly clock: Clock,
  ) {
    super();
  }

  async sellingToday(question: ShelfTodayQuestion): Promise<ReadonlySet<string>> {
    const settings = await this.sites.forDay(question.day, question.siteIds);
    const now = instantToLocal(this.clock.now()).time;
    const door = question.audience === "pro" ? "pro_online" : "public_online";
    const selling = new Set<string>();
    for (const siteId of question.siteIds) {
      const site = settings.get(siteId) ?? null;
      if (pickupLeftToday(door, site, now) && (await this.stocks(siteId, question))) {
        selling.add(siteId);
      }
    }
    return selling;
  }

  /** Tout le panier a un reste positif — ou, sans panier, au moins un article. */
  private async stocks(siteId: string, question: ShelfTodayQuestion): Promise<boolean> {
    const left = (await this.stock.at(siteId, question.day)).filter(
      (line) => line.estimatedStock > 0,
    );
    if (question.cartSkus.length === 0) {
      return left.length > 0;
    }
    return question.cartSkus.every((sku) => left.some((line) => line.sku === sku));
  }
}
