import type { CounterSettingsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CounterSites } from "../domain/counter-sites.js";
import { STOCK_TRACKING_BY_DEFAULT } from "../domain/counter-stock-setting.js";
import { CounterStockSettingsReader } from "../domain/counter-stock-settings.reader.js";
import { GetCounterSettingsQuery } from "./get-counter-settings.query.js";

/**
 * Sert Réglages › Comptoir : chaque point non archivé, par nom, avec son
 * suivi du stock — désactivé et sans auteur tant qu'il n'a jamais été réglé.
 */
@QueryHandler(GetCounterSettingsQuery)
export class GetCounterSettingsHandler implements IQueryHandler<
  GetCounterSettingsQuery,
  CounterSettingsView
> {
  constructor(
    private readonly sites: CounterSites,
    private readonly settings: CounterStockSettingsReader,
  ) {}

  async execute(): Promise<CounterSettingsView> {
    const sites = await this.sites.active();
    const settings = await this.settings.of(sites.map((site) => site.id));
    return {
      sites: sites.map((site) => {
        const setting = settings.get(site.id);
        return {
          siteId: site.id,
          siteLabel: site.label,
          stockTracking: setting?.stockTracking ?? STOCK_TRACKING_BY_DEFAULT,
          updatedAt: setting?.updated.at.toISOString() ?? null,
          updatedBy: setting?.updated.author.name ?? null,
        };
      }),
    };
  }
}
