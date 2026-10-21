import type { ResupplyProductionDayView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ClosedPlansReader } from "../../../production/channels/commerce/index.js";
import { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { ResupplySiteLabels } from "../domain/resupply-site-labels.js";
import { SiteResupplyReader } from "../domain/site-resupply.reader.js";
import { GetResupplyProductionDayQuery } from "./get-resupply-production-day.query.js";
import { resupplyDayView } from "./resupply-day-view.js";

/**
 * Sert l'onglet « Réassorts » de Prod manager (lot R3d,
 * `reassort-boutiques/plan-reapprovisionnement.md`, Hugo 2026-10-21) : une
 * journée, tous points, ses réassorts envoyés — « pour demain » et « au plus
 * tôt » — et le catalogue qui fait les lignes de la table.
 *
 * À la différence de « Réassorts à produire », les réassorts « pour demain »
 * d'un plan arrêté y SONT, avec `planStopped` : l'onglet les montre figés,
 * il ne les compte pas une seconde fois — le fournil les a sur sa feuille.
 *
 * Lus au commerce plutôt qu'à la copie figée du fournil : sous le guichet du
 * plan, l'envoi et l'annulation d'un réassort pour demain sont refusés une
 * fois la journée arrêtée (R3a), donc les deux listes sont les mêmes ; et
 * l'onglet a besoin des « au plus tôt », que le fournil ne fige jamais.
 */
@QueryHandler(GetResupplyProductionDayQuery)
export class GetResupplyProductionDayHandler implements IQueryHandler<
  GetResupplyProductionDayQuery,
  ResupplyProductionDayView
> {
  constructor(
    private readonly reader: SiteResupplyReader,
    private readonly sites: ResupplySiteLabels,
    private readonly plans: ClosedPlansReader,
    private readonly catalogue: ResupplyCatalogue,
  ) {}

  async execute(query: GetResupplyProductionDayQuery): Promise<ResupplyProductionDayView> {
    const day = query.serviceDay;
    const [placed, stopped, articles] = await Promise.all([
      this.reader.placedOn([day]),
      this.plans.closedBetween(day, day),
      this.catalogue.articles(),
    ]);
    const labels = await this.sites.labelsOf([...new Set(placed.map((r) => r.siteId))]);
    return {
      ...resupplyDayView(day, placed, labels),
      planStopped: stopped.includes(day),
      articles,
    };
  }
}
