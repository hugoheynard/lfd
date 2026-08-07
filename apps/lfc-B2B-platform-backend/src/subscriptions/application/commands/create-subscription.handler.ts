import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Subscription } from "../../domain/entities/subscription.js";
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
 */
@CommandHandler(CreateSubscriptionCommand)
export class CreateSubscriptionHandler implements ICommandHandler<
  CreateSubscriptionCommand,
  CreatedSubscription
> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(command: CreateSubscriptionCommand): Promise<CreatedSubscription> {
    const { payload } = command;
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
    return this.subscriptions.create(subscription);
  }
}
