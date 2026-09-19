import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { PauseVolumeLadderCommand } from "./pause-volume-ladder.command.js";
import { ladderAct, mustLoadLadder } from "./volume-ladder-support.js";

@CommandHandler(PauseVolumeLadderCommand)
export class PauseVolumeLadderHandler implements ICommandHandler<PauseVolumeLadderCommand, void> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: PauseVolumeLadderCommand): Promise<void> {
    const now = this.clock.now();
    const ladder = await mustLoadLadder(this.ladders, command.id);
    await this.ladders.update(
      ladder.pause(command.staffUserId, now),
      ladderAct(ladder, "paused", command.staffUserId, now, command.reason),
    );
  }
}
