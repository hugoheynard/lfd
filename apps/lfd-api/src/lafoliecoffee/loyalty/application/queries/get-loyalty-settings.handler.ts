import type { LoyaltySettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { LoyaltySettingsReader } from "../../domain/ports/loyalty-settings.store.js";
import { GetLoyaltySettingsQuery } from "./get-loyalty-settings.query.js";

/** Ligne absente = programme fermé : la lecture le dit (`null`), elle ne sème rien. */
@QueryHandler(GetLoyaltySettingsQuery)
export class GetLoyaltySettingsHandler implements IQueryHandler<
  GetLoyaltySettingsQuery,
  LoyaltySettingsView
> {
  constructor(private readonly settings: LoyaltySettingsReader) {}

  async execute(): Promise<LoyaltySettingsView> {
    const settings = await this.settings.read();
    return { settings: settings?.toInput() ?? null };
  }
}
