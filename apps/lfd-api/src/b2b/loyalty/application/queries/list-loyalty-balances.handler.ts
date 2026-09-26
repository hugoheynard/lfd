import type { LoyaltyBalanceView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { LoyaltyLedgerReader } from "../../domain/ports/loyalty-ledger.reader.js";
import { ListLoyaltyBalancesQuery } from "./list-loyalty-balances.query.js";

/** Les soldes, tels que la somme des livres les donne. */
@QueryHandler(ListLoyaltyBalancesQuery)
export class ListLoyaltyBalancesHandler implements IQueryHandler<
  ListLoyaltyBalancesQuery,
  readonly LoyaltyBalanceView[]
> {
  constructor(private readonly ledger: LoyaltyLedgerReader) {}

  async execute(): Promise<readonly LoyaltyBalanceView[]> {
    const rows = await this.ledger.listBalances();
    return rows.map((row) => ({ holder: { ...row.holder }, points: row.points }));
  }
}
