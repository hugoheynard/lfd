import type { ResuppliesToProduceView, ResupplyDayToProduceView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ClosedPlansReader } from "../../../production/channels/commerce/index.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { resupplyTotals } from "../domain/resupply-totals.js";
import type { PlacedSiteResupplySnapshot } from "../domain/site-resupply.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { ListResuppliesToProduceQuery } from "./list-resupplies-to-produce.query.js";
import { resupplyDays } from "./resupply-days.js";
import { siteResupplyView } from "./site-resupply-view.js";

/**
 * Sert l'écran du fournil « Réassorts à produire », EN LECTURE : par journée
 * (aujourd'hui, puis demain), par point, les réassorts passés et le cumul
 * par article. Les annulés n'y sont pas : il n'y a rien à produire.
 *
 * Depuis le lot R3a (2026-10-21), un réassort « pour demain » d'une journée
 * dont le plan est arrêté n'y est plus : il est figé dans la feuille du
 * fournil, et le compter ici aussi le ferait produire deux fois. L'écran ne
 * montre donc que ce qui n'est pas figé.
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
    private readonly plans: ClosedPlansReader,
  ) {}

  async execute(): Promise<ResuppliesToProduceView> {
    const { today, tomorrow } = resupplyDays(this.clock.now());
    const stopped = new Set(await this.plans.closedBetween(today, tomorrow));
    const placed = (await this.reader.placedOn([today, tomorrow])).filter(
      (resupply) => !(resupply.target === "tomorrow" && stopped.has(resupply.serviceDay)),
    );
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
  resupplies: readonly PlacedSiteResupplySnapshot[],
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
