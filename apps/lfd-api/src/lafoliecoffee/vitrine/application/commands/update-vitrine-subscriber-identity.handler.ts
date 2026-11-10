import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { UpdateVitrineSubscriberIdentityCommand } from "./update-vitrine-subscriber-identity.command.js";

/**
 * Renomme un abonné, pose sa description et son contact. Ni l'un ni l'autre ne part chez
 * l'agence : rien n'est envoyé, aucune empreinte ne bouge.
 *
 * @sans-journal un réglage d'écran.
 */
@CommandHandler(UpdateVitrineSubscriberIdentityCommand)
export class UpdateVitrineSubscriberIdentityHandler implements ICommandHandler<UpdateVitrineSubscriberIdentityCommand> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: UpdateVitrineSubscriberIdentityCommand): Promise<void> {
    const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
    const at = this.clock.now();
    subscriber.rename(command.name, at);
    subscriber.describe(command.description, at);
    subscriber.setContact(command.contactEmail, at);
    await this.subscribers.save(subscriber);
  }
}
