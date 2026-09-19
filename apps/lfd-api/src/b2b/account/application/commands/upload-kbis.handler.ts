import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { KbisUploadedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ingestKbis } from "./ingest-kbis.js";
import { UploadKbisCommand } from "./upload-kbis.command.js";

/**
 * Dépose le KBIS après le mur (gestionnaire) — la séquence de dépôt est partagée.
 *
 * `@hors-transaction` le fichier part d'abord au stockage objet, qui n'a pas de
 * transaction — même motif que `UploadKbisByStaffHandler`. Le fait
 * `company.kbis_uploaded` (le même que chez le staff depuis le 2026-09-19)
 * s'écrit après le dépôt : une panne de journal échoue la requête sans annuler
 * le dépôt, et le fichier se redépose à la même clé.
 */
@CommandHandler(UploadKbisCommand)
export class UploadKbisHandler implements ICommandHandler<UploadKbisCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly store: DocumentStore,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(command: UploadKbisCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    const company = await ingestKbis(
      command.companyId,
      command.fileName,
      command.bytes,
      this.store,
      this.companies,
      this.events,
      this.clock,
    );
    await this.events.publishTraced(new KbisUploadedByMemberEvent(company, command.fileName));
  }
}
