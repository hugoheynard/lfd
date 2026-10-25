import type { ResuppliesToProduceView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ClosedPlansReader } from "../../../production/channels/commerce/index.js";
import { isProducedByBakehouse } from "../domain/resupply-origin.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { ListResuppliesToProduceQuery } from "./list-resupplies-to-produce.query.js";
import { resupplyDayView } from "./resupply-day-view.js";
import { resupplyDays } from "./resupply-days.js";

/**
 * Sert l'écran du fournil « Réassorts à produire », EN LECTURE : par journée
 * (aujourd'hui, puis demain), par point, les réassorts passés et le cumul
 * par article. Les annulés n'y sont pas : il n'y a rien à produire.
 *
 * Depuis le lot R3a (2026-10-21), un réassort « pour demain » d'une journée
 * dont le plan est arrêté n'y est plus : il est figé dans la feuille du
 * fournil, et le compter ici aussi le ferait produire deux fois. L'écran ne
 * montre donc que ce qui n'est pas figé. Depuis R4a (2026-10-22), un « au
 * plus tôt » LANCÉ n'y est plus non plus, pour la même raison : il est au plan
 * du jour, compté dans les fournées. Une sortie de réserve (plan A1, lot
 * A1.4) n'y est jamais : le pain est déjà fait.
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
      (resupply) =>
        isProducedByBakehouse(resupply.origin) &&
        !(resupply.target === "tomorrow" && stopped.has(resupply.serviceDay)) &&
        (resupply.launched ?? null) === null,
    );
    const labels = await this.sites.labelsOf([...new Set(placed.map((r) => r.siteId))]);
    return {
      days: [today, tomorrow].map((day) =>
        resupplyDayView(
          day,
          placed.filter((resupply) => resupply.serviceDay === day),
          labels,
        ),
      ),
    };
  }
}
