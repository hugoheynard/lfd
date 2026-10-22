import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  CollectionTestNoMandateError,
  CollectionTestMandateNotExportableError,
  NotOwnEstablishmentError,
} from "../../domain/errors/collection-test-errors.js";
import { BankExportWithoutCreditorIdentifierError } from "../../domain/errors/mandate-bank-export-errors.js";
import { CollectionCandidatesReader } from "../../domain/ports/collection-candidates.reader.js";
import { CollectionMandatesReader } from "../../domain/ports/collection-mandates.reader.js";
import { EstablishmentCompaniesReader } from "../../domain/ports/establishment-companies.reader.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import {
  MandatesForBankExportReader,
  type MandateForBankExport,
} from "../../domain/ports/mandates-for-bank-export.reader.js";
import {
  ownSingleMandate,
  type TestMandate,
} from "../../domain/services/collection-test-debtor.js";
import { exportEntityOrFail, mandateBankCsvOf } from "../mandate-bank-export-support.js";
import { establishmentCompanyOrFail } from "../own-establishment-support.js";
import { ExportCollectionTestMandateQuery } from "./collection-test-queries.js";
import type { MandateBankFile } from "./export-mandate-bank-file.handler.js";

/**
 * **Le mandat d'un établissement, pour la banque** — le fichier
 * `ModeleImportMandats` de l'export des mandats (même rendu, même encodage),
 * réduit au seul mandat sous lequel l'essai prélève.
 *
 * 🔴 Une LECTURE : il ne fige aucun export et ne marque rien. L'export groupé
 * de l'entité garde ce mandat « à exporter » tant qu'un de SES exports n'a pas
 * été marqué importé — le fichier de l'essai n'atteste pas que la banque l'a
 * reçu, et le compter comme tel ferait sortir le mandat de l'export groupé
 * sans preuve.
 */
@QueryHandler(ExportCollectionTestMandateQuery)
export class ExportCollectionTestMandateHandler implements IQueryHandler<
  ExportCollectionTestMandateQuery,
  MandateBankFile
> {
  constructor(
    private readonly companies: EstablishmentCompaniesReader,
    private readonly mandates: CollectionMandatesReader,
    private readonly bankMandates: MandatesForBankExportReader,
    private readonly entities: LegalEntityReader,
    private readonly candidates: CollectionCandidatesReader,
  ) {}

  async execute(query: ExportCollectionTestMandateQuery): Promise<MandateBankFile> {
    const company = await establishmentCompanyOrFail(this.companies, query.companyId);
    if (!company.declared) {
      throw new NotOwnEstablishmentError(company.name);
    }
    const carried = await this.mandates.activeFor([company.companyId]);
    const own = ownSingleMandate(
      company.name,
      carried.filter((mandate) => mandate.companyId === company.companyId),
    );
    if (own.kind === "refused") {
      throw own.refusal;
    }
    const entity = await exportEntityOrFail(this.entities, own.mandate.creditorId);
    if (entity.ics === "") {
      throw new BankExportWithoutCreditorIdentifierError(entity.name);
    }
    const mandate = await this.exportable(own.mandate, company.name);
    const csv = await mandateBankCsvOf(this.candidates, entity, [mandate]);
    return { csv, fileName: `ESSAI-mandat-banque-${entity.siren}-${mandate.reference}.csv` };
  }

  /** Le mandat tel que le fichier le porte, ou le refus qui dit pourquoi pas. */
  private async exportable(
    mandate: TestMandate,
    companyName: string,
  ): Promise<MandateForBankExport> {
    const { exportable, excluded } = await this.bankMandates.activeOf(mandate.creditorId);
    const found = exportable.find((each) => each.mandateId === mandate.mandateId);
    if (found !== undefined) {
      return found;
    }
    const exclusion = excluded.find((each) => each.mandateId === mandate.mandateId);
    if (exclusion !== undefined) {
      throw new CollectionTestMandateNotExportableError(mandate.reference, exclusion.reason);
    }
    throw new CollectionTestNoMandateError(companyName);
  }
}
