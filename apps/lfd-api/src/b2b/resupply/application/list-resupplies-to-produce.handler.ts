import type { ResuppliesToProduceView, ResupplyDayToProduceView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { resupplyTotals } from "../domain/resupply-totals.js";
import type { SiteResupplySnapshot } from "../domain/site-resupply.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { ListResuppliesToProduceQuery } from "./list-resupplies-to-produce.query.js";
import { resupplyDays } from "./resupply-days.js";
import { siteResupplyView } from "./site-resupply-view.js";

/**
 * Sert l'écran du fournil « Réassorts à produire », EN LECTURE : par journée
 * (aujourd'hui, puis demain), par point, les réassorts passés et le cumul
 * par article. Les annulés n'y sont pas : il n'y a rien à produire.
 */
@QueryHandler(ListResuppliesToProduceQuery)
export class ListResuppliesToProduceHandler implements IQueryHandler<
  ListResuppliesToProduceQuery,
  ResuppliesToProduceView
> {
  constructor(
    private readonly reader: SiteResupplyReader,
    private readonly sites: ResupplySiteLabels,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ResuppliesToProduceView> {
    const { today, tomorrow } = resupplyDays(this.clock.now());
    const placed = await this.reader.placedOn([today, tomorrow]);
    const labels = await this.sites.labelsOf([...new Set(placed.map((r) => r.siteId))]);
    return {
      days: [today, tomorrow].map((day) =>
        dayView(
          day,
          placed.filter((resupply) => resupply.serviceDay === day),
          labels,
        ),
      ),
    };
  }
}

function dayView(
  serviceDay: string,
  resupplies: readonly SiteResupplySnapshot[],
  labels: ReadonlyMap<string, string>,
): ResupplyDayToProduceView {
  const siteIds = [...new Set(resupplies.map((resupply) => resupply.siteId))];
  return {
    serviceDay,
    sites: siteIds.map((siteId) => ({
      siteId,
      siteLabel: labels.get(siteId) ?? null,
      resupplies: resupplies.filter((r) => r.siteId === siteId).map(siteResupplyView),
    })),
    totals: resupplyTotals(resupplies.map((resupply) => resupply.lines)),
  };
}
