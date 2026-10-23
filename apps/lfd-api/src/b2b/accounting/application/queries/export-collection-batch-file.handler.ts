import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  BatchFileTamperedError,
  CollectionBatchNotFoundError,
} from "../../domain/errors/collection-errors.js";
import {
  CollectionBatchReader,
  type StoredBatchFile,
} from "../../domain/ports/collection-batch.reader.js";
import { sha256Of } from "../../domain/services/collection-batch-file.js";
import { BillingModeDatesReader } from "../../domain/ports/billing-mode-dates.reader.js";
import { PayerBillingModesReader } from "../../domain/ports/payer-billing-modes.reader.js";
import { collectionBatchFileName } from "../../domain/services/bank-file-names.js";
import { procedureCodeOf } from "../../domain/services/collection-procedure-code.js";
import { InvoicePeriodsReader } from "../../domain/ports/invoice-periods.reader.js";
import { readInvoicingCalendar } from "../invoicing-calendar-support.js";
import { procedureRhythmsOf, readLotModesByClosureDay } from "../procedure-rhythms-support.js";
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
    private readonly periods: InvoicePeriodsReader,
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
    // Le lot existe : ses rythmes sont ceux de ses clients (et de ses frères
    // de la même clôture) — aucun compte de clients n'est lu.
    const rhythmsOf = procedureRhythmsOf(
      calendar,
      await readLotModesByClosureDay(
        this.periods,
        calendar,
        await this.batches.list(file.legalEntityId),
      ),
      new Map(),
    );
    const prefix = filePrefixOf(file.status, file.depositable);
    return {
      xml: file.xml,
      fileName: `${prefix}${collectionBatchFileName({
        procedureCode: procedureCodeOf(closesAt, rhythmsOf(closesAt)),
        scheme: file.scheme,
        collectionDay: file.collectionDay,
        debitCount: file.debitCount,
      })}`,
    };
  }
}

/**
 * Le préfixe du nom de fichier : un fichier mort ne doit pas pouvoir être
 * redéposé par mégarde. Un lot rejeté par la banque n'est pas « annulé » —
 * il a été déposé — d'où son propre préfixe.
 */
function filePrefixOf(status: StoredBatchFile["status"], depositable: boolean): string {
  switch (status) {
    case "cancelled":
      return "ANNULE-";
    case "rejected_by_bank":
      return "REJETE-";
    case "constituted":
    case "deposited":
      return depositable ? "" : "BROUILLON-";
  }
}
