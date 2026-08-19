import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { PricingRuleRepository } from "../../domain/ports/pricing-rule.repository.js";
import { PriceRuleNotFoundError } from "../../domain/pricing-errors.js";
import { describeRule } from "../../domain/pricing-act.js";
import {
  ArchivePriceRuleCommand,
  PausePriceRuleCommand,
  RenamePriceRuleCommand,
  ResumePriceRuleCommand,
} from "./pricing.commands.js";
import type { PricingRule } from "../../domain/entities/pricing-rule.js";
import type { PricingAct, PricingActKind } from "../../domain/pricing-act.js";

/**
 * **Les trois gestes qui arrêtent, reprennent et rangent une règle.**
 *
 * Aucun ne décide d'un refus : les refus vivent dans l'agrégat, où le prochain
 * appelant — un import, un seed, le planificateur des paniers récurrents — les
 * trouvera aussi. Ici il n'y a que le cycle : charger, transitionner, rendre au
 * port avec l'acte.
 *
 * Les trois se ressemblent, et c'est voulu qu'ils restent **trois** : un
 * `ChangeRuleStateCommand` générique aurait été plus court et aurait perdu la
 * seule chose qui compte dans six mois — ce que l'utilisateur croyait faire.
 */

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
      rule.pause(command.staffSub, now),
      actOf(rule, "paused", command.staffSub, now, command.reason),
    );
  }
}

@CommandHandler(ResumePriceRuleCommand)
export class ResumePriceRuleHandler implements ICommandHandler<ResumePriceRuleCommand, void> {
  constructor(
    private readonly rules: PricingRuleRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * La reprise ne porte pas de motif : elle rétablit ce qui avait été décidé,
   * et l'écran n'a rien à demander pour ça.
   */
  async execute(command: ResumePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoad(this.rules, command.id);
    await this.rules.update(rule.resume(now), actOf(rule, "resumed", command.staffSub, now, null));
  }
}

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
      rule.archive(command.staffSub, now, command.reason),
      actOf(rule, "archived", command.staffSub, now, command.reason),
    );
  }
}

/**
 * Un **404** et non un silence : deux personnes peuvent avoir le même écran
 * ouvert, et celle qui arrive seconde mérite de savoir que son geste n'a rien
 * fait plutôt que de croire qu'il a marché.
 */
async function mustLoad(rules: PricingRuleRepository, id: string): Promise<PricingRule> {
  const rule = await rules.load(id);
  if (rule === null) {
    throw new PriceRuleNotFoundError(id);
  }
  return rule;
}

/**
 * L'acte décrit la règle **telle qu'elle était avant** la transition.
 *
 * C'est ce qu'on cherche en relisant : « qu'est-ce qui a été suspendu », pas
 * « quel état a-t-elle pris ». L'état, le verbe le dit déjà.
 */
function actOf(
  rule: PricingRule,
  kind: PricingActKind,
  actor: string,
  at: Date,
  reason: string | null,
): PricingAct {
  return {
    subjectType: "rule",
    subjectId: rule.id,
    kind,
    actor,
    at,
    reason,
    summary: describeRule(rule.asPriceRule),
  };
}

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
  ) {}

  async execute(command: RenamePriceRuleCommand): Promise<void> {
    const now = this.clock.now();
    const rule = await mustLoad(this.rules, command.id);
    await this.rules.rename(
      rule.rename(command.label),
      actOf(rule, "renamed", command.staffSub, now, null),
    );
  }
}
