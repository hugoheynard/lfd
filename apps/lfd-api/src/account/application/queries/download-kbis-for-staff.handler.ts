import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { KbisNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../infra/storage/document-store.js";
import { DownloadKbisForStaffQuery } from "./download-kbis-for-staff.query.js";
import { type KbisDownload } from "./download-kbis.query.js";

/**
 * Sert l'extrait au **staff**. Aucun mur membership — l'`AdminAuthGuard` garde
 * la route en amont, et un commercial n'est membre d'aucune société cliente.
 *
 * Sans cette lecture, la certification du KBIS était un rituel : on demandait
 * à un agent de confirmer avoir vérifié un document que l'application ne lui
 * permettait pas d'ouvrir. La porte d'activation ne vaut que si le document
 * qu'elle exige est lisible là où on la franchit.
 */
@QueryHandler(DownloadKbisForStaffQuery)
export class DownloadKbisForStaffHandler implements IQueryHandler<
  DownloadKbisForStaffQuery,
  KbisDownload
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly store: DocumentStore,
  ) {}

  async execute(query: DownloadKbisForStaffQuery): Promise<KbisDownload> {
    const location = await this.companies.kbisLocation(query.companyId);
    if (location === null) {
      throw new KbisNotFoundError(query.companyId);
    }
    const bytes = await this.store.read(location.storageKey);
    return { fileName: location.fileName, contentType: location.contentType, bytes };
  }
}
