import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { ContactAddedByMemberEvent } from "../../domain/events/member-acts.event.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { MembershipReader } from "../../domain/ports/membership.reader.js";
import { ensureCompanyAdmin } from "../../domain/services/company-access.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { AddCompanyContactCommand } from "./contact-commands.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { contactRef } from "../../domain/events/journal-names.js";
import { CONTACT_ADDED } from "../../domain/events/site-gesture.fact.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { customerIntentActor } from "../../../shared/intent/customer-intent-actor.js";

/** Le nom stable du geste, dans le registre des intentions. */
const ADD_CONTACT_GESTURE = "account.add-company-contact";

/**
 * Ajoute un contact additionnel à une entreprise, réservé à son gestionnaire.
 *
 * Journalisé dans la transaction de l'écriture depuis le 2026-09-19 (plan
 * `documentation/journalisation/plan-journal-d-activite.md` §3, décision 1) —
 * sous le nom du geste staff jumeau, sans coordonnée.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée après le mur et
 * scellée dans la transaction de l'écriture ; un double envoi rend le contact déjà ajouté,
 * sans second contact ni second fait. L'acteur est le client (`customer:<id>`).
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour une autre saisie.
 */
@CommandHandler(AddCompanyContactCommand)
export class AddCompanyContactHandler implements ICommandHandler<AddCompanyContactCommand, string> {
  constructor(
    private readonly memberships: MembershipReader,
    private readonly book: CompanyContactBook,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
    private readonly gestures: SiteGesturePublisher,
    private readonly intents: OncePerIntent,
  ) {}

  async execute(command: AddCompanyContactCommand): Promise<string> {
    const role = await this.memberships.roleOf(command.actorUserId, command.companyId);
    ensureCompanyAdmin(role, command.companyId);
    return this.intents.runSealed(
      {
        actorId: customerIntentActor(command.actorUserId),
        key: command.intentKey,
        gesture: ADD_CONTACT_GESTURE,
        subject: intentSubject(command.companyId, command.details, command.role),
      },
      CREATED_ID_REPLAY,
      (seal) => this.add(command, seal),
    );
  }

  private async add(
    command: AddCompanyContactCommand,
    seal: (contactId: string) => Promise<void>,
  ): Promise<string> {
    const details = ContactDetails.create(command.details);
    const company = await this.names.company(command.companyId);
    return this.uow.run(async () => {
      const contactId = await this.book.add(command.companyId, details, command.role);
      await this.gestures.publish({
        type: CONTACT_ADDED,
        site: company,
        subjectId: contactId,
        actor: { kind: "customer", userId: command.actorUserId },
      });
      await this.events.publishTraced(
        new ContactAddedByMemberEvent(company, contactRef(contactId, details), command.role),
      );
      await seal(contactId);
      return contactId;
    });
  }
}
