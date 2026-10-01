import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { AudienceNotificationReader } from "../../domain/ports/staff-notifier.js";
import { MarkMyNotificationReadCommand } from "./mark-my-notification-read.command.js";

/**
 * Marquer lue une de mes notifications. Idempotent ; le premier lecteur de
 * l'audience fait foi. Une notice hors de mes droits n'est pas touchée — sans
 * erreur : on ne confirme pas qu'elle existe.
 *
 * @sans-journal comme la cloche partagée : un accusé de lecture, qui porte
 * déjà `readBy` et la date.
 */
@CommandHandler(MarkMyNotificationReadCommand)
export class MarkMyNotificationReadHandler implements ICommandHandler<
  MarkMyNotificationReadCommand,
  void
> {
  constructor(
    private readonly reader: AudienceNotificationReader,
    private readonly clock: Clock,
  ) {}

  async execute(command: MarkMyNotificationReadCommand): Promise<void> {
    const now = this.clock.now();
    if (command.id === null) {
      await this.reader.markAllRead(command.permissions, command.staffUserId, now);
      return;
    }
    await this.reader.markRead(command.id, command.permissions, command.staffUserId, now);
  }
}
