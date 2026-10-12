import type { Clock } from "../../../platform/time/clock.js";
import { StatementCompanyNotFoundError } from "../domain/errors/statement-errors.js";
import type { CycleOrdersReader } from "../domain/ports/cycle-orders.reader.js";
import type {
  SelfPayingEntity,
  StatementBillingReader,
} from "../domain/ports/statement-billing.reader.js";
import { payerStatement, type CycleStatement } from "../domain/services/payer-statement.js";
import type { StatementPeriod } from "../domain/services/statement-periods.js";
import { resolveStatementPeriod, type StatementRhythmDeps } from "./statement-period-support.js";

/**
 * Le relevé d'un cycle, **construit une seule fois pour deux sorties** — la vue
 * et le CSV. Sur le modèle de `cycle-draft-support.ts` : si l'export passait par
 * un autre chemin que l'écran, les deux finiraient par ne plus dire la même
 * chose.
 */
export interface StatementDeps extends StatementRhythmDeps {
  readonly orders: CycleOrdersReader;
  readonly billing: StatementBillingReader;
  readonly clock: Clock;
}

export interface BuiltStatement {
  readonly companyId: string;
  readonly companyName: string;
  readonly period: StatementPeriod;
  readonly statement: CycleStatement;
  /** Ses sous-comptes actuels qui règlent seuls — listés, sans montant. */
  readonly selfPaying: readonly SelfPayingEntity[];
}

/**
 * @param requestedClosure `periodClosesAt` (ISO), ou `undefined` pour la période en cours.
 * @throws {InvalidStatementPeriodError} la clôture demandée n'est pas un instant.
 * @throws {NotAStatementPeriodError} elle n'est pas une clôture de l'entité.
 * @throws {FutureStatementPeriodError} la période n'a pas commencé.
 * @throws {SeveralStatementIssuersError} plusieurs entités sont en service.
 * @throws {StatementCompanyNotFoundError} la société n'existe pas.
 */
export async function buildStatement(
  deps: StatementDeps,
  companyId: string,
  requestedClosure: string | undefined,
): Promise<BuiltStatement> {
  const now = deps.clock.now();
  const period = await resolveStatementPeriod(deps, requestedClosure);

  const company = await deps.orders.statementCompany(companyId);
  if (company === null) {
    throw new StatementCompanyNotFoundError(companyId);
  }
  const { cycle } = period;
  const [towards, ofPayer, selfPaying] = await Promise.all([
    deps.billing.followsTowards(companyId, cycle),
    deps.billing.followsOf(companyId, cycle),
    deps.billing.selfPayingSubAccounts(companyId, now),
  ]);
  const siteIds = [...new Set(towards.map((follow) => follow.companyId))];
  const orders = await deps.orders.cycleOrders([companyId, ...siteIds], cycle);
  return {
    companyId,
    companyName: company.name,
    period,
    statement: payerStatement({
      payerId: companyId,
      payerLabel: company.label,
      orders,
      followsTowardsPayer: towards,
      followsOfPayer: ofPayer,
    }),
    selfPaying,
  };
}
