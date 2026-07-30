import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { KbisStore } from "../../domain/ports/kbis-store.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { KbisFile } from "../../domain/value-objects/kbis-file.js";
import { UploadKbisCommand } from "./upload-kbis.command.js";

/** Dépose le KBIS après le mur (gestionnaire) et la validation du fichier. */
@CommandHandler(UploadKbisCommand)
export class UploadKbisHandler implements ICommandHandler<UploadKbisCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly store: KbisStore,
    private readonly companies: CompanyRepository,
  ) {}

  async execute(command: UploadKbisCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    // Le fichier se valide lui-même (PDF par ses octets, taille) avant de partir
    // au stockage : on ne range jamais un fichier douteux.
    const file = KbisFile.create(command.fileName, command.bytes);

    // Ranger d'abord, écrire les métadonnées ensuite : si le stockage échoue,
    // la base ne pointe pas vers un fichier absent.
    const storageKey = await this.store.save(command.companyId, file);
    await this.companies.saveKbisMetadata(command.companyId, {
      storageKey,
      fileName: file.fileName,
      contentType: file.contentType,
      size: file.size,
    });
  }
}
