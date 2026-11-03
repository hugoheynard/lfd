import { Injectable } from "@nestjs/common";

import {
  DayResuppliesReader,
  type PlacedResupply,
  type ServiceDay,
} from "../../../production/channels/commerce/index.js";
import { isProducedByBakehouse } from "../domain/resupply-origin.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import type { PlacedSiteResupplySnapshot } from "../domain/site-resupply.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { TransferServedSites } from "../domain/transfer-served-sites.js";

/**
 * {@link DayResuppliesReader} tel que le commerce l'implémente (le « pour demain » figé à l'arrêt,
 * R3a, 2026-10-21) : les réassorts « pour demain » envoyés et non annulés de la
 * journée, avec le nom du point et, depuis la fiche au colisage (R3b), s'il est servi par
 * transfert. Un « au plus tôt » n'entre au plan que lancé, un par un (`asapToLaunch`, R4a).
 *
 * Lu par l'arrêt du plan SOUS le verrou de la journée : il ne lit que des
 * tables du commerce, sans verrou de ligne — pas de cycle avec l'envoi et
 * l'annulation, qui prennent la journée avant d'écrire.
 */
@Injectable()
export class ProductionDayResupplies extends DayResuppliesReader {
  constructor(
    private readonly reader: SiteResupplyReader,
    private readonly sites: ResupplySiteLabels,
    private readonly transfers: TransferServedSites,
  ) {
    super();
  }

  async placedFor(day: ServiceDay): Promise<readonly PlacedResupply[]> {
    const placed = (await this.reader.placedOn([day.value])).filter(
      (resupply) => resupply.target === "tomorrow",
    );
    return this.forProduction(placed);
  }

  /**
   * R4a : LE réassort « au plus tôt » envoyé et non annulé que le fournil
   * lance, pour cette journée — `null` sinon (annulé, autre jour, autre
   * visée, ou sortie de réserve : rien à fabriquer, A1.4).
   *
   * Il ne filtre PAS le déjà lancé, délibérément (M7, audit du 2026-11-02) :
   * la colonne `launched_at` du commerce n'est qu'un affichage posé par le
   * fait, en retard sur le fournil. L'autorité est l'agrégat de la journée,
   * qui refuse un second lancement en le nommant
   * (`ResupplyAlreadyLaunchedError`, 409) ; filtrer ici le changerait en
   * « introuvable » (404), et ferait décider le commerce à la place du fournil.
   */
  async asapToLaunch(day: ServiceDay, resupplyId: string): Promise<PlacedResupply | null> {
    const asap = (await this.reader.placedOn([day.value])).filter(
      (resupply) =>
        resupply.target === "asap" &&
        resupply.id === resupplyId &&
        isProducedByBakehouse(resupply.origin),
    );
    return (await this.forProduction(asap))[0] ?? null;
  }

  /** Les réassorts tels que le fournil les fige : le nom du point, et s'il est servi par transfert. */
  private async forProduction(
    placed: readonly PlacedSiteResupplySnapshot[],
  ): Promise<readonly PlacedResupply[]> {
    const siteIds = [...new Set(placed.map((r) => r.siteId))];
    const [labels, served] = await Promise.all([
      this.sites.labelsOf(siteIds),
      this.transfers.servedByTransfer(siteIds),
    ]);
    return placed.map((resupply) => ({
      resupplyId: resupply.id,
      siteId: resupply.siteId,
      siteLabel: labels.get(resupply.siteId) ?? null,
      name: resupply.name,
      servedByTransfer: served.has(resupply.siteId),
      lines: resupply.lines.map((line) => ({
        sku: line.sku,
        productName: line.label,
        quantity: line.quantity,
        saleUnit: line.saleUnit,
      })),
    }));
  }
}
