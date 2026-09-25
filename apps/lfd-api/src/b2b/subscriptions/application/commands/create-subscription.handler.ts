import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SaleOperations } from "../../../catalog/application/sale-operations.service.js";
import { OperationOnlyInSubscriptionError } from "../../domain/errors/subscription-errors.js";
import { Subscription } from "../../domain/entities/subscription.js";
import { SubscriptionCreatedEvent } from "../../domain/events/subscription-created.event.js";
import {
  type CreatedSubscription,
  SubscriptionRepository,
} from "../../domain/ports/subscription.repository.js";
import { IsoDate } from "../../domain/value-objects/iso-date.js";
import { SubscriptionLine } from "../../domain/value-objects/subscription-line.js";
import { CreateSubscriptionCommand } from "./create-subscription.command.js";

/**
 * Ouvre un panier récurrent. On construit l'**agrégat** (`Subscription.open`) qui
 * porte les invariants — au moins une ligne, acheminement cohérent (livraison ⇒
 * adresse, retrait ⇒ pas d'adresse), fin postérieure au début — puis on le confie
 * au port. Aucun prix ici : le gabarit ne facture rien tant que le planificateur
 * ne le déclenche pas.
 *
 * `@sans-journal` le fait existe déjà, et il n'a qu'un seul auteur :
 * `subscription.created`, écrit par l'abonné de la croissance sur la PERSONNE,
 * que le score des leads lit sous cette forme — même motif que
 * `CreateCompanyHandler`. Il reste best-effort, comme les faits de commande
 * (plan du journal, lot 1 ; décidé le 2026-09-19).
 */
@CommandHandler(CreateSubscriptionCommand)
export class CreateSubscriptionHandler implements ICommandHandler<
  CreateSubscriptionCommand,
  CreatedSubscription
> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly sale: SaleOperations,
  ) {}

  /** @throws {OperationOnlyInSubscriptionError} une ligne ne se vend que pendant une opération. */
  async execute(command: CreateSubscriptionCommand): Promise<CreatedSubscription> {
    const { payload } = command;
    // Avant l'agrégat : la règle dépend du catalogue, que l'abonnement ne lit
    // nulle part ailleurs (D6 du plan des opérations datées).
    const bound = await this.sale.operationOnlyAmong(payload.lines.map((line) => line.sku));
    if (bound.length > 0) {
      throw new OperationOnlyInSubscriptionError(bound);
    }
    const subscription = Subscription.open({
      placedByUserId: command.actorUserId,
      fromOrderId: payload.fromOrderId,
      recurrence: payload.recurrence,
      startDate: IsoDate.fromString(payload.startDate),
      endDate: payload.endDate === null ? null : IsoDate.fromString(payload.endDate),
      routing: {
        method: payload.fulfillmentMethod,
        deliveryAddress: payload.deliveryAddress,
        pickupAddressId: payload.pickupAddressId,
      },
      note: payload.note,
      lines: payload.lines.map((line) => SubscriptionLine.create(line.sku, line.quantity)),
    });
    const created = await this.subscriptions.create(subscription);
    // Signal « lead qualifié » : l'abonnement engage sur du récurrent.
    this.events.publish(
      new SubscriptionCreatedEvent(created.id, command.actorUserId, payload.recurrence),
    );
    return created;
  }
}
