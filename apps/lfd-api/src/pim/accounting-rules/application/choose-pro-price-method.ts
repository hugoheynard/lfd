import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";
import type { ProPriceMethod } from "@lfd/pim-contracts";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal, type WriteTicket } from "../../journal/pim-journal.js";
import { AccountingRulesNotSetError } from "../domain/errors/accounting-rules-errors.js";
import { AccountingRulesRepository } from "../domain/ports/accounting-rules.repository.js";

/** Le sujet du fait : le singleton lui-même — il n'y en a qu'un à nommer. */
const ACCOUNTING_RULES_SUBJECT = "accounting";

/**
 * Le nom du sujet au journal (`subjectLabel`, plan des phrases, lot B) : les
 * règles comptables sont UNIQUES, leur nom ne dépend de rien.
 */
const ACCOUNTING_RULES_LABEL = "Règles comptables";

export class ChooseProPriceMethodCommand {
  constructor(readonly method: ProPriceMethod) {}
}

/**
 * **Choisir la méthode appliquée** — celle dont le push se servira.
 *
 * Un geste SÉPARÉ de celui du rapport, et ce n'est pas de la symétrie :
 * les deux retarifent le catalogue professionnel entier, et les enchaîner dans
 * une seule écriture rendrait impossible de lire dans le journal laquelle des
 * deux décisions a produit quel écart.
 *
 * ## Il REFUSE tant que le rapport n'est pas posé
 *
 * Une méthode sans rapport ne calcule rien : ouvrir la ligne ici avec un
 * rapport inventé serait le `DEFAULT_FOOD_VAT_RATE` une fois de plus. L'ordre
 * des gestes est donc imposé — d'abord la remise, ensuite la façon de
 * l'appliquer — et le refus le dit.
 *
 * ## Ce que la bascule fait vraiment, et que ce handler ne peut pas dire
 *
 * Le prix poussé est le `canonicalMillicents` de la plateforme : la BASE sur
 * laquelle s'appliquent ensuite la mercuriale, les paliers, les promotions et le
 * plancher. Une méthode qui déplacerait ce nombre ne déplacerait donc PAS les
 * prix d'autant : les planchers en montant absolu ne suivent pas, et les
 * articles à prix négocié ne bougent pas du tout. Le référentiel ne connaît
 * aucun de ces trois matériaux (vérifié le 2026-09-13, `catalogue-article.ts:12`,
 * `resolve-floor.ts:84`) : il ne peut donc pas annoncer combien d'articles
 * changent de prix, et il ne doit pas faire semblant.
 *
 * ⚠️ Sans objet tant qu'il n'y a qu'une méthode — cette route ne peut
 * aujourd'hui que rechoisir celle qui est déjà là. Elle existe pour la
 * suivante, et ce paragraphe est ce qu'il faudra relire ce jour-là.
 */
@CommandHandler(ChooseProPriceMethodCommand)
export class ChooseProPriceMethodHandler implements ICommandHandler<
  ChooseProPriceMethodCommand,
  void
> {
  constructor(
    private readonly rules: AccountingRulesRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ChooseProPriceMethodCommand): Promise<void> {
    const record = await this.rules.read();
    if (record === null) {
      throw new AccountingRulesNotSetError();
    }
    const before = record.rules.proPriceMethod.method;
    record.rules.chooseMethod(command.method);
    const after = record.rules.proPriceMethod.method;

    await this.uow.run(async () => {
      const ticket = await this.journalize(before, after);
      await this.rules.save(record.rules, ticket);
    });
  }

  /**
   * Rechoisir la même méthode n'affirme rien. La tracer quand même noierait le
   * seul événement que quelqu'un cherchera : celui où le catalogue
   * professionnel a changé de tarif.
   */
  private async journalize(before: string, after: string): Promise<WriteTicket> {
    if (before === after) {
      return this.journal.untraced("méthode rechoisie à l'identique");
    }
    return this.journal.trace({
      type: PIM_EVENTS.accountingRulesMethodChanged,
      subjectType: "accounting_rules",
      subjectId: ACCOUNTING_RULES_SUBJECT,
      payload: { subjectLabel: ACCOUNTING_RULES_LABEL, from: before, to: after },
    });
  }
}
