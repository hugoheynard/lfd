import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { Controller, Get, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { IssuePasswordLinkCommand } from "../application/commands/issue-password-link.command.js";
import type { IssuedPasswordLink } from "../../../platform/identity/password-link.js";
import { ListPendingAccessQuery } from "../application/queries/list-pending-access.query.js";
import type { PendingAccessView } from "../domain/ports/pending-access.reader.js";

/**
 * Surface **staff** des accès à remettre à la main — le canal de secours quand
 * l'e-mail n'arrive pas.
 *
 * ⚠️ La fabrication du lien est un `POST` et non un `GET`, alors qu'elle « lit »
 * une personne : elle **crée** un porteur de droits à usage unique. Un `GET`
 * serait rejouable par un préchargement de navigateur, mis en cache par un
 * intermédiaire, et rangé dans un historique — trois façons de laisser traîner
 * de quoi prendre un compte.
 */
@Controller("admin/access-pending")
@AdminSurface("b2b_companies")
export class AdminAccessPendingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Qui attend, depuis quand, pour quelle société. Aucun lien ici. */
  @Get()
  list(): Promise<readonly PendingAccessView[]> {
    return this.queries.execute<ListPendingAccessQuery, readonly PendingAccessView[]>(
      new ListPendingAccessQuery(),
    );
  }

  /** Fabrique un lien **frais** à remettre. Jamais journalisé. */
  @Post(":userId/link")
  issueLink(@Param("userId") userId: string): Promise<IssuedPasswordLink> {
    return this.commands.execute<IssuePasswordLinkCommand, IssuedPasswordLink>(
      new IssuePasswordLinkCommand(userId),
    );
  }
}
