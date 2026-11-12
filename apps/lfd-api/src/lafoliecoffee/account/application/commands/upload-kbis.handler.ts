import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { KbisUploadedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { DocumentStore } from "../../../../platform/storage/document-store.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { customerIntentActor } from "../../../shared/intent/customer-intent-actor.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ingestKbis, type KbisIngestionPorts } from "./ingest-kbis.js";
import { UploadKbisCommand } from "./upload-kbis.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const UPLOAD_KBIS_GESTURE = "account.upload-kbis";

/**
 * Dépose le KBIS après le mur (gestionnaire) — la séquence de dépôt est partagée.
 *
 * Le fichier part d'abord au stockage objet, qui n'a pas de transaction — même
 * motif que `UploadKbisByStaffHandler`. Le fait `company.kbis_uploaded` (le
 * même que chez le staff) s'écrit dans la transaction des métadonnées.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée après le mur et
 * scellée avec le dépôt ; un double envoi ne range pas un second fichier, ne
 * réécrit pas le dépôt, n'écrit pas un second fait. L'acteur est le client
 * (`customer:<id>`), le sujet la société et l'empreinte du fichier.
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre fichier.
 */
@CommandHandler(UploadKbisCommand)
export class UploadKbisHandler implements ICommandHandler<UploadKbisCommand, void> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly store: DocumentStore,
    private readonly companies: CompanyRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: UploadKbisCommand): Promise<void> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);

    await this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
        key: command.intentKey,
        gesture: UPLOAD_KBIS_GESTURE,
        subject: intentSubject(command.companyId, command.fileName, command.bytes),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        ingestKbis(command, this.ports(), async (company) => {
          await this.events.publishTraced(new KbisUploadedByMemberEvent(company, command.fileName));
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
