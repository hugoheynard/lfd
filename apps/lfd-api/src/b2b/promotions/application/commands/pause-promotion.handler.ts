import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { PausePromotionCommand } from "./pause-promotion.command.js";
import { mustLoadPromotion } from "./promotion-support.js";

@CommandHandler(PausePromotionCommand)
export class PausePromotionHandler implements ICommandHandler<PausePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: PausePromotionCommand): Promise<void> {
    const now = this.clock.now();
    const promotion = await mustLoadPromotion(this.promotions, command.id);
    const paused = promotion.pause(command.staffUserId, now);
    await this.promotions.save(
      paused,
      promotionActOf(paused, "paused", command.staffUserId, now, command.reason),
    );
  }
}
