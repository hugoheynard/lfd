import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { SetVitrineSubscriberActiveCommand } from "./set-vitrine-subscriber-active.command.js";

/**
 * Coupe ou rallume. Coupé, rien ne lui part et le balayage ne le compare
 * plus ; rallumé, il reprend là où il en était — sans lever un échec, que
 * seul « tout renvoyer » lève.
 *
 * @sans-journal un réglage d'écran.
 */
@CommandHandler(SetVitrineSubscriberActiveCommand)
export class SetVitrineSubscriberActiveHandler implements ICommandHandler<SetVitrineSubscriberActiveCommand> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetVitrineSubscriberActiveCommand): Promise<void> {
    const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
    subscriber.setActive(command.active, this.clock.now());
    await this.subscribers.save(subscriber);
  }
}
