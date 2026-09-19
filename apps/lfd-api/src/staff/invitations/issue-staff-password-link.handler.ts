import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { IssueStaffPasswordLinkCommand } from "./issue-staff-password-link.command.js";
import { PendingStaffAccessReader } from "./pending-staff-access.reader.js";
import { StaffIdentityPort } from "./staff-identity.port.js";
import { UnitOfWork } from "../../platform/database/unit-of-work.js";
import { Journal } from "../../platform/journal/journal.js";
import { Clock } from "../../platform/time/clock.js";
import { staffPasswordLinkIssuedFact } from "../directory/domain/staff-facts.js";
import { expiryFrom, type IssuedPasswordLink } from "../../platform/identity/password-link.js";
import { StaffUserNotFoundError } from "../directory/domain/staff-user-errors.js";

/**
 * Le jumeau staff de `IssuePasswordLinkHandler` — mêmes précautions, autre
 * annuaire : on **fabrique** un lien neuf (jamais un lien retrouvé), il ne va
 * que dans la réponse (jamais au journal), et le statut est revalidé par le
 * reader avant de le produire.
 *
 * Le GESTE, lui, est journalisé (`staff_user.password_link_issued`) : un lien
 * remis de la main à la main est un accès ouvert, et « qui l'a fabriqué » doit
 * avoir une réponse. Le fait part seul dans sa transaction, APRÈS l'appel au
 * fournisseur : si le journal tombe, le lien n'est pas rendu, et un nouvel
 * essai en frappe un autre.
 */
@CommandHandler(IssueStaffPasswordLinkCommand)
export class IssueStaffPasswordLinkHandler implements ICommandHandler<
  IssueStaffPasswordLinkCommand,
  IssuedPasswordLink
> {
  constructor(
    private readonly pending: PendingStaffAccessReader,
    private readonly identities: StaffIdentityPort,
    private readonly clock: Clock,
    private readonly journal: Journal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: IssueStaffPasswordLinkCommand): Promise<IssuedPasswordLink> {
    const invitee = await this.pending.pendingOf(command.staffUserId);
    if (invitee === null) {
      throw new StaffUserNotFoundError(command.staffUserId);
    }
    const url = await this.identities.issuePasswordLink(invitee.subject);
    await this.uow.run(() =>
      this.journal.append(staffPasswordLinkIssuedFact(command.staffUserId, invitee)),
    );
    // Le même calcul que côté client : un seul TTL, une seule vérité.
    return { url, expiresAt: expiryFrom(this.clock.now()) };
  }
}
