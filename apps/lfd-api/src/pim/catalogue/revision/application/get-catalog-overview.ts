import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { CatalogOverviewView } from "@lfd/pim-contracts";

import { countCatalogOverview } from "../domain/catalog-overview.js";
import { CatalogOverviewReader } from "../domain/ports/catalog-overview.reader.js";

export class GetCatalogOverviewQuery {}

/**
 * **Où en est le catalogue** : ce qu'il contient et ce qui est validé.
 *
 * Compté par agrégat (`CatalogOverviewReader`), avec la règle de l'ancre
 * (`countCatalogOverview`) : construire la photo complète d'une révision pour
 * en compter les lignes relisait tout le catalogue à chaque visite. Les
 * révisions, elles, ont leur écran, qui les liste et les compare.
 */
@QueryHandler(GetCatalogOverviewQuery)
export class GetCatalogOverviewHandler implements IQueryHandler<
  GetCatalogOverviewQuery,
  CatalogOverviewView
> {
  constructor(private readonly reader: CatalogOverviewReader) {}

  async execute(): Promise<CatalogOverviewView> {
    return countCatalogOverview(await this.reader.productRows());
  }
}
