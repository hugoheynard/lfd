import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import {
  StaffContacts,
  type StaffContact,
} from "../../../../staff/directory/domain/staff-contacts.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import {
  FollowerNotFoundError,
  FollowerSuspendedError,
} from "../../domain/errors/follower-errors.js";
import { CompanyFollowerChangedEvent } from "../../domain/events/company-follower-changed.event.js";
import {
  companyNamed,
  personName,
  personRef,
  type PersonRef,
} from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { AssignCompanyFollowerCommand } from "./assign-company-follower.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const ASSIGN_COMPANY_FOLLOWER_GESTURE = "account.assign-company-follower";

/**
 * **Confie le suivi commercial** d'une fiche, le réattribue ou le retire
 * (`documentation/b2b/plan-suivi-commercial.md`, § 3.1) : la règle (un site n'a
 * pas de suiveur) est celle de `Company.assignFollower`, et le nouveau suiveur
 * doit être une fiche de l'annuaire non suspendue.
 *
 * Le fait `company.follower_changed` part dans la transaction de l'écriture,
 * avec les deux personnes nommées comme elles s'appellent ce jour-là. Un
 * suiveur inchangé n'écrit rien et ne journalise rien.
 *
 * **Une fois par intention** : un double clic ne réattribue pas deux fois.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {FollowerNotFoundError} la personne n'est pas dans l'annuaire.
 * @throws {FollowerSuspendedError} la personne a un accès suspendu.
 * @throws {SiteHasNoFollowerError} la société est un site.
 */
@CommandHandler(AssignCompanyFollowerCommand)
export class AssignCompanyFollowerHandler implements ICommandHandler<
  AssignCompanyFollowerCommand,
  void
> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly staff: StaffContacts,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AssignCompanyFollowerCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ASSIGN_COMPANY_FOLLOWER_GESTURE,
        subject: intentSubject(command.companyId, command.followerStaffId),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.assign(command, seal),
    );
  }

  private async assign(
    command: AssignCompanyFollowerCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const before = company.opening.followerStaffId;
    const cards = await this.staff.contactsOf(
      [before, command.followerStaffId].filter((id): id is string => id !== null),
    );
    if (command.followerStaffId !== null) {
      assignable(command.followerStaffId, cards.get(command.followerStaffId));
    }
    if (!company.assignFollower(command.followerStaffId)) {
      return;
    }
    await this.uow.run(async () => {
      await this.companies.save(company);
      await this.events.publishTraced(
        new CompanyFollowerChangedEvent(
          companyNamed(command.companyId, company),
          cited(before, cards),
          cited(company.opening.followerStaffId, cards),
        ),
      );
      await seal();
    });
  }
}

/** Une fiche de l'annuaire, et non suspendue : sinon, le refus qui nomme le cas. */
function assignable(staffUserId: string, card: StaffContact | undefined): void {
  if (card === undefined) {
    throw new FollowerNotFoundError(staffUserId);
  }
  if (!card.active) {
    throw new FollowerSuspendedError(staffUserId);
  }
}

/** La personne citée sous son nom du jour ; un ancien membre que l'annuaire ne connaît plus, par son id. */
function cited(
  staffUserId: string | null,
  cards: ReadonlyMap<string, StaffContact>,
): PersonRef | null {
  if (staffUserId === null) {
    return null;
  }
  const card = cards.get(staffUserId);
  return personRef(
    staffUserId,
    card === undefined ? null : personName(card.firstName, card.lastName),
  );
}
