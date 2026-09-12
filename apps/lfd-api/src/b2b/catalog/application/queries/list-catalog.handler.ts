import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { CatalogAdminItemView } from "@lfd/contracts";

import { CatalogAdminReader } from "../../domain/ports/catalog-admin.reader.js";
import { ListCatalogQuery } from "./list-catalog.query.js";

/**
 * La lecture du catalogue de paramétrage, **nommée**.
 *
 * Le contrôleur appelait `reader.list()` en direct. Ça marchait, et ça coûtait
 * ce qu'un contournement coûte toujours : la lecture n'avait pas de cas d'usage,
 * donc ne se testait qu'à travers HTTP, ne se réutilisait pas, et le prochain
 * qui en aurait eu besoin l'aurait réécrite. La synthèse et l'export, juste à
 * côté, en avaient précisément besoin.
 */
@QueryHandler(ListCatalogQuery)
export class ListCatalogHandler implements IQueryHandler<ListCatalogQuery, CatalogAdminItemView[]> {
  constructor(private readonly catalog: CatalogAdminReader) {}

  async execute(): Promise<CatalogAdminItemView[]> {
    return this.catalog.list();
  }
}
