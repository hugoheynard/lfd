import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CycleOrdersReader } from "../../domain/ports/cycle-orders.reader.js";
import { StatementBillingReader } from "../../domain/ports/statement-billing.reader.js";
import { statementCsv } from "../../domain/services/cycle-statement-csv.js";
import { buildStatement } from "../cycle-statement-support.js";
import { ExportCycleStatementQuery } from "./cycle-statement-queries.js";

/** Le fichier et le nom qu'on propose au navigateur. */
export interface CycleStatementFile {
  readonly csv: string;
  readonly fileName: string;
}

/**
 * Le relevé en CSV — le **même** relevé que l'écran, par `buildStatement`.
 *
 * Le nom porte « PROVISOIRE » : un fichier rangé sur un bureau perd son
 * contexte, jamais son nom.
 */
@QueryHandler(ExportCycleStatementQuery)
export class ExportCycleStatementHandler implements IQueryHandler<
  ExportCycleStatementQuery,
  CycleStatementFile
> {
  constructor(
    private readonly orders: CycleOrdersReader,
    private readonly billing: StatementBillingReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ExportCycleStatementQuery): Promise<CycleStatementFile> {
    const built = await buildStatement(
      { orders: this.orders, billing: this.billing, clock: this.clock },
      query.companyId,
      query.month,
    );
    const month = built.month.toString();
    return {
      csv: statementCsv(built.statement, {
        companyName: built.companyName,
        month,
        startsAt: built.cycle.startsAt,
        closesAt: built.cycle.closesAt,
        inProgress: built.inProgress,
      }),
      fileName: `RELEVE-PROVISOIRE-${built.companyName}-${month}.csv`,
    };
  }
}
