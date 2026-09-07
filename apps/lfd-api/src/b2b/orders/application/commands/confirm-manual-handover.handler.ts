import type { OrderHandoverView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  HandoverRefusedError,
  OrderReferenceNotFoundError,
} from "../../domain/errors/order-errors.js";
import { OrderHandedOverEvent } from "../../domain/events/order-handed-over.event.js";
import { OrderReader } from "../../domain/ports/order.reader.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";
import { handoverBlocker } from "../../domain/services/handover.js";
import { toHandoverView } from "../queries/get-handover.handler.js";
import { ConfirmManualHandoverCommand } from "./confirm-manual-handover.command.js";

/**
 * **La remise saisie à la main** — le chemin de secours, et la raison pour
 * laquelle la règle de l'autoscan tient.
 *
 * ## Pourquoi elle existe
 *
 * Le code de remise voyage dans le courriel du destinataire, et jamais sur un
 * papier : le bon d'une livraison est dans le carton, où un coursier scannerait
 * son propre colis. Mais le destinataire n'a pas toujours son courriel — un
 * magasinier, quelqu'un d'autre à l'accueil, un téléphone déchargé.
 *
 * Sans porte de secours, ce jour-là quelqu'un demande d'imprimer le code « juste
 * pour les livraisons difficiles ». La règle saute par la porte de service. Elle
 * ne tient que parce que **le cas difficile a déjà sa réponse**.
 *
 * ## Ce qui la distingue du scan, et pourquoi ça compte
 *
 * Elle grave `handedOverVia: "manual"`. Une remise saisie n'a eu qu'**une**
 * partie : personne n'a présenté quoi que ce soit. C'est une attestation plus
 * faible, et la présenter comme un scan la rendrait **fausse** plutôt que
 * faible. Une attestation faible et honnête vaut mieux qu'une attestation forte
 * et fausse — à condition de pouvoir les distinguer.
 *
 * ## Ce qu'elle partage avec le scan
 *
 * Tout le reste : la même règle d'état (`handoverBlocker`), la même écriture
 * conditionnée en base, la même publication du même fait, le même auteur pris
 * sur la session. Deux portes, un seul comportement — c'est ce qui évite qu'un
 * champ ajouté un jour ne soit posé que d'un côté.
 */
@CommandHandler(ConfirmManualHandoverCommand)
export class ConfirmManualHandoverHandler implements ICommandHandler<
  ConfirmManualHandoverCommand,
  OrderHandoverView
> {
  constructor(
    private readonly orders: OrderReader,
    private readonly repository: OrderRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: ConfirmManualHandoverCommand): Promise<OrderHandoverView> {
    const order = await this.orders.findHandoverByReference(command.reference);
    if (order === null) {
      throw new OrderReferenceNotFoundError(command.reference);
    }
    const blocker = handoverBlocker(order);
    if (blocker !== null) {
      throw new HandoverRefusedError(blocker);
    }

    const at = this.clock.now();
    const won = await this.repository.markHandedOverManually(
      command.reference,
      at,
      command.staffSubject,
    );
    if (!won) {
      // Perdu la course : quelqu'un a scanné, ou saisi, entre notre lecture et
      // notre écriture. On ne réécrit rien — l'attestation de l'autre est la
      // seule vraie, et elle est peut-être la FORTE.
      throw new HandoverRefusedError("Cette commande vient d'être remise ailleurs.");
    }

    this.events.publish(
      new OrderHandedOverEvent(
        order.orderId,
        order.orderNumber,
        order.placedByUserId,
        command.staffSubject,
        at,
        "manual",
      ),
    );

    return toHandoverView({
      ...order,
      status: "fulfilled",
      handedOverAt: at,
      handedOverBy: command.staffSubject,
      handedOverVia: "manual",
    });
  }
}
