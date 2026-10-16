import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../journal/pim-journal.js";
import { AccountingRules } from "../domain/entities/accounting-rules.js";
import { AccountingRulesRepository } from "../domain/ports/accounting-rules.repository.js";
import { CatalogReemission } from "../../catalogue/shared/domain/ports/catalog-reemission.js";

/** Le sujet du fait : le singleton lui-même — il n'y en a qu'un à nommer. */
const ACCOUNTING_RULES_SUBJECT = "accounting";

/**
 * Le nom du sujet au journal (`subjectLabel`, plan des phrases, lot B) : les
 * règles comptables sont UNIQUES, leur nom ne dépend de rien.
 */
const ACCOUNTING_RULES_LABEL = "Règles comptables";

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
 * **Depuis le lot S (2026-10-16), le rapport est une SUGGESTION.** Sous
 * `entered`, il ne fixe aucun prix vendu : il nourrit la suggestion de la
 * fiche et le pré-remplissage. Sous `ratio_ttc`, il reste le repli des
 * déclinaisons sans saisie. Son absence ne bloque plus rien : une base sans
 * ligne vaut `entered` (`AccountingRules.effectivePolicy`).
 *
 * ## Quand il réémet le catalogue
 *
 * Toujours, SAUF quand la ligne existait déjà et que la méthode est `entered`
 * (S6 et sa contradiction par `vitruve`) : alors aucun prix servi ne bouge.
 * La méthode est lue DANS la transaction, avec l'écriture : un « Passer au prix
 * saisi » concurrent réémet de toute façon de son côté
 * (`choose-pro-price-method.ts`), ce qui couvre la course. Le premier rapport
 * posé réémet, même sous `entered` : il fait exister la ligne, et c'est le cas
 * que la contradiction a demandé de ne pas trancher à la place du code.
 */
@CommandHandler(SetProPriceRatioCommand)
export class SetProPriceRatioHandler implements ICommandHandler<SetProPriceRatioCommand, void> {
  constructor(
    private readonly rules: AccountingRulesRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly reemission: CatalogReemission,
  ) {}

  /**
   * Le rapport d'AVANT est lu avant d'écrire : après, l'agrégat ne s'en
   * souvient plus, et un journal qui ne dit pas d'où l'on vient ne sert à rien.
   * `null` y est une valeur légitime — « c'était le premier réglage » est
   * précisément ce qu'on voudra relire.
   */
  async execute(command: SetProPriceRatioCommand): Promise<void> {
    const reemit = await this.uow.run(async () => {
      const record = await this.rules.read();
      const before = record?.rules.snapshot().proPriceRatioBp ?? null;
      const rules = record?.rules ?? AccountingRules.open(command.basisPoints);
      rules.setProPriceRatio(command.basisPoints);
      const ticket = await this.journalize(before, rules.snapshot().proPriceRatioBp);
      await this.rules.save(rules, ticket);
      return record === null || rules.proPriceMethod.method !== "entered";
    });
    if (reemit) {
      await this.reemission.everything();
    }
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
      payload: { subjectLabel: ACCOUNTING_RULES_LABEL, from: before, to: after },
    });
  }
}
