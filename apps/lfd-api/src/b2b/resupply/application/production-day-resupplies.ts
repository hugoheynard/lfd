import { Injectable } from "@nestjs/common";

import {
  DayResuppliesReader,
  type PlacedResupply,
  type ServiceDay,
} from "../../../production/channels/commerce/index.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";

/**
 * {@link DayResuppliesReader} tel que le commerce l'implémente (lot R3a,
 * 2026-10-21) : les réassorts « pour demain » envoyés et non annulés de la
 * journée, avec le nom du point. « Au plus tôt » n'entre pas au plan (R4).
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
  ) {
    super();
  }

  async placedFor(day: ServiceDay): Promise<readonly PlacedResupply[]> {
    const placed = (await this.reader.placedOn([day.value])).filter(
      (resupply) => resupply.target === "tomorrow",
    );
    const labels = await this.sites.labelsOf([...new Set(placed.map((r) => r.siteId))]);
    return placed.map((resupply) => ({
      resupplyId: resupply.id,
      siteId: resupply.siteId,
      siteLabel: labels.get(resupply.siteId) ?? null,
      lines: resupply.lines.map((line) => ({
        sku: line.sku,
        productName: line.label,
        quantity: line.quantity,
      })),
    }));
  }
}
