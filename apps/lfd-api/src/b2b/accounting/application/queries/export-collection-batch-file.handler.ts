import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  BatchFileTamperedError,
  CollectionBatchNotFoundError,
} from "../../domain/errors/collection-errors.js";
import { CollectionBatchReader } from "../../domain/ports/collection-batch.reader.js";
import { sha256Of } from "../../domain/services/collection-batch-file.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { collectionBatchFileName } from "../../domain/services/bank-file-names.js";
import { procedureCodeOf } from "../../domain/services/collection-procedure-code.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { ExportCollectionBatchFileQuery } from "./collection-batch-queries.js";

export interface CollectionBatchFile {
  readonly xml: string;
  readonly fileName: string;
}

/**
 * Rend le fichier **stocké** d'un lot, après avoir vérifié son empreinte (plan
 * §2). Deux téléchargements rendent les mêmes octets — c'est tout l'objet du
 * lot figé (T10, T17).
 *
 * Le nom dit la procédure, le schéma, l'échéance et le nombre de débits
 * (`CENET-PRL-261031-M-B2B-echeance-2026-11-05-14-debits.xml`, doc
 * `procedure-de-prelevement.md`, « Les identifiants courts ») ; il dit aussi
 * l'état : `BROUILLON-` pour un lot indéposable, `ANNULE-` pour un lot annulé
 * — un fichier rangé sur un bureau perd son contexte, jamais son nom.
 */
@QueryHandler(ExportCollectionBatchFileQuery)
export class ExportCollectionBatchFileHandler implements IQueryHandler<
  ExportCollectionBatchFileQuery,
  CollectionBatchFile
> {
  constructor(
    private readonly batches: CollectionBatchReader,
    private readonly modeDates: BillingModeDatesReader,
    private readonly payerModes: PayerBillingModesReader,
  ) {}

  async execute(query: ExportCollectionBatchFileQuery): Promise<CollectionBatchFile> {
    const file = await this.batches.file(query.batchId);
    if (file === null) {
      throw new CollectionBatchNotFoundError(query.batchId);
    }
    if (sha256Of(file.xml) !== file.fileSha256) {
      throw new BatchFileTamperedError(file.batchId);
    }
    const calendar = await readInvoicingCalendar(
      { modeDates: this.modeDates, payerModes: this.payerModes },
      file.legalEntityId,
    );
    const closesAt = file.cycleClosesAt;
    const prefix = file.status === "cancelled" ? "ANNULE-" : file.depositable ? "" : "BROUILLON-";
    return {
      xml: file.xml,
      fileName: `${prefix}${collectionBatchFileName({
        procedureCode: procedureCodeOf(closesAt, calendar.modesClosingAt(closesAt)),
        scheme: file.scheme,
        collectionDay: file.collectionDay,
        debitCount: file.debitCount,
      })}`,
    };
  }
}
