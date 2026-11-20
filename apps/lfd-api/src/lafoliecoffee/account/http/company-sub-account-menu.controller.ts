import {
  type SubAccountMenuPayload,
  subAccountMenuPayloadSchema,
  type SubAccountMenuView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { CurrentUser } from "../../../platform/auth/current-user.decorator.js";
import type { Principal } from "../../../platform/auth/principal.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetSubAccountMenuCommand } from "../application/commands/set-sub-account-menu.command.js";
import { GetSubAccountMenuQuery } from "../application/queries/get-sub-account-menu.query.js";

/**
 * **La carte d'un site**, réglée depuis son compte principal
 * (`documentation/comptes-client/carte-des-sites.md`, § 3.2, § 4). Le
 * mur — propriétaire ou administrateur du principal, jamais un membre du
 * site — vit dans les handlers.
 */
@Controller("companies")
export class CompanySubAccountMenuController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":subAccountId/menu")
  async read(
    @CurrentUser() user: Principal,
    @Param("subAccountId") subAccountId: string,
  ): Promise<SubAccountMenuView> {
    return this.queries.execute<GetSubAccountMenuQuery, SubAccountMenuView>(
      new GetSubAccountMenuQuery(user.userId, subAccountId),
    );
  }

  /** Pose la carte entière ; `204`. */
  @Put(":subAccountId/menu")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose la carte entière : rejouée, la carte est déjà dans cet état et rien n'est écrit, journalisé ni purgé",
  )
  async set(
    @CurrentUser() user: Principal,
    @Param("subAccountId") subAccountId: string,
    @Body(new ZodBody(subAccountMenuPayloadSchema)) payload: SubAccountMenuPayload,
  ): Promise<void> {
    await this.commands.execute<SetSubAccountMenuCommand, void>(
      new SetSubAccountMenuCommand(user.userId, subAccountId, payload),
    );
  }
}
