import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { FunctionSheetNotFoundError } from "../../../event/domain/errors/event-errors.js";
import { FunctionSheetReader } from "../../domain/ports/function-sheet.reader.js";
import { GetFunctionSheetFileQuery } from "./get-function-sheet-file.query.js";

/** Une fiche prête à servir : son nom, son type et ses octets. */
export interface FunctionSheetFile {
  readonly fileName: string;
  readonly contentType: string;
  readonly bytes: Buffer;
}

/**
 * Sert une fiche **en vigueur** : une fiche retirée répond 404, comme une
 * fiche d'un autre événement. Une clé connue en base et absente du stockage
 * est une panne, et se voit (`read`, pas `readIfPresent`).
 */
@QueryHandler(GetFunctionSheetFileQuery)
export class GetFunctionSheetFileHandler implements IQueryHandler<
  GetFunctionSheetFileQuery,
  FunctionSheetFile
> {
  constructor(
    private readonly sheets: FunctionSheetReader,
    private readonly store: ProductionDocumentStore,
  ) {}

  async execute(query: GetFunctionSheetFileQuery): Promise<FunctionSheetFile> {
    const location = await this.sheets.locate(query.eventId, query.sheetId);
    if (location === null) {
      throw new FunctionSheetNotFoundError(query.sheetId);
    }
    const bytes = await this.store.read(location.storageKey);
    return { fileName: location.fileName, contentType: location.contentType, bytes };
  }
}
