import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { ProductionDocumentStore } from "../../../../platform/storage/production-document-store.js";
import { ServiceDay } from "../../../day/index.js";
import type { ProductionPaper } from "../../../shared/print/index.js";
import {
  provisionalPdfFileName,
  provisionalPdfKey,
} from "../../domain/entities/provisional-print.js";
import {
  ProvisionalPrintFileMissingError,
  ProvisionalPrintNotFoundError,
} from "../../domain/errors/provisional-print-errors.js";
import { ProvisionalPrintsReader } from "../../domain/ports/provisional-prints.reader.js";
import { GetProvisionalPrintPdfQuery } from "./get-provisional-print-pdf.query.js";

/**
 * Sert le PDF rangé d'une impression provisoire de la journée.
 *
 * @throws {ProvisionalPrintNotFoundError} aucune impression de ce jour sous cet id.
 * @throws {ProvisionalPrintFileMissingError} la ligne existe, le fichier non.
 */
@QueryHandler(GetProvisionalPrintPdfQuery)
export class GetProvisionalPrintPdfHandler implements IQueryHandler<
  GetProvisionalPrintPdfQuery,
  ProductionPaper
> {
  constructor(
    private readonly prints: ProvisionalPrintsReader,
    private readonly documents: ProductionDocumentStore,
  ) {}

  async execute(query: GetProvisionalPrintPdfQuery): Promise<ProductionPaper> {
    const day = ServiceDay.of(query.serviceDay);
    const print = await this.prints.find(day, query.id);
    if (print === null) {
      throw new ProvisionalPrintNotFoundError(day.value, query.id);
    }
    const bytes = await this.documents.readIfPresent(provisionalPdfKey(day.value, print.run));
    if (bytes === null) {
      throw new ProvisionalPrintFileMissingError(day.value, print.run);
    }
    return { bytes, fileName: provisionalPdfFileName(day.value, print.run) };
  }
}
