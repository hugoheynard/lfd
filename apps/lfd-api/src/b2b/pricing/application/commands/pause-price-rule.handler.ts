import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ruleNamesOf } from "../rule-names.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PausePriceRuleCommand } from "./pause-price-rule.command.js";
import { actOf, mustLoad } from "./rule-lifecycle-support.js";

@CommandHandler(PausePriceRuleCommand)
export class PausePriceRuleHandler implements ICommandHandler<PausePriceRuleCommand, void> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly clock: Clock,
    private readonly catalog: ProductCatalogReader,
    private readonly companies: PricedCompanyNamer,
  ) {}

  async execute(command: PausePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoad(this.rules, command.id);
    await this.rules.update(
      rule.pause(command.staffUserId, now),
      actOf(
        rule,
        "paused",
        command.staffUserId,
        now,
        command.reason,
        await ruleNamesOf(rule.asPriceRule, this.catalog, this.companies),
      ),
    );
  }
}
