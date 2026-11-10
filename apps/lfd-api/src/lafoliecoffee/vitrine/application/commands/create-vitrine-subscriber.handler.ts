import type { VitrineCredentialsView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { VitrineSubscriberRepository } from "../../domain/ports/vitrine-subscriber.repository.js";
import { VitrineSubscriber } from "../../domain/vitrine-subscriber.js";
import { VitrineCredentialsMint } from "../services/vitrine-credentials.js";
import { CreateVitrineSubscriberCommand } from "./create-vitrine-subscriber.command.js";

/**
 * Déclare un abonné, allumé, avec un secret et une clé neufs.
 *
 * ⚠️ Rend le secret et la clé EN CLAIR, contre la règle « une commande rend
 * un id » : c'est la seule fois qu'ils existent en clair — la base range le
 * secret scellé et la clé hachée, et une lecture qui les rendrait les
 * montrerait plus d'une fois.
 *
 * @sans-journal un réglage d'écran ; ce qui part chez l'agence se lit au
 * journal des envois.
 */
@CommandHandler(CreateVitrineSubscriberCommand)
export class CreateVitrineSubscriberHandler implements ICommandHandler<
  CreateVitrineSubscriberCommand,
  VitrineCredentialsView
> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly mint: VitrineCredentialsMint,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: CreateVitrineSubscriberCommand): Promise<VitrineCredentialsView> {
    const credentials = this.mint.mint();
    const subscriber = VitrineSubscriber.declare({
      id: this.ids.next(),
      name: command.name,
      description: command.description,
      contactEmail: command.contactEmail,
      endpointUrl: command.endpointUrl,
      contents: command.contents,
      credentials: credentials.stored,
      at: this.clock.now(),
    });
    await this.subscribers.save(subscriber);
    return {
      id: subscriber.id,
      signingSecret: credentials.signingSecret,
      readKey: credentials.readKey,
    };
  }
}
