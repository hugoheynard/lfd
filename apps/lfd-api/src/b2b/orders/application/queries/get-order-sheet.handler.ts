import type { ClientSheet } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderGuardReader } from "../../domain/ports/order-guard.reader.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { ensureOrderVisible } from "../../domain/services/order-access.js";
import { clientSheetOf } from "../../domain/services/order-sheet.js";
import { GetOrderSheetQuery } from "./get-order-sheet.query.js";

/**
 * Sert le bon de commande **du client**, à qui a le droit de voir la commande.
 *
 * Le type de retour est `ClientSheet`, pas `OrderSheet` : la signature elle-même
 * interdit qu'un jour ce chemin rende une feuille staff. Rendre l'union aurait
 * laissé la porte ouverte à un `orderSheetOf(order, query.audience)` ajouté « pour
 * factoriser », et c'est précisément le geste qui ferait fuiter la grille.
 *
 * Le mur est celui de la commande, à l'identique de `GetOrderHandler` — le rôle
 * n'est demandé au garde-fou que si la commande est rattachée à une entreprise.
 */
@QueryHandler(GetOrderSheetQuery)
export class GetOrderSheetHandler implements IQueryHandler<GetOrderSheetQuery, ClientSheet> {
  constructor(
    private readonly guard: OrderGuardReader,
    private readonly orders: OrderReader,
  ) {}

  async execute(query: GetOrderSheetQuery): Promise<ClientSheet> {
    const owned = await this.orders.findById(query.orderId);
    if (owned === null) {
      throw new OrderNotFoundError(query.orderId);
    }
    const role =
      owned.companyId === null ? null : await this.guard.roleOf(query.actorUserId, owned.companyId);

    ensureOrderVisible(owned, query.actorUserId, role, query.orderId);
    return clientSheetOf(owned.view);
  }
}
