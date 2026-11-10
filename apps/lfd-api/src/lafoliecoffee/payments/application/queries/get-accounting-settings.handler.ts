import type { AccountingSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { AccountingSettingsReader } from "../../domain/ports/accounting-settings.store.js";
import { GetAccountingSettingsQuery } from "./get-accounting-settings.query.js";

/** Ligne absente = aucun plafond : la lecture le dit, elle ne sème rien. */
@QueryHandler(GetAccountingSettingsQuery)
export class GetAccountingSettingsHandler implements IQueryHandler<
  GetAccountingSettingsQuery,
  AccountingSettingsView
> {
  constructor(private readonly settings: AccountingSettingsReader) {}

  async execute(): Promise<AccountingSettingsView> {
    const { paymentLinkMaxCents } = await this.settings.read();
    return { paymentLinkMaxCents };
  }
}
