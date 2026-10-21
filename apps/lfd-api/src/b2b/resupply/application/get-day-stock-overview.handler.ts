import type { DayStockOverviewView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PackedResuppliesReader } from "../../../packing/channels/commerce/index.js";
import { ClosedPlansReader } from "../../../production/channels/commerce/index.js";
import { type DayStock, dayStockOf } from "../domain/day-stock.js";
import { DayStockReader } from "../domain/day-stock.reader.js";
import { ResupplyReceipt } from "../domain/resupply-receipt.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { StockAlertReader } from "../domain/stock-alert.reader.js";
import { GetDayStockOverviewQuery } from "./get-day-stock-overview.query.js";

/**
 * Sert l'onglet **Stock** de la Supervision (lot S1,
 * `reassort-boutiques/plan-reapprovisionnement.md`, 2026-10-22) : pour la
 * journée regardée, une entrée par point — ses réassorts (envoyé, figé,
 * arrivé, réceptionné) et ses produits (stock du jour, alerte vivante,
 * attendu). Lecture pure.
 *
 * Tous les points non archivés y sont, dans l'ordre des points, même sans
 * rien ; un point archivé n'y est que s'il porte quelque chose ce jour-là,
 * après les autres. Les alertes n'ont pas de journée (une alerte n'expire
 * pas) : ce sont les vivantes à l'instant de la lecture.
 */
@QueryHandler(GetDayStockOverviewQuery)
export class GetDayStockOverviewHandler implements IQueryHandler<
  GetDayStockOverviewQuery,
  DayStockOverviewView
> {
  constructor(
    private readonly reader: DayStockReader,
    private readonly alerts: StockAlertReader,
    private readonly plans: ClosedPlansReader,
    private readonly packed: PackedResuppliesReader,
    private readonly labels: ResupplySiteLabels,
  ) {}

  async execute(query: GetDayStockOverviewQuery): Promise<DayStockOverviewView> {
    const day = query.serviceDay;
    const [sites, resupplies, snapshots, alerts, stopped] = await Promise.all([
      this.reader.sites(),
      this.reader.resuppliesOn(day),
      this.reader.receiptsOn(day),
      this.alerts.liveEverywhere(),
      this.plans.closedBetween(day, day),
    ]);
    const receipts = snapshots.map((snapshot) => ResupplyReceipt.restore(snapshot));
    const packed = await this.packed.packedOf(resupplies.map((resupply) => resupply.id));
    const dayOf = (siteId: string): DayStock =>
      dayStockOf({
        resupplies: resupplies.filter((r) => r.siteId === siteId),
        receipts: receipts.filter((r) => r.siteId === siteId),
        alerts: alerts.filter((a) => a.siteId === siteId),
        packed,
        planStopped: stopped.includes(day),
      });
    const active = sites.map((site) => ({
      siteId: site.id,
      siteLabel: site.label,
      ...dayOf(site.id),
    }));
    const archived = await this.archivedSites(
      [...resupplies, ...receipts, ...alerts].map((item) => item.siteId),
      new Set(sites.map((site) => site.id)),
      dayOf,
    );
    return { serviceDay: day, sites: [...active, ...archived] };
  }

  /** Les points hors de la liste qui portent quelque chose ce jour-là. */
  private async archivedSites(
    siteIds: readonly string[],
    known: ReadonlySet<string>,
    dayOf: (siteId: string) => DayStock,
  ): Promise<DayStockOverviewView["sites"]> {
    const others = [...new Set(siteIds)].filter((siteId) => !known.has(siteId));
    const labels = await this.labels.labelsOf(others);
    return others
      .map((siteId) => ({ siteId, siteLabel: labels.get(siteId) ?? null, ...dayOf(siteId) }))
      .filter((site) => site.resupplies.length > 0 || site.products.length > 0);
  }
}
