import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from "@nestjs/cqrs";

import {
  PendingStaffAccessReader,
  type PendingStaffAccessView,
} from "../domain/pending-staff-access.reader.js";
import { StaffIdentityPort } from "../domain/staff-identity.port.js";
import { Clock } from "../../infra/time/clock.js";
import { expiryFrom, type IssuedPasswordLink } from "../../infra/identity/password-link.js";
import { StaffUserNotFoundError } from "../domain/staff-user-errors.js";

/** La file des accès staff à remettre. Aucun paramètre : elle est entière. */
export class ListPendingStaffAccessQuery {}

/** Fabrique un lien de mot de passe **frais** pour un invité de l'équipe. */
export class IssueStaffPasswordLinkCommand {
  constructor(readonly staffUserId: string) {}
}

@QueryHandler(ListPendingStaffAccessQuery)
export class ListPendingStaffAccessHandler implements IQueryHandler<
  ListPendingStaffAccessQuery,
  readonly PendingStaffAccessView[]
> {
  constructor(private readonly pending: PendingStaffAccessReader) {}

  execute(): Promise<readonly PendingStaffAccessView[]> {
    return this.pending.list();
  }
}

/**
 * Le jumeau staff de `IssuePasswordLinkHandler` — mêmes précautions, autre
 * annuaire : on **fabrique** un lien neuf (jamais un lien retrouvé), il ne va
 * que dans la réponse (jamais au journal), et le statut est revalidé par le
 * reader avant de le produire.
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
  ) {}

  async execute(command: IssueStaffPasswordLinkCommand): Promise<IssuedPasswordLink> {
    const subject = await this.pending.subjectOf(command.staffUserId);
    if (subject === null) {
      throw new StaffUserNotFoundError(command.staffUserId);
    }
    const url = await this.identities.issuePasswordLink(subject);
    // Le même calcul que côté client : un seul TTL, une seule vérité.
    return { url, expiresAt: expiryFrom(this.clock.now()) };
  }
}
