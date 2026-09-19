import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ruleNamesOf } from "../rule-names.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { ResumePriceRuleCommand } from "./resume-price-rule.command.js";
import { actOf, mustLoad } from "./rule-lifecycle-support.js";

@CommandHandler(ResumePriceRuleCommand)
export class ResumePriceRuleHandler implements ICommandHandler<ResumePriceRuleCommand, void> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly clock: Clock,
    private readonly catalog: ProductCatalogReader,
    private readonly companies: PricedCompanyNamer,
  ) {}

  /**
   * La reprise ne porte pas de motif : elle rétablit ce qui avait été décidé,
   * et l'écran n'a rien à demander pour ça.
   */
  async execute(command: ResumePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoad(this.rules, command.id);
    await this.rules.update(
      rule.resume(now),
      actOf(
        rule,
        "resumed",
        command.staffUserId,
        now,
        null,
        await ruleNamesOf(rule.asPriceRule, this.catalog, this.companies),
      ),
    );
  }
}
