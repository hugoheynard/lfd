import { Injectable } from "@nestjs/common";

import { PackedOrdersReader } from "../../channels/packing/packed-orders.reader.js";
import { ProductionDay } from "../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { overlaySeals } from "../../domain/services/packing-overlay.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * **La journée, avec ses bacs fermés — où qu'ils soient tenus** (plan
 * `colisage/colisage.md`, §17.2, K3a).
 *
 * Il ne demande au colisage que « cette commande est-elle colisée ? »
 * (`PackedOrdersReader`), ce que l'état de la journée et le contrôle qualité
 * lisent, et rien de plus.
 *
 * Depuis K3c, la question va au colisage **quel que soit** le propriétaire de
 * la journée : le fournil ne lit plus ses colonnes `packed_*`. Une journée
 * `legacy` — colisée avec l'ancien poste — n'a donc plus aucun bac fermé à ses
 * yeux (§16 : « une journée `legacy` restante n'est plus colisable »).
 *
 * 🔴 **Une LECTURE.** La journée rendue ne s'écrit jamais. Un handler qui
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
    const sealed = await this.packed.packedOn(day.value);
    return ProductionDay.fromSnapshot({
      ...current.toSnapshot(),
      orders: overlaySeals(current.orders, sealed),
    });
  }
}
