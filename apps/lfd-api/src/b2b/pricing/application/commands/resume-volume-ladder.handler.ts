import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { VolumeLadderRepository } from "../../domain/ports/volume-ladder.repository.js";
import { ResumeVolumeLadderCommand } from "./resume-volume-ladder.command.js";
import { ladderAct, mustLoadLadder } from "./volume-ladder-support.js";

@CommandHandler(ResumeVolumeLadderCommand)
export class ResumeVolumeLadderHandler implements ICommandHandler<ResumeVolumeLadderCommand, void> {
  constructor(
    private readonly ladders: VolumeLadderRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ResumeVolumeLadderCommand): Promise<void> {
    const now = this.clock.now();
    const ladder = await mustLoadLadder(this.ladders, command.id);
    await this.ladders.update(
      ladder.resume(),
      ladderAct(ladder, "resumed", command.staffUserId, now, null),
    );
  }
}
