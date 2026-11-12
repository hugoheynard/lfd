import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { KbisUploadedByStaffEvent } from "../../domain/events/staff-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { UploadKbisByStaffCommand } from "./upload-kbis-by-staff.command.js";
import { ingestKbis, type KbisIngestionPorts } from "./ingest-kbis.js";

/** Le nom stable du geste, dans le registre des intentions. */
const UPLOAD_KBIS_GESTURE = "account.upload-kbis-by-staff";

/**
 * Dépôt de l'extrait par un agent, à la place du client.
 *
 * Handler **staff** (Porte B) des pièces d'activation. Il ne rejoue **aucun mur
 * membership** — l'auth staff (`AdminAuthGuard`) garde la route en amont, et le
 * staff n'est membre d'aucune société. Il délègue directement au même port
 * d'écriture que son homologue client : la logique de persistance n'est écrite
 * qu'une fois, seul le mur diffère.
 *
 * Le fichier part d'abord au stockage objet, hors transaction ; les
 * métadonnées, la trace et l'intention tombent ensemble ensuite.
 *
 * **Une fois par intention** : un dépôt range un fichier neuf, retire la
 * certification et écrit un fait — rejoué, il le referait. La clé de l'écran
 * est réclamée avant tout ; elle se scelle avec les métadonnées et la trace,
 * dans la même transaction. Le sujet est la société et l'empreinte du fichier.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre fichier.
 */
@CommandHandler(UploadKbisByStaffCommand)
export class UploadKbisByStaffHandler implements ICommandHandler<UploadKbisByStaffCommand, void> {
  constructor(
    private readonly store: DocumentStore,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: UploadKbisByStaffCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: UPLOAD_KBIS_GESTURE,
        subject: intentSubject(command.companyId, command.fileName, command.bytes),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        ingestKbis(command, this.ports(), async (company) => {
          await this.events.publishTraced(new KbisUploadedByStaffEvent(company, command.fileName));
          await seal();
        }),
    );
  }

  private ports(): KbisIngestionPorts {
    return {
      store: this.store,
      companies: this.companies,
      events: this.events,
      clock: this.clock,
      ids: this.ids,
      uow: this.uow,
    };
  }
}
