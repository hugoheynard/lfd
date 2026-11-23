import type { ExportReaderKeyView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ExportReaderKeyReader } from "../../domain/ports/export-reader-key.reader.js";
import { ListExportReaderKeysQuery } from "./list-export-reader-keys.query.js";

/** Les clés de l'export, les plus récentes d'abord, révoquées comprises. */
@QueryHandler(ListExportReaderKeysQuery)
export class ListExportReaderKeysHandler implements IQueryHandler<
  ListExportReaderKeysQuery,
  ExportReaderKeyView[]
> {
  constructor(private readonly reader: ExportReaderKeyReader) {}

  execute(): Promise<ExportReaderKeyView[]> {
    return this.reader.list();
  }
}
