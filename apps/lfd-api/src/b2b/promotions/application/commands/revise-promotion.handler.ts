import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { mustLoadPromotion } from "./promotion-support.js";
import { RevisePromotionCommand } from "./revise-promotion.command.js";

@CommandHandler(RevisePromotionCommand)
export class RevisePromotionHandler implements ICommandHandler<RevisePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: RevisePromotionCommand): Promise<void> {
    const now = this.clock.now();
    const revised = (await mustLoadPromotion(this.promotions, command.id)).revise(command.terms);
    await this.promotions.save(
      revised,
      promotionActOf(revised, "replaced", command.staffUserId, now, command.reason),
    );
  }
}
