import { Injectable } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import type { CustomerRevisionStanding } from "../../orders/application/queries/get-order-revisability.handler.js";
import { GetOrderRevisabilityQuery } from "../../orders/application/queries/get-order-revisability.query.js";
import {
  type ChangeableOrder,
  ChangeableOrderReader,
  type ChangeStanding,
} from "../domain/ports/changeable-order.reader.js";
import { ReportableOrderReader } from "../domain/ports/reportable-order.reader.js";

/**
 * La commande dont on demande la modification, murée par LA règle d'accès
 * d'une commande (celle du signalement, `OrderReportableOrderReader`) et jugée
 * par LA règle de la modification — la requête des commandes qui sert
 * `revisability` à la boutique (`GetOrderRevisabilityQuery`), par le bus :
 * aucune seconde règle, aucune lecture de leurs tables d'ici.
 */
@Injectable()
export class OrderChangeableOrderReader extends ChangeableOrderReader {
  constructor(
    private readonly orders: ReportableOrderReader,
    private readonly queries: QueryBus,
  ) {
    super();
  }

  async visibleTo(orderId: string, actorUserId: string): Promise<ChangeableOrder | null> {
    const order = await this.orders.visibleTo(orderId, actorUserId);
    if (order === null) {
      return null;
    }
    const standing = await this.queries.execute<
      GetOrderRevisabilityQuery,
      CustomerRevisionStanding
    >(new GetOrderRevisabilityQuery(actorUserId, orderId));
    return {
      id: order.id,
      number: order.number,
      companyId: order.companyId,
      revision: standing.revision,
      standing: standingOf(standing),
    };
  }
}

function standingOf(standing: CustomerRevisionStanding): ChangeStanding {
  const { revisability } = standing;
  if (revisability.revisable) {
    return "revisable";
  }
  return revisability.code === "too_late" ? "too_late" : "closed";
}
