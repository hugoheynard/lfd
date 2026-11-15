import { Injectable } from "@nestjs/common";

import { PackedOrdersReader } from "../../channels/packing/packed-orders.reader.js";
import { ProductionDayRepository, withSeals } from "../../day/index.js";
import type { ProductionDay, ServiceDay } from "../../day/index.js";

/**
 * **La journée, avec ses bacs fermés**, telle que le contrôle qualité la juge
 * (plan `colisage/colisage.md`, §17.2, K3a).
 *
 * Il ne demande au colisage que « cette commande est-elle colisée ? »
 * (`PackedOrdersReader`) ; la règle qui pose les fermetures sur la journée
 * (`withSeals`) est au noyau. La lecture du canal reste ici, dans le métier
 * qui s'en sert : la porte du noyau ne charge aucun canal.
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
    return withSeals(current, await this.packed.packedOn(day.value));
  }
}
