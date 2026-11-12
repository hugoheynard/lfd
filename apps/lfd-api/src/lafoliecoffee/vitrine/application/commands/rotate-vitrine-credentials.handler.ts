import type { VitrineCredentialsView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { shownOnceReplay } from "../../../../platform/intent/shown-once-replay.js";
import { VitrineCredentialsAlreadyShownError } from "../../domain/errors/vitrine-errors.js";
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
 * Une fois par intention, sans garder le secret : un rejeu de la même clé
 * reçoit `VitrineCredentialsAlreadyShownError` (409), sans seconde rotation.
 *
 * @sans-journal un réglage d'écran.
 */
/** Le nom stable du geste, dans le registre des intentions. */
const ROTATE_GESTURE = "vitrine.rotate-credentials";

/** Seul l'id de l'abonné est gardé, jamais son secret ni sa clé. */
const ROTATED_REPLAY = shownOnceReplay<VitrineCredentialsView>(
  (shown) => ({ id: shown.id }),
  () => new VitrineCredentialsAlreadyShownError("rotate"),
);

@CommandHandler(RotateVitrineCredentialsCommand)
export class RotateVitrineCredentialsHandler implements ICommandHandler<
  RotateVitrineCredentialsCommand,
  VitrineCredentialsView
> {
  constructor(
    private readonly subscribers: VitrineSubscriberRepository,
    private readonly mint: VitrineCredentialsMint,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /** @throws {VitrineCredentialsAlreadyShownError} la même clé a déjà fait tourner les accès. */
  execute(command: RotateVitrineCredentialsCommand): Promise<VitrineCredentialsView> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ROTATE_GESTURE,
        subject: command.subscriberId,
      },
      ROTATED_REPLAY,
      (seal) => this.rotate(command, seal),
    );
  }

  private async rotate(
    command: RotateVitrineCredentialsCommand,
    seal: (shown: VitrineCredentialsView) => Promise<void>,
  ): Promise<VitrineCredentialsView> {
    const subscriber = await loadVitrineSubscriber(this.subscribers, command.subscriberId);
    const credentials = this.mint.mint();
    subscriber.rotate(credentials.stored, this.clock.now());
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
