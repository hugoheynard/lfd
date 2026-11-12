import {
  type AdminFeatureAccessView,
  type CreatedIdResponse,
  type FeatureExemptionPayload,
  featureExemptionPayloadSchema,
  type FeatureOverridePayload,
  featureOverridePayloadSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddFeatureExemptionCommand } from "../application/commands/add-feature-exemption.command.js";
import { ClearFeatureOverrideCommand } from "../application/commands/clear-feature-override.command.js";
import { RemoveFeatureExemptionCommand } from "../application/commands/remove-feature-exemption.command.js";
import { SetFeatureOverrideCommand } from "../application/commands/set-feature-override.command.js";
import { GetFeatureAccessBoardQuery } from "../application/queries/get-feature-access-board.query.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * Pilotage **staff** de l'accès aux fonctionnalités (`/admin/feature-access`).
 *
 * Ressource `b2b_feature_access` : lecture pour qui la voit, écriture pour
 * `admin` seul — ouvrir ou couper la vente pèse plus qu'une zone de livraison.
 * L'action se déduit du verbe (`@AdminSurface`).
 */
@Controller("admin/feature-access")
@AdminSurface("b2b_feature_access")
export class AdminFeatureAccessController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  board(): Promise<AdminFeatureAccessView> {
    return this.queries.execute<GetFeatureAccessBoardQuery, AdminFeatureAccessView>(
      new GetFeatureAccessBoardQuery(),
    );
  }

  @Put(":key")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose la valeur de la dérogation : rejouée, la même valeur n'est ni réécrite ni journalisée",
  )
  async setOverride(
    @Param("key") key: string,
    @Body(new ZodBody(featureOverridePayloadSchema)) payload: FeatureOverridePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetFeatureOverrideCommand, void>(
      new SetFeatureOverrideCommand(key, payload.value, staffUserId),
    );
  }

  /** Retour au défaut du code : la dérogation est supprimée. */
  @Delete(":key")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "retire la dérogation : rejouée, il n'y en a plus et le geste est refusé (404) sans rien écrire ni journaliser",
  )
  async clearOverride(@Param("key") key: string): Promise<void> {
    await this.commands.execute<ClearFeatureOverrideCommand, void>(
      new ClearFeatureOverrideCommand(key),
    );
  }

  /** Idempotent : une adresse déjà exemptée rend l'id de sa ligne existante. */
  @Post(":key/exemptions")
  @HttpCode(HttpStatus.CREATED)
  async addExemption(
    @Param("key") key: string,
    @Body(new ZodBody(featureExemptionPayloadSchema)) payload: FeatureExemptionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<AddFeatureExemptionCommand, string>(
      new AddFeatureExemptionCommand(key, payload.email, staffUserId),
    );
    return { id };
  }

  @Delete(":key/exemptions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "retire l'exemption : rejouée, elle n'existe plus et le geste est refusé (404) sans rien écrire ni journaliser",
  )
  async removeExemption(@Param("key") key: string, @Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveFeatureExemptionCommand, void>(
      new RemoveFeatureExemptionCommand(key, id),
    );
  }
}
