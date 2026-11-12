import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { SupportRequestedEvent } from "../../domain/events/support-requested.event.js";

import { OpenSupportRequestExistsError } from "../../domain/errors/account-errors.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { SupportRequestRepository } from "../../domain/ports/support-request.repository.js";
import { ensureCompanyMember } from "../../domain/services/company-access.js";
import { RequestActivationSupportCommand } from "./request-activation-support.command.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { SupportRequestedMail } from "../services/support-requested-mail.service.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { customerIntentActor } from "../../../../lafoliecoffee/shared/intent/customer-intent-actor.js";

/** Le nom stable du geste, dans le registre des intentions. */
const SUPPORT_GESTURE = "account.request-activation-support";

/**
 * Enregistre une demande de support à l'activation.
 *
 * Le mur ne s'applique que si le client **désigne** une société : il faut en être
 * membre. Sans société, la demande porte sur la personne — c'est le cas d'un
 * prospect qui n'a rien encore déclaré, et c'est précisément qui on veut capter.
 *
 * `@sans-journal` le fait existe déjà, et il n'a qu'un seul auteur :
 * `support.requested`, écrit par son abonné (`on-support-activity`) avec le
 * canal demandé, jamais la coordonnée.
 * Ce fait-là reste best-effort, hors de la transaction, comme les faits de
 * commande (plan du journal, lot 1 ; décidé le 2026-09-19).
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant
 * l'écriture et scellée dans sa transaction ; un double envoi rend la demande déjà déposée, sans en déposer une seconde ni écrire deux fois à l'équipe — y compris deux clics simultanés, que la seule lecture « une demande ouverte ? » ne sépare pas.
 * L'acteur est le client (`customer:<id>`).
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre envoi.
 */
@CommandHandler(RequestActivationSupportCommand)
export class RequestActivationSupportHandler implements ICommandHandler<
  RequestActivationSupportCommand,
  string
> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly support: SupportRequestRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly names: AccountJournalNames,
    private readonly uow: UnitOfWork,
    private readonly mail: SupportRequestedMail,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: RequestActivationSupportCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
        key: command.intentKey,
        gesture: SUPPORT_GESTURE,
        subject: intentSubject(command.payload.companyId ?? "personal", command.payload),
      },
      CREATED_ID_REPLAY,
      (seal) => this.request(command, seal),
    );
  }

  private async request(
    command: RequestActivationSupportCommand,
    seal: (requestId: string) => Promise<void>,
  ): Promise<string> {
    const { companyId } = command.payload;
    if (companyId !== null) {
      const role = await this.memberships.roleOf(command.actorUserId, companyId);
      ensureCompanyMember(role, companyId);
    }

    // Une seule demande ouverte à la fois : par société quand il y en a une, par
    // PERSONNE sinon — sans quoi un prospect sans entreprise déposerait autant de
    // rappels qu'il a de clics.
    const scope = { companyId, requestedByUserId: command.actorUserId };
    if (await this.support.hasOpenRequest(scope)) {
      throw new OpenSupportRequestExistsError(companyId ?? command.actorUserId);
    }

    const subjectLabel = await this.names.supportSubject(companyId, command.actorUserId);
    // La demande de contact et le courriel à l'équipe tombent ensemble (S2b,
    // `plan-service-e-mails.md`) : l'e-mail part après la validation, par le
    // bloc `mail`, et un échec de la demande d'e-mail annule le dépôt.
    const id = await this.uow.run(async () => {
      const recorded = await this.support.record(command.actorUserId, command.payload);
      await this.mail.request(recorded, subjectLabel);
      await seal(recorded);
      return recorded;
    });
    // Publié APRÈS l'écriture : le journal est une projection, jamais une
    // condition de la transaction métier.
    this.events.publish(
      new SupportRequestedEvent(
        id,
        companyId,
        command.actorUserId,
        subjectLabel,
        command.payload.channel,
        this.clock.now(),
      ),
    );
    return id;
  }
}
