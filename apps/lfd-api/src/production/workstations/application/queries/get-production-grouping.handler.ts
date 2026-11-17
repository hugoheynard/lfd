import type { ProductionGroupingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsReader,
} from "../../../shared/print/index.js";
import { groupingEntriesOf } from "../services/grouping-entries.js";
import { GroupingSourceReading } from "../services/grouping-source-reading.service.js";
import { GetProductionGroupingQuery } from "./get-production-grouping.query.js";

/**
 * **Le rangement servi au front** (`documentation/fournil/les-postes-du-fournil.md`,
 * § 3.7) : pour chaque SKU, son groupe et son intertitre selon le mode du
 * RÉGLAGE — par rayon en mode boutique, par poste en mode prod. Un SKU absent
 * du miroir du catalogue va en « Hors catalogue » (« — à ranger » en mode
 * prod) ; masqué, réservé ou retiré, il garde son rayon : il n'est jamais refusé, puisqu'un écran le montre quand même.
 *
 * Les SKU en double ne ressortent qu'une fois. Il n'écrit rien, pas même un
 * compteur — §4.
 */
@QueryHandler(GetProductionGroupingQuery)
export class GetProductionGroupingHandler implements IQueryHandler<
  GetProductionGroupingQuery,
  ProductionGroupingView
> {
  constructor(
    private readonly display: ProductionDisplaySettingsReader,
    private readonly reading: GroupingSourceReading,
  ) {}

  async execute(query: GetProductionGroupingQuery): Promise<ProductionGroupingView> {
    const skus = [...new Set(query.skus)];
    const settings = (await this.display.current()) ?? ProductionDisplaySettings.defaults();
    const read = await this.reading.read(skus, settings.grouping, "Rangement servi au front");
    return {
      mode: settings.grouping,
      showSubcategories: settings.showSubcategories,
      shelvesKnown: read.shelvesKnown,
      workstationsKnown: read.workstationsKnown,
      entries: groupingEntriesOf(skus, read.source, settings.showSubcategories),
    };
  }
}
