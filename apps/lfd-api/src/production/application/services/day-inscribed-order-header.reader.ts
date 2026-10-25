import { Injectable } from "@nestjs/common";

import {
  InscribedOrderHeaderReader,
  type InscribedOrderHeader,
} from "../../channels/packing/inscribed-order-header.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * L'implémentation du port publié `InscribedOrderHeaderReader` : la journée,
 * lue par son agrégat — l'en-tête est celui que la clôture ou le retirage a
 * figé. Même figure que `DayPlannedDestinationsReader`.
 *
 * Lecture seule : `load` ne prend aucun verrou et n'écrit rien. Appelé par le
 * colisage dans l'unité de travail de l'annulation, APRÈS que le guichet du
 * fournil a verrouillé la journée : l'inscription ne peut plus bouger.
 */
@Injectable()
export class DayInscribedOrderHeaderReader extends InscribedOrderHeaderReader {
  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async headerOf(serviceDay: string, orderId: string): Promise<InscribedOrderHeader | null> {
    const day = await this.days.load(ServiceDay.of(serviceDay));
    const order = day.orders.find((candidate) => candidate.orderId === orderId);
    if (order === undefined) {
      return null;
    }
    return {
      reference: order.reference,
      customerLabel: order.customerLabel,
      fulfillmentMethod: order.fulfillmentMethod,
      dueAt: order.dueAt,
      clientele: order.clientele,
      siteId: order.siteId,
    };
  }
}
