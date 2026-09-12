import type { OrderHandoverView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { HandoverSubjectReader } from "../../channels/commerce/handover-subject.reader.js";
import { HandoverTokenNotFoundError } from "../../domain/errors/handover-errors.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
import { GetHandoverByOrderQuery } from "./get-handover-by-order.query.js";
import { toHandoverView } from "./get-handover.handler.js";

/**
 * **Le sac d'une commande ouverte depuis la file** — mêmes octets que l'écran
 * du scan, atteints par une autre clé.
 *
 * ## Pourquoi cette lecture existe
 *
 * 🔴 Le rail de la file lisait la commande par `admin/orders/:id`, c'est-à-dire
 * l'`OrderView` du CLIENT : prix unitaires, TVA, totaux, et la trace de
 * négociation étage par étage. Sur un poste de comptoir, avec quelqu'un en
 * face. Les trois surfaces de remise promettent « aucun montant » — deux le
 * tenaient par leur forme, la troisième par la seule discrétion d'un gabarit.
 *
 * La règle est redevenue **structurelle** : ce qui n'est pas dans
 * `OrderHandoverView` ne traverse pas le réseau, et aucun `@for` de trop ne
 * peut l'afficher.
 *
 * ## Et le refus, comme partout ici
 *
 * Il part AVEC la commande (`blockedReason`) plutôt qu'à sa place : une erreur
 * sèche ferait disparaître de l'écran le numéro et le client, les deux seules
 * choses avec lesquelles on décroche un téléphone.
 */
@QueryHandler(GetHandoverByOrderQuery)
export class GetHandoverByOrderHandler implements IQueryHandler<
  GetHandoverByOrderQuery,
  OrderHandoverView
> {
  constructor(
    private readonly subjects: HandoverSubjectReader,
    private readonly handovers: OrderHandoverRepository,
  ) {}

  async execute(query: GetHandoverByOrderQuery): Promise<OrderHandoverView> {
    const subject = await this.subjects.byOrderId(query.orderId);
    if (subject === null) {
      // La même erreur que le jeton introuvable : du point de vue du comptoir
      // c'est le même fait — « cette commande n'existe pas ici » — et lui en
      // donner deux formulations ne l'aiderait pas.
      throw new HandoverTokenNotFoundError();
    }
    return toHandoverView(subject, await this.handovers.findByOrderId(subject.orderId));
  }
}
