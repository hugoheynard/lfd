import { assertRuleEditorOpen } from "./rule-lifecycle-support.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PricedPeriodIsSealedError } from "../../domain/pricing-errors.js";
import { PricedDecisionsReader } from "../../domain/ports/priced-decisions.reader.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { Clock } from "../../../../platform/time/clock.js";
import { describeRule, ruleCitations } from "../../domain/pricing-act.js";
import { PricedCompanyNamer } from "../../domain/ports/priced-company-namer.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { ruleNamesOf } from "../rule-names.js";
import { SaleReferenceReader } from "../../domain/ports/sale-reference.reader.js";
import { clienteleOfAudience, saleReferenceOf } from "../../domain/services/sale-references.js";
import { assertOnSale } from "./sale-reference-support.js";
import { CreatePriceRuleCommand } from "./create-price-rule.command.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import type { PricingAct } from "../../domain/pricing-act.js";

/** Le nom stable du geste, dans le registre des intentions. */
const CREATE_RULE_GESTURE = "pricing.create-price-rule";

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
    private readonly references: SaleReferenceReader,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  /**
   * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
   * scellée dans la transaction de l'écriture ; un double clic rend ce qui a
   * déjà été posé, sans rien poser une seconde fois. Le sujet est l'empreinte
   * de la saisie : la même clé sur une autre saisie est refusée (409).
   *
   * @throws {GestureInFlightError} la même clé est encore en vol.
   * @throws {IntentKeyReusedError} la clé a servi pour une autre saisie.
   */
  execute(command: CreatePriceRuleCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: CREATE_RULE_GESTURE,
        subject: intentSubject("price-rule", command.draft),
      },
      CREATED_ID_REPLAY,
      (seal) => this.create(command, seal),
    );
  }

  private async create(
    command: CreatePriceRuleCommand,
    seal: (id: string) => Promise<void>,
  ): Promise<string> {
    // Après la bascule, l'étage promotion se pose dans l'écran Promotions (L8).
    assertRuleEditorOpen(command.draft.stage);
    const rule = PricingRule.create(this.ids.next(), command.draft, command.staffUserId);
    // Une règle sur une référence hors vente ne mordrait jamais (L5).
    await assertOnSale(
      this.references,
      [saleReferenceOf(command.draft.scope)],
      clienteleOfAudience(command.draft.audience),
    );
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
    const act: PricingAct = {
      subjectType: "rule",
      subjectId: rule.id,
      kind: "posed",
      actor: command.staffUserId,
      at: this.clock.now(),
      reason: null,
      summary: describeRule(rule.asPriceRule, names),
      subjectLabel: rule.label,
      ...ruleCitations(rule.asPriceRule, names),
    };
    await this.uow.run(async () => {
      await this.rules.save(rule, act);
      await seal(rule.id);
    });
    return rule.id;
  }
}
