import {
  declareOwnEstablishmentPayloadSchema,
  type DeclareOwnEstablishmentPayload,
  type OwnEstablishmentsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { DeclareOwnEstablishmentCommand } from "../application/commands/declare-own-establishment.command.js";
import { WithdrawOwnEstablishmentCommand } from "../application/commands/withdraw-own-establishment.command.js";
import { ListOwnEstablishmentsQuery } from "../application/queries/collection-test-queries.js";

/**
 * **Nos établissements** — les sociétés clientes déclarées « à nous », seules
 * visées par le prélèvement d'essai (plan
 * `documentation/comptabilite/prelevement/plan-prelevement-d-essai.md`, Q1).
 * Sous `collection_test`, comme l'outil qu'elles ouvrent.
 */
@Controller("admin/accounting/own-establishments")
@AdminSurface("collection_test")
export class AdminOwnEstablishmentsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<OwnEstablishmentsView> {
    return this.queries.execute<ListOwnEstablishmentsQuery, OwnEstablishmentsView>(
      new ListOwnEstablishmentsQuery(),
    );
  }

  /** 409 si elle l'est déjà ; 404 si la société n'existe pas. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async declare(
    @StaffUserId() staffUserId: string,
    @Body(new ZodBody(declareOwnEstablishmentPayloadSchema))
    payload: DeclareOwnEstablishmentPayload,
  ): Promise<void> {
    await this.commands.execute<DeclareOwnEstablishmentCommand, void>(
      new DeclareOwnEstablishmentCommand(payload.companyId, staffUserId),
    );
  }

  /** 409 si elle ne l'est pas. */
  @Post(":companyId/withdraw")
  @HttpCode(HttpStatus.NO_CONTENT)
  async withdraw(
    @StaffUserId() staffUserId: string,
    @Param("companyId") companyId: string,
  ): Promise<void> {
    await this.commands.execute<WithdrawOwnEstablishmentCommand, void>(
      new WithdrawOwnEstablishmentCommand(companyId, staffUserId),
    );
  }
}
