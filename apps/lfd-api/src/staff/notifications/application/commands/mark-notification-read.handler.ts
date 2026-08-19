import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { StaffNotificationReader } from "../../domain/ports/staff-notifier.js";
import { MarkNotificationReadCommand } from "./mark-notification-read.command.js";

/** Marquer lu. Idempotent, et **le premier lecteur fait foi**. */
@CommandHandler(MarkNotificationReadCommand)
export class MarkNotificationReadHandler implements ICommandHandler<
  MarkNotificationReadCommand,
  void
> {
  constructor(
    private readonly reader: StaffNotificationReader,
    private readonly clock: Clock,
  ) {}

  async execute(command: MarkNotificationReadCommand): Promise<void> {
    const now = this.clock.now();
    if (command.id === null) {
      await this.reader.markAllRead(command.staffSub, now);
      return;
    }
    await this.reader.markRead(command.id, command.staffSub, now);
  }
}
