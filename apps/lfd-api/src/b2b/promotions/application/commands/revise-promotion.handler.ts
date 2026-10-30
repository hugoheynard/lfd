import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { mustLoadPromotion } from "./promotion-support.js";
import { PromotionWriteGuard } from "./promotion-write-guard.js";
import { RevisePromotionCommand } from "./revise-promotion.command.js";

@CommandHandler(RevisePromotionCommand)
export class RevisePromotionHandler implements ICommandHandler<RevisePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly guard: PromotionWriteGuard,
    private readonly clock: Clock,
  ) {}

  async execute(command: RevisePromotionCommand): Promise<void> {
    const now = this.clock.now();
    const promotion = await mustLoadPromotion(this.promotions, command.id);
    const revised = promotion.revise(command.terms);
    if (promotion.saysAlready(command.terms)) {
      // Reposée à l'identique : la surface reste jugée, rien ne s'écrit.
      this.guard.admitsTouch(command.surface, promotion);
      return;
    }
    await this.guard.admitsPlace(command.surface, promotion, revised);
    await this.promotions.save(
      revised,
      promotionActOf(revised, "replaced", command.staffUserId, now, command.reason),
    );
  }
}
