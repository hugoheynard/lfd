import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PricedPeriodIsSealedError } from "../../domain/pricing-errors.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { Clock } from "../../../../platform/time/clock.js";
import { citedAudience, describeRule } from "../../domain/pricing-act.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ruleNamesOf } from "../rule-names.js";
import { CreatePriceRuleCommand } from "./create-price-rule.command.js";

/**
 * Poser une règle — le premier des quatre gestes du staff sur la tarification,
 * avec `SetPriceFloorHandler`, `ConfirmPriceFloorHandler` et
 * `ArchivePriceFloorHandler`.
 *
 * Aucun handler ne décide d'un refus : les refus vivent dans les agrégats, où le
 * prochain appelant — un import, un seed, le planificateur des paniers
 * récurrents — les trouvera aussi. Ici il n'y a que le cycle : fabriquer
 * l'agrégat, le rendre au port.
 */
@CommandHandler(CreatePriceRuleCommand)
export class CreatePriceRuleHandler implements ICommandHandler<CreatePriceRuleCommand, string> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly priced: PricedDecisionsReader,
    private readonly catalog: ProductCatalogReader,
    private readonly companies: PricedCompanyNamer,
  ) {}

  /** Rend l'identifiant posé : l'écran en a besoin pour cibler ses gestes. */
  async execute(command: CreatePriceRuleCommand): Promise<string> {
    const rule = PricingRule.create(this.ids.next(), command.draft, command.staffUserId);
    // 🔴 **Le recouvrement que la base ne voit pas.** La contrainte d'exclusion
    // est PARTIELLE (`WHERE archived_at IS NULL`) : elle refuse le chevauchement
    // avec une règle en cours, jamais avec une rangé. Depuis que clore borne
    // la fenêtre (R17), une règle rangé garde sa place dans le passé, et poser
    // par-dessus donnerait deux décisions à la même date.
    //
    // ⚠️ Le refus vise « **a facturé** », pas « est passé ». Une règle posé
    // puis rangé dix minutes plus tard n'a rien facturé : le reposer est le
    // geste ordinaire « je me suis trompé, je recommence ».
    const sealed = await this.rules.archivedOverlapping(rule);
    if (sealed.length > 0 && (await this.priced.anyPriced(sealed))) {
      throw new PricedPeriodIsSealedError("règle", rule.toPersistence().validFrom);
    }

    const names = await ruleNamesOf(rule.asPriceRule, this.catalog, this.companies);
    await this.rules.save(rule, {
      subjectType: "rule",
      subjectId: rule.id,
      kind: "posed",
      actor: command.staffUserId,
      at: this.clock.now(),
      reason: null,
      summary: describeRule(rule.asPriceRule, names),
      subjectLabel: rule.label,
      ...citedAudience(rule.asPriceRule, names),
    });
    return rule.id;
  }
}
