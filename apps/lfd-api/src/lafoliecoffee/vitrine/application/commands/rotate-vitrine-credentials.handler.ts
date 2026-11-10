import type { VitrineCredentialsView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { VitrineCredentialsMint } from "../services/vitrine-credentials.js";
import { loadVitrineSubscriber } from "../vitrine-support.js";
import { RotateVitrineCredentialsCommand } from "./rotate-vitrine-credentials.command.js";

/**
 * Un secret et une clé neufs : les anciens cessent de valoir à l'instant (une
 * livraison qui part ensuite est signée du neuf). Le geste de sortie d'une
 * rotation de `FIELD_ENCRYPTION_KEY`, qui rend l'ancien secret illisible.
 *
 * Rend le secret et la clé en clair — cf. `CreateVitrineSubscriberHandler`.
 *
 * @sans-journal un réglage d'écran.
 */
@CommandHandler(RotateVitrineCredentialsCommand)
export class RotateVitrineCredentialsHandler implements ICommandHandler<
  RotateVitrineCredentialsCommand,
  VitrineCredentialsView
> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly mint: VitrineCredentialsMint,
    private readonly clock: Clock,
  ) {}

  async execute(command: RotateVitrineCredentialsCommand): Promise<VitrineCredentialsView> {
    const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
    const credentials = this.mint.mint();
    subscriber.rotate(credentials.stored, this.clock.now());
    await this.subscribers.save(subscriber);
    return {
      id: subscriber.id,
      signingSecret: credentials.signingSecret,
      readKey: credentials.readKey,
    };
  }
}
