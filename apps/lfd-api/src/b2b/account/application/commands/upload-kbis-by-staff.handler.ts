import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { KbisUploadedByStaffEvent } from "../../domain/events/staff-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { UploadKbisByStaffCommand } from "./upload-kbis-by-staff.command.js";
import { ingestKbis } from "./ingest-kbis.js";

/**
 * Dépôt de l'extrait par un agent, à la place du client.
 *
 * Handler **staff** (Porte B) des pièces d'activation. Il ne rejoue **aucun mur
 * membership** — l'auth staff (`AdminAuthGuard`) garde la route en amont, et le
 * staff n'est membre d'aucune société. Il délègue directement au même port
 * d'écriture que son homologue client : la logique de persistance n'est écrite
 * qu'une fois, seul le mur diffère.
 *
 * `@hors-transaction` le fichier part d'abord au stockage objet, qui n'a pas de
 * transaction. Enfermer cet aller-retour réseau dans celle de la base coûterait
 * plus que le trou qu'il refermerait : une panne de journal échoue la requête
 * sans annuler le dépôt — l'agent le voit, et le fichier se redépose à la même
 * clé.
 */
@CommandHandler(UploadKbisByStaffCommand)
export class UploadKbisByStaffHandler implements ICommandHandler<UploadKbisByStaffCommand, void> {
  constructor(
    private readonly store: DocumentStore,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(command: UploadKbisByStaffCommand): Promise<void> {
    const company = await ingestKbis(
      command.companyId,
      command.fileName,
      command.bytes,
      this.store,
      this.companies,
      this.events,
      this.clock,
    );
    // Tracé APRÈS, et hors transaction — seul acte du lot dans ce cas. Le dépôt
    // range d'abord le fichier au stockage objet, qui n'a pas de transaction :
    // enfermer cet aller-retour réseau dans celle de la base serait pire que le
    // trou qu'on refermerait. Une panne de journal échoue donc la requête sans
    // annuler le dépôt — l'agent le voit, et le fichier se redépose.
    await this.events.publishTraced(new KbisUploadedByStaffEvent(company, command.fileName));
  }
}
