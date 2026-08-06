import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  type CreatedSubscription,
  SubscriptionRepository,
} from "../../domain/ports/subscription.repository.js";
import { CreateSubscriptionCommand } from "./create-subscription.command.js";

/**
 * Enregistre un panier récurrent. Aucun prix résolu ici (le gabarit ne facture
 * rien tant que le planificateur ne le déclenche pas) : on fige juste l'intention.
 * L'acheminement retombe sur son mode : livraison ⇒ adresse figée, retrait ⇒
 * point choisi ; l'autre est mis à `null` pour ne pas garder de résidu.
 */
@CommandHandler(CreateSubscriptionCommand)
export class CreateSubscriptionHandler implements ICommandHandler<
  CreateSubscriptionCommand,
  CreatedSubscription
> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(command: CreateSubscriptionCommand): Promise<CreatedSubscription> {
    const { payload } = command;
    const isDelivery = payload.fulfillmentMethod === "delivery";
    return this.subscriptions.create({
      placedByUserId: command.actorUserId,
      fromOrderId: payload.fromOrderId,
      recurrence: payload.recurrence,
      startDate: new Date(payload.startDate),
      endDate: payload.endDate === null ? null : new Date(payload.endDate),
      fulfillmentMethod: payload.fulfillmentMethod,
      deliveryAddress: isDelivery ? payload.deliveryAddress : null,
      pickupAddressId: isDelivery ? null : payload.pickupAddressId,
      note: payload.note,
      lines: payload.lines.map((line) => ({ sku: line.sku, quantity: line.quantity })),
    });
  }
}
