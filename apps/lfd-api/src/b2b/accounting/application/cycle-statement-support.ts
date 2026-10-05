import type { Clock } from "../../../platform/time/clock.js";
import { StatementCompanyNotFoundError } from "../domain/errors/statement-errors.js";
import type { CycleOrdersReader } from "../domain/ports/cycle-orders.reader.js";
import type { BillingCycle } from "../domain/services/billing-cycle.js";
import { aggregateStatement, type CycleStatement } from "../domain/services/cycle-statement.js";
import { StatementMonth } from "../domain/value-objects/statement-month.js";

/**
 * Le relevé d'un cycle, **construit une seule fois pour deux sorties** — la vue
 * et le CSV. Sur le modèle de `cycle-draft-support.ts` : si l'export passait par
 * un autre chemin que l'écran, les deux finiraient par ne plus dire la même
 * chose.
 */
export interface StatementDeps {
  readonly orders: CycleOrdersReader;
  readonly clock: Clock;
}

export interface BuiltStatement {
  readonly companyId: string;
  readonly companyName: string;
  readonly month: StatementMonth;
  readonly cycle: BillingCycle;
  readonly inProgress: boolean;
  readonly statement: CycleStatement;
}

/**
 * @throws {InvalidStatementMonthError} `month` n'est pas `AAAA-MM`.
 * @throws {FutureStatementMonthError} `month` n'a pas commencé.
 * @throws {StatementCompanyNotFoundError} la société n'existe pas.
 */
export async function buildStatement(
  deps: StatementDeps,
  companyId: string,
  requestedMonth: string | undefined,
): Promise<BuiltStatement> {
  const now = deps.clock.now();
  const current = StatementMonth.containing(now);
  const month =
    requestedMonth === undefined ? current : StatementMonth.requested(requestedMonth, now);

  const companyName = await deps.orders.companyName(companyId);
  if (companyName === null) {
    throw new StatementCompanyNotFoundError(companyId);
  }
  const cycle = month.cycle();
  const orders = await deps.orders.cycleOrders(companyId, cycle);
  return {
    companyId,
    companyName,
    month,
    cycle,
    inProgress: month.equals(current),
    statement: aggregateStatement(orders),
  };
}
