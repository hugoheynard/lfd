import { PromotionsSourceReader } from "../../../promotions/domain/ports/promotions-source.reader.js";
import { assertRuleEditorOpen } from "./rule-lifecycle-support.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import {
  ensureNotYetCarried,
  ruleCarryKey,
  type DecisionCarry,
} from "../../domain/entities/decision-carry-over.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { describeRule, ruleCitations } from "../../domain/pricing-act.js";
import { CarriedDecisionNotFoundError } from "../../domain/pricing-errors.js";
import { CarriedDecisionsReader } from "../../domain/ports/carried-decisions.reader.js";
import { CarryOverLock } from "../../domain/ports/carry-over.lock.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { ReservedElsewhereReader } from "../../domain/ports/reserved-elsewhere.reader.js";
import { SaleReferenceLineageReader } from "../../domain/ports/sale-reference-lineage.reader.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { clienteleOfAudience } from "../../domain/services/sale-references.js";
import { ruleNamesOf } from "../rule-names.js";
import { CarryOverPriceRuleCommand } from "./carry-over-price-rule.command.js";
import { assertDetachedFrom } from "./decision-carry-over-support.js";
import { assertNotReservedElsewhere, assertOnSale } from "./sale-reference-support.js";

/**
 * **Reporter une règle de prix** sur la référence née d'un détachement
 * (`plan-report-apres-detachement.md`, R1) : poser une règle NEUVE par le
 * chemin de la pose — agrégat, contrainte d'exclusion, L5, journal —, jamais
 * réécrire l'ancienne.
 *
 * Verrou, relecture de l'ancienne, « déjà reportée » et écriture dans la MÊME
 * unité de travail : deux reports simultanés ne passent pas tous les deux.
 */
@CommandHandler(CarryOverPriceRuleCommand)
export class CarryOverPriceRuleHandler implements ICommandHandler<
  CarryOverPriceRuleCommand,
  string
> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly lineage: SaleReferenceLineageReader,
    private readonly references: SaleReferenceReader,
    private readonly reservations: ReservedElsewhereReader,
    private readonly carried: CarriedDecisionsReader,
    private readonly lock: CarryOverLock,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly catalog: ProductCatalogReader,
    private readonly companies: PricedCompanyNamer,
    private readonly sources: PromotionsSourceReader,
  ) {}

  /**
   * Rend l'identifiant de la règle posée.
   *
   * @throws {NotDetachedFromError} la nouvelle référence n'est pas née de l'ancienne.
   * @throws {CarriedDecisionNotFoundError} aucune règle de cet identifiant.
   * @throws {SaleReferenceNotOnSaleError} la nouvelle ne se vend pas à l'audience de la règle.
   * @throws {ReservedArticleRefusedError} règle d'une société, article réservé à une autre.
   * @throws {DecisionAlreadyCarriedError} déjà reportée pour la même audience.
   * @throws les refus de `PricingRule.carriedFrom`, et `OverlappingPriceRuleError`.
   */
  async execute(command: CarryOverPriceRuleCommand): Promise<string> {
    const carry: DecisionCarry = { fromSku: command.fromSku, toSku: command.toSku };
    await assertDetachedFrom(this.lineage, carry);
    const now = this.clock.now();
    const id = this.ids.next();
    await this.uow.run(async () => {
      await this.lock.acquire("price_rule", carry.toSku);
      const source = await this.rules.load(command.ruleId);
      if (source === null) {
        throw new CarriedDecisionNotFoundError("price_rule", command.ruleId);
      }
      await assertRuleEditorOpen(source.asPriceRule.stage, this.sources);
      const rule = PricingRule.carriedFrom(id, source, carry, command.staffUserId, now);
      await this.guard(rule, carry, now);
      const names = await ruleNamesOf(rule.asPriceRule, this.catalog, this.companies);
      await this.rules.save(rule, {
        subjectType: "rule",
        subjectId: rule.id,
        kind: "posed",
        actor: command.staffUserId,
        at: now,
        reason: command.reason.trim(),
        summary: describeRule(rule.asPriceRule, names),
        subjectLabel: rule.label,
        ...ruleCitations(rule.asPriceRule, names),
      });
    });
    return id;
  }

  /** Ce que la nouvelle référence doit accepter : la vente (L5), la réservation, l'unicité du report. */
  private async guard(rule: PricingRule, carry: DecisionCarry, now: Date): Promise<void> {
    const { audience } = rule.asPriceRule;
    await assertOnSale(this.references, [carry.toSku], clienteleOfAudience(audience));
    if (audience.type === "company" && audience.id !== null) {
      await assertNotReservedElsewhere(this.reservations, audience.id, [carry.toSku]);
    }
    ensureNotYetCarried(
      "price_rule",
      carry,
      ruleCarryKey(rule.asPriceRule),
      await this.carried.carriedAudiences("price_rule", carry.fromSku, carry.toSku, now),
    );
  }
}
