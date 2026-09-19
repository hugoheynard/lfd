import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { ArchivePriceRuleCommand } from "./archive-price-rule.command.js";
import { actOf, mustLoad } from "./rule-lifecycle-support.js";

@CommandHandler(ArchivePriceRuleCommand)
export class ArchivePriceRuleHandler implements ICommandHandler<ArchivePriceRuleCommand, void> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchivePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoad(this.rules, command.id);
    await this.rules.update(
      rule.archive(command.staffUserId, now, command.reason),
      actOf(rule, "archived", command.staffUserId, now, command.reason),
    );
  }
}
