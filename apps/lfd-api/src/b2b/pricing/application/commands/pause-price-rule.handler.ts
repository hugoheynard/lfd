import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ruleNamesOf } from "../rule-names.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PausePriceRuleCommand } from "./pause-price-rule.command.js";
import { actOf, mustLoadEditable } from "./rule-lifecycle-support.js";
import { PromotionsSourceReader } from "../../../promotions/domain/ports/promotions-source.reader.js";

@CommandHandler(PausePriceRuleCommand)
export class PausePriceRuleHandler implements ICommandHandler<PausePriceRuleCommand, void> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly clock: Clock,
    private readonly catalog: ProductCatalogReader,
    private readonly companies: PricedCompanyNamer,
    private readonly sources: PromotionsSourceReader,
  ) {}

  async execute(command: PausePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoadEditable(this.rules, this.sources, command.id);
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
