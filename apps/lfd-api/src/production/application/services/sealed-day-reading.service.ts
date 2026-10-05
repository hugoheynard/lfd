import { Injectable } from "@nestjs/common";

import { PackedOrdersReader } from "../../channels/packing/packed-orders.reader.js";
import { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { overlaySeals } from "../../domain/services/packing-overlay.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **La journée, avec ses bacs fermés — où qu'ils soient tenus** (plan
 * `colisage/plan-domaine-colisage.md`, §17.2, K3a).
 *
 * Le pendant étroit de `PackedDayReading` : il ne demande au colisage que
 * « cette commande est-elle colisée ? » (`PackedOrdersReader`), ce que l'état
 * de la journée et le contrôle qualité lisent, et rien de plus. Sur une
 * journée `legacy`, la journée chargée dit tout.
 *
 * 🔴 **Une LECTURE.** La journée rendue ne s'écrit jamais : `save` réécrirait
 * dans les colonnes du fournil des bacs qu'il ne tient plus. Un handler qui
 * écrit charge la journée par le dépôt.
 */
@Injectable()
export class SealedDayReading {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly packed: PackedOrdersReader,
  ) {}

  async load(day: ServiceDay): Promise<ProductionDay> {
    const current = await this.days.load(day);
    if (current.packingOwner !== "packing") {
      return current;
    }
    const sealed = await this.packed.packedOn(day.value);
    return ProductionDay.fromSnapshot({
      ...current.toSnapshot(),
      orders: overlaySeals(current.orders, sealed),
    });
  }
}
