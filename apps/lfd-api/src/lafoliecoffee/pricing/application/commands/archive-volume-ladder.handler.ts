import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { ArchiveVolumeLadderCommand } from "./archive-volume-ladder.command.js";
import { ladderAct, mustLoadLadder } from "./volume-ladder-support.js";

@CommandHandler(ArchiveVolumeLadderCommand)
export class ArchiveVolumeLadderHandler implements ICommandHandler<
  ArchiveVolumeLadderCommand,
  void
> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveVolumeLadderCommand): Promise<void> {
    const now = this.clock.now();
    const ladder = await mustLoadLadder(this.ladders, command.id);
    await this.ladders.update(
      ladder.archive(command.staffUserId, now, command.reason),
      ladderAct(ladder, "archived", command.staffUserId, now, command.reason),
    );
  }
}
