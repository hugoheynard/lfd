import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PausePriceRuleCommand } from "./pause-price-rule.command.js";
import { actOf, mustLoad } from "./rule-lifecycle-support.js";

@CommandHandler(PausePriceRuleCommand)
export class PausePriceRuleHandler implements ICommandHandler<PausePriceRuleCommand, void> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: PausePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoad(this.rules, command.id);
    await this.rules.update(
      rule.pause(command.staffUserId, now),
      actOf(rule, "paused", command.staffUserId, now, command.reason),
    );
  }
}
