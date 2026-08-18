import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { ApplyPriceTemplatePayload, SavePriceTemplatePayload } from "@lfd/contracts";

import { Clock } from "../../../infra/time/clock.js";
import { IdGenerator } from "../../../infra/id/id-generator.js";
import { PriceTemplate } from "../../domain/entities/price-template.js";
import { PriceTemplateRepository } from "../../domain/ports/price-template.repository.js";
import { PricingRule } from "../../domain/entities/pricing-rule.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PriceTemplateNotFoundError } from "../../domain/pricing-errors.js";
import { describeRule } from "../../domain/pricing-act.js";
import { templateToRules } from "../../domain/services/template-to-rules.js";

/** Composer un gabarit, ou le réviser s'il en porte déjà un identifiant. */
export class SavePriceTemplateCommand {
  constructor(
    readonly id: string | null,
    readonly payload: SavePriceTemplatePayload,
    readonly staffSub: string,
  ) {}
}

/** **Poser** un gabarit chez un client : il devient des règles de mercuriale. */
export class ApplyPriceTemplateCommand {
  constructor(
    readonly id: string,
    readonly payload: ApplyPriceTemplatePayload,
    readonly staffSub: string,
  ) {}
}

@CommandHandler(SavePriceTemplateCommand)
export class SavePriceTemplateHandler implements ICommandHandler<SavePriceTemplateCommand, string> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: SavePriceTemplateCommand): Promise<string> {
    const draft = {
      kind: command.payload.kind,
      label: command.payload.label,
      lines: command.payload.lines.map((line) => ({
        sku: line.sku,
        tiers: line.tiers,
        // Recopié tel quel : le volume prévu accompagne la grille, il ne change
        // aucun prix — `templateToRules` ne le lit même pas.
        plannedVolume: line.plannedVolume,
      })),
    };
    const template = await this.resolve(command.id, draft, command.staffSub);
    await this.templates.save(template);
    return template.id;
  }

  /**
   * Réviser passe par l'agrégat chargé, jamais par un `compose` déguisé : c'est
   * lui qui refuse de retoucher un gabarit archivé, et le contourner rendrait ce
   * refus décoratif.
   */
  private async resolve(
    id: string | null,
    draft: Parameters<typeof PriceTemplate.compose>[1],
    staffSub: string,
  ): Promise<PriceTemplate> {
    if (id === null) {
      return PriceTemplate.compose(this.ids.next(), draft, staffSub);
    }
    const existing = await this.templates.load(id);
    if (existing === null) {
      throw new PriceTemplateNotFoundError(id);
    }
    return existing.revise(draft);
  }
}

@CommandHandler(ApplyPriceTemplateCommand)
export class ApplyPriceTemplateHandler implements ICommandHandler<
  ApplyPriceTemplateCommand,
  number
> {
  constructor(
    private readonly templates: PriceTemplateRepository,
    private readonly rules: PricingRuleRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /**
   * Rend le **nombre de règles posées** : un gabarit de trente lignes à deux
   * paliers en pose soixante, et l'écran doit pouvoir le dire. « Appliqué » sans
   * chiffre laisserait croire qu'une ligne = une règle.
   *
   * Chaque règle traverse l'agrégat et le dépôt un par un, donc tous les refus
   * habituels — dont le recouvrement, qui **arrêtera l'application** si le client
   * a déjà une mercuriale sur cet article à ce seuil pour cette période. C'est
   * voulu : écraser en silence une décision déjà prise serait pire qu'un refus.
   *
   * @throws {PriceTemplateNotFoundError} le gabarit n'existe pas.
   */
  async execute(command: ApplyPriceTemplateCommand): Promise<number> {
    const template = await this.templates.load(command.id);
    if (template === null) {
      throw new PriceTemplateNotFoundError(command.id);
    }
    const drafts = templateToRules(
      template.lines,
      command.payload.companyId,
      {
        validFrom: new Date(command.payload.validFrom),
        validTo: command.payload.validTo === null ? null : new Date(command.payload.validTo),
      },
      template.toPersistence().label,
    );

    const at = this.clock.now();
    for (const draft of drafts) {
      const rule = PricingRule.create(this.ids.next(), draft, command.staffSub);
      await this.rules.save(rule, {
        subjectType: "rule",
        subjectId: rule.id,
        kind: "posed",
        actor: command.staffSub,
        at,
        // Le journal dit d'OÙ vient la règle : six mois plus tard, « pourquoi ce
        // prix ? » se répond mieux par « le gabarit Club Med » que par une règle
        // isolée dont personne ne sait qui l'a posée ni avec quelles autres.
        reason: `Posé par le gabarit ${command.id}`,
        summary: describeRule(rule.asPriceRule),
      });
    }
    return drafts.length;
  }
}
