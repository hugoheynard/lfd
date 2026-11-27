import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  optionGroupPayloadSchema,
  type OptionGroupPayload,
  type OptionGroupView,
} from "@lfd/pim-contracts";

import { AdminSurface } from "../../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../../platform/shared/http/intent-key.decorator.js";
import { Idempotent } from "../../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../../platform/shared/http/zod-body.pipe.js";
import { ArchiveOptionGroupCommand } from "../application/archive-option-group.js";
import { CreateOptionGroupCommand } from "../application/create-option-group.js";
import { ListOptionGroupsQuery } from "../application/list-option-groups.js";
import { RestoreOptionGroupCommand } from "../application/restore-option-group.js";
import { UpdateOptionGroupCommand } from "../application/update-option-group.js";

/**
 * Les **options de commande** — groupes et choix (`plan-options-de-commande.md`,
 * § 3.1). Sous le mur du catalogue (`pim_catalog`), comme les allergènes et
 * les ingrédients : régler ce qu'une fiche propose est un geste de catalogue.
 */
@AdminSurface("pim_catalog")
@Controller("option-groups")
export class OptionGroupController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(): Promise<OptionGroupView[]> {
    return this.queries.execute<ListOptionGroupsQuery, OptionGroupView[]>(
      new ListOptionGroupsQuery(),
    );
  }

  /** Une fois par intention : un double clic n'ouvre pas deux groupes. */
  @Post()
  async create(
    @Body(new ZodBody(optionGroupPayloadSchema)) body: OptionGroupPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ) {
    const id = await this.commands.execute<CreateOptionGroupCommand, string>(
      new CreateOptionGroupCommand(body, staffUserId, intentKey),
    );
    return { id };
  }

  @Put(":id")
  @Idempotent("pose le groupe entier : rejouée, rien ne change et le journal se tait")
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(optionGroupPayloadSchema)) body: OptionGroupPayload,
  ) {
    await this.commands.execute<UpdateOptionGroupCommand, void>(
      new UpdateOptionGroupCommand(id, body),
    );
    return { id };
  }

  /** **Archive** le groupe — un groupe ne se supprime pas. */
  @Delete(":id")
  @Idempotent("archive le groupe : rejouée, il l'est déjà et rien ne s'écrit")
  async archive(@Param("id") id: string) {
    await this.commands.execute<ArchiveOptionGroupCommand, void>(new ArchiveOptionGroupCommand(id));
    return { id };
  }

  @Post(":id/restore")
  @Idempotent("remet le groupe en service : rejouée, il l'est déjà et rien ne s'écrit")
  async restore(@Param("id") id: string) {
    await this.commands.execute<RestoreOptionGroupCommand, void>(new RestoreOptionGroupCommand(id));
    return { id };
  }
}
