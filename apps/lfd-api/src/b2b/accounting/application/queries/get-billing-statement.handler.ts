import type { BillingStatementView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { BillingStatementNotFoundError } from "../../domain/errors/billing-statement-errors.js";
import { BillingStatementReader } from "../../domain/ports/billing-statement.reader.js";
import { GetBillingStatementQuery } from "./billing-statement-queries.js";

/**
 * Le dossier d'UNE ligne de prélèvement : son arrêté figé, relu sans recalcul
 * (plan `le-prelevement-suit-la-facture.md`). Un arrêté annulé se lit
 * aussi — l'écran dit qu'il l'est.
 */
@QueryHandler(GetBillingStatementQuery)
export class GetBillingStatementHandler implements IQueryHandler<
  GetBillingStatementQuery,
  BillingStatementView
> {
  constructor(private readonly statements: BillingStatementReader) {}

  async execute(query: GetBillingStatementQuery): Promise<BillingStatementView> {
    const statement = await this.statements.byId(query.statementId);
    if (statement === null) {
      throw new BillingStatementNotFoundError(query.statementId);
    }
    return statement;
  }
}
