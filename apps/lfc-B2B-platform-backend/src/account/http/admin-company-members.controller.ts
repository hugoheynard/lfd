import { AdminSurface } from "../../infra/auth/admin-surface.decorator.js";
import {
  inviteCompanyMemberPayloadSchema,
  type CompanyMemberInvitedView,
  type CompanyMemberView,
  type InviteCompanyMemberPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { StaffSub } from "../../infra/auth/staff.decorator.js";
import { ZodBody } from "../../shared/http/zod-body.pipe.js";
import { InviteCompanyMemberCommand } from "../application/commands/invite-company-member.command.js";
import { ListCompanyMembersQuery } from "../application/queries/list-company-members.query.js";

/**
 * Les **accès** à l'espace d'une société, côté staff.
 *
 * Contrôleur distinct des contacts (`company-contacts`) parce que ce sont deux
 * choses : un contact est quelqu'un qu'on appelle, un membre est quelqu'un qui
 * se connecte, commande, et voit les prix négociés. Les mêler ferait d'un
 * carnet d'adresses une liste de droits.
 */
@Controller("admin/companies/:companyId/members")
@AdminSurface("companies")
export class AdminCompanyMembersController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(@Param("companyId") companyId: string): Promise<readonly CompanyMemberView[]> {
    return this.queries.execute<ListCompanyMembersQuery, readonly CompanyMemberView[]>(
      new ListCompanyMembersQuery(companyId),
    );
  }

  /**
   * Ouvre un accès — au détenteur, ou à un collègue.
   *
   * **Idempotent sur l'adresse** : ré-inviter quelqu'un ne crée pas de doublon,
   * ça lui renvoie un lien. C'est exactement ce qu'on veut du bouton
   * « Renvoyer », et ça évite d'avoir deux routes pour un même geste.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  invite(
    @StaffSub() staffSub: string,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(inviteCompanyMemberPayloadSchema)) payload: InviteCompanyMemberPayload,
  ): Promise<CompanyMemberInvitedView> {
    return this.commands.execute<InviteCompanyMemberCommand, CompanyMemberInvitedView>(
      new InviteCompanyMemberCommand(
        companyId,
        payload.email,
        payload.firstName,
        payload.lastName,
        payload.phone,
        payload.role,
        staffSub,
      ),
    );
  }
}
