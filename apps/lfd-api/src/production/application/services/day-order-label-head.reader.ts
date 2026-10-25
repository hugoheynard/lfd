import { Injectable } from "@nestjs/common";

import {
  OrderLabelHeadReader,
  type OrderLabelHead,
} from "../../channels/packing/order-label-head.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { dossierSheetHeadOf } from "../../domain/services/dossier-sheet-head.js";
import { fulfillmentLabelOf } from "../../domain/services/fulfillment-method-label.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * L'implémentation du port publié `OrderLabelHeadReader` : la journée, lue par
 * son agrégat, titrée par les fonctions des papiers du fournil — le libellé
 * du dossier du jour, le créneau de l'en-tête du bon. Même figure que
 * `DayInscribedOrderHeaderReader`.
 *
 * Lecture seule : `load` ne prend aucun verrou et n'écrit rien.
 */
@Injectable()
export class DayOrderLabelHeadReader extends OrderLabelHeadReader {
  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async headOf(serviceDay: string, orderId: string): Promise<OrderLabelHead | null> {
    const day = await this.days.load(ServiceDay.of(serviceDay));
    const order = day.orders.find((candidate) => candidate.orderId === orderId);
    if (order === undefined) {
      return null;
    }
    return { fulfillmentLabel: fulfillmentLabelOf(order), when: dossierSheetHeadOf(order).when };
  }
}
