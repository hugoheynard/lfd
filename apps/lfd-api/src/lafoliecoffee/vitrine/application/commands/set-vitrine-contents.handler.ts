import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { SetVitrineContentsCommand } from "./set-vitrine-contents.command.js";

/**
 * Change les cases d'un abonné. Décocher n'envoie AUCUN retrait (M1) : le
 * balayage cesse de comparer l'ensemble, l'agence relit si elle le veut.
 *
 * @sans-journal un réglage d'écran.
 */
@CommandHandler(SetVitrineContentsCommand)
export class SetVitrineContentsHandler implements ICommandHandler<SetVitrineContentsCommand> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetVitrineContentsCommand): Promise<void> {
    const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
    subscriber.chooseContents(command.contents, this.clock.now());
    await this.subscribers.save(subscriber);
  }
}
