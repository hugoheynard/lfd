import type { VitrineCredentialsView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { shownOnceReplay } from "../../../../platform/intent/shown-once-replay.js";
import { VitrineCredentialsAlreadyShownError } from "../../domain/errors/vitrine-errors.js";
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
 * **Une fois par intention**, sans garder le secret : l'intention ne retient
 * que l'id de l'abonné, et un rejeu de la même clé reçoit
 * `VitrineCredentialsAlreadyShownError` (409), jamais un second abonné.
 *
 * @sans-journal un réglage d'écran ; ce qui part chez l'agence se lit au
 * journal des envois.
 */
/** Le nom stable du geste, dans le registre des intentions. */
const CREATE_GESTURE = "vitrine.create-subscriber";

/** Seul l'id de l'abonné est gardé, jamais son secret ni sa clé. */
const CREATED_REPLAY = shownOnceReplay<VitrineCredentialsView>(
  (shown) => ({ id: shown.id }),
  () => new VitrineCredentialsAlreadyShownError("create"),
);

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
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /** @throws {VitrineCredentialsAlreadyShownError} la même clé a déjà déclaré un abonné. */
  execute(command: CreateVitrineSubscriberCommand): Promise<VitrineCredentialsView> {
    const { staffUserId, intentKey, ...settings } = command;
    return this.intents.runSealed(
      {
        actorId: staffUserId,
        key: intentKey,
        gesture: CREATE_GESTURE,
        subject: intentSubject("vitrine-subscriber", settings),
      },
      CREATED_REPLAY,
      (seal) => this.declare(command, seal),
    );
  }

  private async declare(
    command: CreateVitrineSubscriberCommand,
    seal: (shown: VitrineCredentialsView) => Promise<void>,
  ): Promise<VitrineCredentialsView> {
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
    const shown = {
      id: subscriber.id,
      signingSecret: credentials.signingSecret,
      readKey: credentials.readKey,
    };
    await this.uow.run(async () => {
      await this.subscribers.save(subscriber);
      await seal(shown);
    });
    return shown;
  }
}
