import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { AccountingRulesView } from "@lfd/pim-contracts";

import { AccountingRulesRepository } from "../domain/ports/accounting-rules.repository.js";

/** Lecture des règles comptables — dispatchée par le `QueryBus`. Sans paramètre. */
export class ReadAccountingRulesQuery {}

/**
 * Rien réglé ⇒ **deux `null`**, et non un rapport de complaisance.
 *
 * L'écran doit pouvoir écrire « à régler ». Rendre 10 000 lui ferait afficher
 * « 100 % » — une phrase que personne n'a prononcée, et qu'il serait impossible
 * de distinguer d'un réglage volontaire à 100 %.
 */
const NEVER_SET: AccountingRulesView = {
  ratioBp: null,
  // La MÉTHODE, elle, n'a pas de « jamais réglée » : le calcul d'origine est
  // celui qui s'applique tant que personne n'a choisi, et le dire `null`
  // obligerait l'écran à inventer un repli — donc à le choisir une seconde fois,
  // ailleurs, avec le risque d'en choisir un autre.
  method: "ratio_ttc",
  fixedVatPercent: null,
  updatedAt: null,
};

@QueryHandler(ReadAccountingRulesQuery)
export class ReadAccountingRulesHandler implements IQueryHandler<
  ReadAccountingRulesQuery,
  AccountingRulesView
> {
  constructor(private readonly rules: AccountingRulesRepository) {}

  async execute(): Promise<AccountingRulesView> {
    const record = await this.rules.read();
    if (record === null) {
      return NEVER_SET;
    }
    const snapshot = record.rules.snapshot();
    return {
      ratioBp: snapshot.proPriceRatioBp,
      method: snapshot.proPriceMethod,
      fixedVatPercent: snapshot.proPriceFixedVatPercent,
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
