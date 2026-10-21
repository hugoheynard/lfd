import type { ResupplyDayToProduceView } from "@lfd/contracts";

import { resupplyTotals } from "../domain/resupply-totals.js";
import type { PlacedSiteResupplySnapshot } from "../domain/site-resupply.js";
import { siteResupplyView } from "./site-resupply-view.js";

/**
 * Une journée de réassorts telle que le fournil la lit : par point, ses
 * réassorts envoyés, et le cumul par article. Partagé par l'écran
 * « Réassorts à produire » et l'onglet de Prod manager (lot R3d).
 */
export function resupplyDayView(
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
