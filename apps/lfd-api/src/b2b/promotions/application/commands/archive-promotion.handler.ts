import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { ArchivePromotionCommand } from "./archive-promotion.command.js";
import { mustLoadPromotion } from "./promotion-support.js";
import { PromotionWriteGuard } from "./promotion-write-guard.js";

@CommandHandler(ArchivePromotionCommand)
export class ArchivePromotionHandler implements ICommandHandler<ArchivePromotionCommand, void> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly guard: PromotionWriteGuard,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchivePromotionCommand): Promise<void> {
    const now = this.clock.now();
    const promotion = await mustLoadPromotion(this.promotions, command.id);
    this.guard.admitsTouch(command.surface, promotion);
    const archived = promotion.archive(command.staffUserId, now, command.reason);
    await this.promotions.save(
      archived,
      promotionActOf(archived, "archived", command.staffUserId, now, command.reason),
    );
  }
}
