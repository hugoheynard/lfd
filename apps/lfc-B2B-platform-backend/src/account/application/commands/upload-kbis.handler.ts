import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../infra/events/domain-event-publisher.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../infra/storage/document-store.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ingestKbis } from "./ingest-kbis.js";
import { UploadKbisCommand } from "./upload-kbis.command.js";

/** Dépose le KBIS après le mur (gestionnaire) — la séquence de dépôt est partagée. */
@CommandHandler(UploadKbisCommand)
export class UploadKbisHandler implements ICommandHandler<UploadKbisCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly store: DocumentStore,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
  ) {}

  async execute(command: UploadKbisCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await ingestKbis(
      command.companyId,
      command.fileName,
      command.bytes,
      this.store,
      this.companies,
      this.events,
    );
  }
}
