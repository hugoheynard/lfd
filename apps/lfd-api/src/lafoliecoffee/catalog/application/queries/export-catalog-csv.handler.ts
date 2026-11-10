import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { catalogCsv } from "../../domain/services/catalog-csv.js";
import { CatalogAdminReader } from "../../domain/ports/catalog-admin.reader.js";
import { ExportCatalogCsvQuery } from "./export-catalog-csv.query.js";

/**
 * L'export CSV du catalogue.
 *
 * Le handler ne fait que deux choses : lire, et passer à une fonction **pure**.
 * Tout le format vit dans `catalogCsv`, qui ne connaît ni Nest, ni HTTP, ni
 * base — donc s'éprouve caractère par caractère sans monter quoi que ce soit.
 * C'est là qu'est la logique qui se trompe : un point-virgule dans un nom
 * d'article décale une ligne entière, en silence.
 */
@QueryHandler(ExportCatalogCsvQuery)
export class ExportCatalogCsvHandler implements IQueryHandler<ExportCatalogCsvQuery, string> {
  constructor(private readonly catalog: CatalogAdminReader) {}

  async execute(): Promise<string> {
    return catalogCsv(await this.catalog.list());
  }
}
