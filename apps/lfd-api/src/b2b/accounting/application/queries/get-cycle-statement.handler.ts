import type {
  CycleStatementGroupView,
  CycleStatementOrderView,
  CycleStatementView,
} from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { CycleOrdersReader } from "../../domain/ports/cycle-orders.reader.js";
import { StatementBillingReader } from "../../domain/ports/statement-billing.reader.js";
import { STATEMENT_SCOPE } from "../../domain/services/cycle-statement-csv.js";
import type { StatementLine } from "../../domain/services/cycle-statement.js";
import type { StatementGroup } from "../../domain/services/payer-statement.js";
import { buildStatement, type BuiltStatement } from "../cycle-statement-support.js";
import { GetCycleStatementQuery } from "./cycle-statement-queries.js";

/**
 * Le relevé d'une société pour un cycle, **provisoire** : recalculé à chaque
 * lecture tant que S4-0 n'a pas figé de lot.
 */
@QueryHandler(GetCycleStatementQuery)
export class GetCycleStatementHandler implements IQueryHandler<
  GetCycleStatementQuery,
  CycleStatementView
> {
  constructor(
    private readonly orders: CycleOrdersReader,
    private readonly billing: StatementBillingReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetCycleStatementQuery): Promise<CycleStatementView> {
    const built = await buildStatement(
      { orders: this.orders, billing: this.billing, clock: this.clock },
      query.companyId,
      query.month,
    );
    return toView(built);
  }
}

function toView(built: BuiltStatement): CycleStatementView {
  const { statement } = built;
  return {
    companyId: built.companyId,
    companyName: built.companyName,
    cycle: {
      month: built.month.toString(),
      startsAt: built.cycle.startsAt.toISOString(),
      closesAt: built.cycle.closesAt.toISOString(),
      inProgress: built.inProgress,
    },
    provisional: true,
    scope: STATEMENT_SCOPE,
    groups: statement.groups.map(toGroupView),
    totals: statement.totals,
    selfPayingEntities: built.selfPaying.map((entity) => ({
      companyId: entity.companyId,
      name: entity.name,
    })),
  };
}

function toGroupView(group: StatementGroup): CycleStatementGroupView {
  return {
    companyId: group.companyId,
    label: group.label,
    ownOrders: group.ownOrders,
    orders: group.lines.map(toOrderView),
    totals: group.totals,
  };
}

function toOrderView(line: StatementLine): CycleStatementOrderView {
  return {
    id: line.id,
    orderNumber: line.orderNumber,
    placedAt: line.placedAt.toISOString(),
    companyId: line.companyId,
    siteName: line.siteName,
    paidBy: line.paidBy,
    subtotalCents: line.subtotalCents,
    discountCents: line.discountCents,
    voucherDiscountCents: line.voucherDiscountCents,
    htCents: line.htCents,
    deliveryFeeCents: line.deliveryFeeCents,
    lateFeeCents: line.lateFeeCents,
    vatShares: line.vatShares,
    vatVentilated: line.vatVentilated,
    vatCents: line.vatCents,
    totalCents: line.totalCents,
    collectionState: line.collectionState,
  };
}
