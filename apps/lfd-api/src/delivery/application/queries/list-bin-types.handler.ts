import type { BinTypesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BinCatalogReader } from "../../domain/ports/bin-catalog.reader.js";
import { ListBinTypesQuery } from "./list-bin-types.query.js";

/** Le catalogue des bacs, archivés compris, dans l'ordre de création. */
@QueryHandler(ListBinTypesQuery)
export class ListBinTypesHandler implements IQueryHandler<ListBinTypesQuery, BinTypesView> {
  constructor(private readonly catalog: BinCatalogReader) {}

  async execute(): Promise<BinTypesView> {
    return { types: await this.catalog.listTypes() };
  }
}
