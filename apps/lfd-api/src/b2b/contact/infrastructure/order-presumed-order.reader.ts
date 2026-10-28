import { Injectable } from "@nestjs/common";

import { OrderReader } from "../../orders/domain/ports/order.reader.js";
import { PresumedOrderReader, type PresumedOrder } from "../domain/ports/presumed-order.reader.js";
import { ReportableOrderReader } from "../domain/ports/reportable-order.reader.js";

/**
 * La commande d'un numéro, murée par la règle d'accès des COMMANDES — celle
 * que `ReportableOrderReader` applique déjà (`isOrderVisible`, la règle de
 * `GetOrderHandler`) : aucune seconde règle ici, seulement le passage du
 * numéro à l'identifiant.
 */
@Injectable()
export class OrderPresumedOrderReader extends PresumedOrderReader {
  constructor(
    private readonly orders: OrderReader,
    private readonly visible: ReportableOrderReader,
  ) {
    super();
  }

  async visibleByNumber(orderNumber: string, userId: string): Promise<PresumedOrder | null> {
    const author = await this.orders.findAuthorByReference(orderNumber);
    if (author === null) {
      return null;
    }
    const order = await this.visible.visibleTo(author.orderId, userId);
    return order === null
      ? null
      : { id: order.id, number: order.number, companyId: order.companyId };
  }
}
