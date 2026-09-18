import type { OrderPackingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  StaffAuthorDirectory,
  type StaffAuthors,
} from "../../../../staff/directory/domain/staff-author-directory.js";
import { OrderReferenceNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderReader, type PackingOrder } from "../../domain/ports/order.reader.js";
import { packingBlocker } from "../../domain/services/packing.js";
import { GetPackingQuery } from "./get-packing.query.js";

/**
 * L'écran du fournil : ce que l'atelier a sous les yeux entre le scan et le
 * bouton.
 *
 * Il **répond toujours** quand la commande existe, même si le colisage est
 * impossible : le refus part avec la commande (`blockedReason`), pas à sa place.
 * Une erreur sèche ferait disparaître le numéro et le client — les deux seules
 * choses avec lesquelles on peut aller demander ce qui se passe.
 */
@QueryHandler(GetPackingQuery)
export class GetPackingHandler implements IQueryHandler<GetPackingQuery, OrderPackingView> {
  constructor(
    private readonly orders: OrderReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: GetPackingQuery): Promise<OrderPackingView> {
    const order = await this.orders.findForPacking(query.reference);
    if (order === null) {
      throw new OrderReferenceNotFoundError(query.reference);
    }
    return toPackingView(order, await this.staffAuthors.identify([order.readyBy]));
  }
}

/**
 * Projette l'état lu en vue de fournil, refus compris. `authors` nomme qui l'a
 * déclarée prête (plan `plan-l-auteur-est-la-fiche.md`, D3).
 */
export function toPackingView(order: PackingOrder, authors: StaffAuthors): OrderPackingView {
  return {
    orderId: order.orderId,
    reference: order.orderNumber,
    customerLabel: order.customerLabel,
    requestedFor:
      order.requestedDeliveryDate === null
        ? null
        : order.requestedDeliveryDate.toISOString().slice(0, 10),
    totalUnits: order.lines.reduce((sum, line) => sum + line.quantity, 0),
    lines: order.lines,
    readyAt: order.readyAt === null ? null : order.readyAt.toISOString(),
    readyBy: order.readyBy,
    readyByName: authors.nameOf(order.readyBy),
    blockedReason: packingBlocker(order),
  };
}
