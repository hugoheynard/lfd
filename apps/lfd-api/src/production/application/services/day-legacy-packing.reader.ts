import { Injectable } from "@nestjs/common";

import {
  LegacyPackingReader,
  type LegacyPackingDay,
} from "../../channels/packing/legacy-packing.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * L'implémentation du port publié `LegacyPackingReader` : la journée, lue par
 * son agrégat — « sorti » est donc celui des gardes du poste, coches héritées
 * comprises, et non une somme refaite à côté.
 *
 * Lecture seule : `load` ne prend aucun verrou et n'écrit rien.
 */
@Injectable()
export class DayLegacyPackingReader extends LegacyPackingReader {
  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async dayOf(serviceDay: string): Promise<LegacyPackingDay> {
    const day = await this.days.load(ServiceDay.of(serviceDay));
    const skus = [...new Set(day.counts.map((item) => item.sku))].sort();
    return {
      serviceDay: day.day.value,
      orders: day.orders.map((order) => ({
        orderId: order.orderId,
        reference: order.reference,
        dueAt: order.dueAt,
        lines: order.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
      })),
      produced: skus
        .map((sku) => ({ sku, quantity: day.producedOf(sku) }))
        .filter((item) => item.quantity > 0),
    };
  }
}
