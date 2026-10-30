import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { PromotionRepository } from "../../domain/ports/promotion.repository.js";
import { promotionActOf } from "../../domain/promotion-act.js";
import { Promotion } from "../../domain/promotion.js";
import { PosePromotionCommand } from "./pose-promotion.command.js";

/** Rend l'identifiant de la promotion posée ; le client relit ensuite. */
@CommandHandler(PosePromotionCommand)
export class PosePromotionHandler implements ICommandHandler<PosePromotionCommand, string> {
  constructor(
    private readonly promotions: PromotionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(command: PosePromotionCommand): Promise<string> {
    const now = this.clock.now();
    const promotion = Promotion.pose(this.ids.next(), command.terms, command.staffUserId, now);
    await this.promotions.save(
      promotion,
      promotionActOf(promotion, "posed", command.staffUserId, now, command.terms.reason),
    );
    return promotion.id;
  }
}
