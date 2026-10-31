import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { PromotionFulfillmentNames } from "./promotion-fulfillment-names.js";
import { mustLoadPromotion } from "./promotion-support.js";
import { PromotionWriteGuard } from "./promotion-write-guard.js";
import { ResumePromotionCommand } from "./resume-promotion.command.js";

@CommandHandler(ResumePromotionCommand)
export class ResumePromotionHandler implements ICommandHandler<ResumePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly guard: PromotionWriteGuard,
    private readonly names: PromotionFulfillmentNames,
    private readonly clock: Clock,
  ) {}

  async execute(command: ResumePromotionCommand): Promise<void> {
    const now = this.clock.now();
    const promotion = await mustLoadPromotion(this.promotions, command.id);
    const resumed = promotion.resume();
    await this.guard.admitsPlace(resumed);
    const names = await this.names.known(resumed.terms.fulfillment);
    await this.promotions.save(
      resumed,
      promotionActOf(resumed, "resumed", command.staffUserId, now, command.reason, names),
    );
  }
}
