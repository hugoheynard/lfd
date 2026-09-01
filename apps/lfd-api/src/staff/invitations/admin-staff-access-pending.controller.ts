import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { Controller, Get, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  IssueStaffPasswordLinkCommand,
  ListPendingStaffAccessQuery,
} from "./pending-staff-access.js";
import type { PendingStaffAccessView } from "./pending-staff-access.reader.js";
import type { IssuedPasswordLink } from "../../platform/identity/password-link.js";

/**
 * Les accès **staff** à remettre à la main — jumeau de la surface client, sous
 * son propre mur (`staff`, pas `companies`). Deux annuaires, deux périmètres :
 * lire la file de l'équipe n'a rien à voir avec lire celle des clients.
 *
 * La fabrication du lien est un `POST` : elle **crée** un porteur de droits à
 * usage unique, qu'un `GET` ferait précharger, mettre en cache et ranger dans
 * un historique.
 */
@Controller("admin/staff-access-pending")
@AdminSurface("staff_access")
export class AdminStaffAccessPendingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<readonly PendingStaffAccessView[]> {
    return this.queries.execute<ListPendingStaffAccessQuery, readonly PendingStaffAccessView[]>(
      new ListPendingStaffAccessQuery(),
    );
  }

  @Post(":staffUserId/link")
  issueLink(@Param("staffUserId") staffUserId: string): Promise<IssuedPasswordLink> {
    return this.commands.execute<IssueStaffPasswordLinkCommand, IssuedPasswordLink>(
      new IssueStaffPasswordLinkCommand(staffUserId),
    );
  }
}
