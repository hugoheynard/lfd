import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { mustLoadPromotion } from "./promotion-support.js";
import { ResumePromotionCommand } from "./resume-promotion.command.js";

@CommandHandler(ResumePromotionCommand)
export class ResumePromotionHandler implements ICommandHandler<ResumePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ResumePromotionCommand): Promise<void> {
    const now = this.clock.now();
    const resumed = (await mustLoadPromotion(this.promotions, command.id)).resume();
    await this.promotions.save(
      resumed,
      promotionActOf(resumed, "resumed", command.staffUserId, now, command.reason),
    );
  }
}
