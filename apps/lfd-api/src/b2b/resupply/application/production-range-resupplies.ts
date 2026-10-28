import { Injectable } from "@nestjs/common";

import {
  type ExpectedDayResupplies,
  ExpectedResuppliesReader,
  type ServiceRange,
} from "../../../production/channels/commerce/index.js";
import { resupplyTotals } from "../domain/resupply-totals.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";

/**
 * {@link ExpectedResuppliesReader} tel que le commerce l'implémente (lot R3d,
 * 2026-10-21) : les réassorts « pour demain » envoyés et non annulés de la
 * plage, fusionnés par article et par journée, pour le prévisionnel. « Au
 * plus tôt » n'entre pas au plan (R4).
 *
 * Il ne regarde pas si le plan est arrêté : c'est la matrice du fournil qui
 * choisit, journée par journée, entre ce qu'il a figé et ce qu'on lui envoie.
 */
@Injectable()
export class ProductionRangeResupplies extends ExpectedResuppliesReader {
  constructor(private readonly reader: SiteResupplyReader) {
    super();
  }

  async expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayResupplies[]> {
    const placed = (await this.reader.placedOn(range.days.map((day) => day.value))).filter(
      (resupply) => resupply.target === "tomorrow",
    );
    const days = [...new Set(placed.map((resupply) => resupply.serviceDay))];
    return days.map((day) => ({
      day,
      items: resupplyTotals(
        placed.filter((resupply) => resupply.serviceDay === day).map((r) => r.lines),
      ).map((total) => ({
        sku: total.sku,
        productName: total.label,
        quantity: total.quantity,
        // Le réassort refuse un article au poids (plan `pricing/vente-au-poids.md`, § 2).
        saleUnit: "piece" as const,
      })),
    }));
  }
}
