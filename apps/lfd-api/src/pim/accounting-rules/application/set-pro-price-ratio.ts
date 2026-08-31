import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal, type WriteTicket } from "../../journal/pim-journal.js";
import { AccountingRules } from "../domain/entities/accounting-rules.js";
import { AccountingRulesRepository } from "../domain/ports/accounting-rules.repository.js";

/** Le sujet du fait : le singleton lui-même — il n'y en a qu'un à nommer. */
const ACCOUNTING_RULES_SUBJECT = "accounting";

export class SetProPriceRatioCommand {
  constructor(readonly basisPoints: number) {}
}

/**
 * Poser le rapport prix pro / prix public — le premier réglage comme les
 * suivants.
 *
 * Un seul geste pour les deux, parce que c'est un seul geste pour qui le fait :
 * « je décide que le pro paie 10 % de moins ». Séparer « ouvrir » de « réviser »
 * exposerait à l'écran un état de la base — la ligne existe-t-elle — dont
 * personne n'a à se soucier.
 *
 * ⚠️ **Rien ne lit encore ce rapport.** Aucun prix ne change tant que la
 * tranche 4 ne l'a pas raccordé. Le journal, lui, part dès maintenant : une
 * lacune de trace ne se rattrape pas, et le jour où le raccordement se fera on
 * voudra savoir depuis quand le rapport valait ce qu'il vaut.
 */
@CommandHandler(SetProPriceRatioCommand)
export class SetProPriceRatioHandler implements ICommandHandler<SetProPriceRatioCommand, void> {
  constructor(
    private readonly rules: AccountingRulesRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * Le rapport d'AVANT est lu avant d'écrire : après, l'agrégat ne s'en
   * souvient plus, et un journal qui ne dit pas d'où l'on vient ne sert à rien.
   * `null` y est une valeur légitime — « c'était le premier réglage » est
   * précisément ce qu'on voudra relire.
   */
  async execute(command: SetProPriceRatioCommand): Promise<void> {
    const record = await this.rules.read();
    const before = record?.rules.snapshot().proPriceRatioBp ?? null;

    let rules: AccountingRules;
    if (record === null) {
      rules = AccountingRules.open(command.basisPoints);
    } else {
      rules = record.rules;
      rules.setProPriceRatio(command.basisPoints);
    }
    const after = rules.snapshot().proPriceRatioBp;

    await this.uow.run(async () => {
      const ticket = await this.journalize(before, after);
      await this.rules.save(rules, ticket);
    });
  }

  /**
   * Reposer la même valeur n'affirme rien. La tracer quand même remplirait
   * l'historique de lignes « 9 000 → 9 000 », et noierait le seul événement que
   * quelqu'un cherchera un jour : celui où le rapport a vraiment bougé.
   */
  private async journalize(before: number | null, after: number): Promise<WriteTicket> {
    if (before === after) {
      return this.journal.untraced("rapport reposé à l'identique");
    }
    return this.journal.trace({
      type: PIM_EVENTS.accountingRulesProRatioChanged,
      subjectType: "accounting_rules",
      subjectId: ACCOUNTING_RULES_SUBJECT,
      payload: { from: before, to: after },
    });
  }
}
