import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { KbisNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { KbisStore } from "../../domain/ports/kbis-store.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { DownloadKbisQuery, type KbisDownload } from "./download-kbis.query.js";

/**
 * Sert le KBIS à tout **membre** de l'entreprise (voir/télécharger).
 *
 * Une lecture qui ne mute rien, mais qui reste **murée** : c'est le fichier légal
 * d'une entreprise, seul l'un de ses membres y accède. Un non-membre reçoit un 404
 * (l'entreprise lui est « introuvable »), pas la moindre confirmation d'existence.
 */
@QueryHandler(DownloadKbisQuery)
export class DownloadKbisHandler implements IQueryHandler<DownloadKbisQuery, KbisDownload> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly companies: CompanyRepository,
    private readonly store: KbisStore,
  ) {}

  async execute(query: DownloadKbisQuery): Promise<KbisDownload> {
    const role = await this.memberships.roleOf(query.actorUserId, query.companyId);
    ensureCompanyMember(role, query.companyId);

    const location = await this.companies.kbisLocation(query.companyId);
    if (location === null) {
      throw new KbisNotFoundError(query.companyId);
    }

    const bytes = await this.store.read(location.storageKey);
    return { fileName: location.fileName, contentType: location.contentType, bytes };
  }
}
