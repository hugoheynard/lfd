import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ruleNamesOf } from "../rule-names.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { RenamePriceRuleCommand } from "./rename-price-rule.command.js";
import { actOf, mustLoad } from "./rule-lifecycle-support.js";

/**
 * **Renommer** — la seule modification qu'une règle accepte.
 *
 * L'acte porte le kind `renamed` et non `replaced` : aucun prix n'a bougé, et
 * les confondre ferait chercher un changement tarifaire là où il n'y en a pas
 * eu, le jour où on relit le journal pour comprendre une facture.
 *
 * Le résumé figé décrit la règle **d'avant** — comme partout ailleurs : c'est ce
 * qu'on a renommé qu'on veut relire, pas le résultat.
 */
@CommandHandler(RenamePriceRuleCommand)
export class RenamePriceRuleHandler implements ICommandHandler<RenamePriceRuleCommand, void> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly clock: Clock,
    private readonly catalog: ProductCatalogReader,
    private readonly companies: PricedCompanyNamer,
  ) {}

  async execute(command: RenamePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoad(this.rules, command.id);
    const renamed = rule.rename(command.label);
    await this.rules.rename(
      renamed,
      actOf(
        rule,
        "renamed",
        command.staffUserId,
        now,
        null,
        await ruleNamesOf(rule.asPriceRule, this.catalog, this.companies),
        // Le nom du sujet est le NOUVEAU : c'est celui qu'elle porte depuis.
        renamed.label,
      ),
    );
  }
}
