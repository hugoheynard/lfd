import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type CreatedPickupResponse,
  type PickupAddressPayload,
  pickupAddressPayloadSchema,
  type PickupAddressUpdatePayload,
  pickupAddressUpdatePayloadSchema,
  type PublicPickupSchedulePayload,
  publicPickupSchedulePayloadSchema,
  type PublicPickupScheduleView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetPublicPickupScheduleQuery } from "../application/get-public-pickup-schedule.query.js";
import { SavePublicPickupScheduleCommand } from "../application/save-public-pickup-schedule.command.js";
import {
  CreatePickupAddressCommand,
  RemovePickupAddressCommand,
  SetDefaultPickupAddressCommand,
  UpdatePickupAddressCommand,
} from "../application/pickup-address.commands.js";

/**
 * Gestion **staff** des points de retrait (page Réglages). Ajouter / éditer /
 * Surface staff murée par `@AdminSurface` : identité vérifiée, puis périmètre.
 */
@Controller("admin/pickup-addresses")
@AdminSurface("b2b_settings")
export class AdminPickupAddressesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(pickupAddressPayloadSchema)) payload: PickupAddressPayload,
  ): Promise<CreatedPickupResponse> {
    const id = await this.commands.execute<CreatePickupAddressCommand, string>(
      new CreatePickupAddressCommand(payload),
    );
    return { id };
  }

  /**
   * Schéma de MODIFICATION, sans défaut sur les clientèles : absentes, elles
   * restent telles quelles (plan, D2 — vitruve S2).
   */
  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(pickupAddressUpdatePayloadSchema)) payload: PickupAddressUpdatePayload,
  ): Promise<void> {
    await this.commands.execute<UpdatePickupAddressCommand, void>(
      new UpdatePickupAddressCommand(id, payload),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemovePickupAddressCommand, void>(
      new RemovePickupAddressCommand(id),
    );
  }

  @Patch(":id/default")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setDefault(@Param("id") id: string): Promise<void> {
    await this.commands.execute<SetDefaultPickupAddressCommand, void>(
      new SetDefaultPickupAddressCommand(id),
    );
  }

  /**
   * L'horaire **public** du point — ses plages de créneaux et ses fermetures.
   *
   * 🔴 Une surface à part, et non un champ de plus sur le point : les heures
   * PRO (`opening`) ne sont ni lues ni écrites ici, et ce plan n'y touche pas
   * (`documentation/b2b/plan-creneaux-de-retrait.md`, §3). Un point dont cette
   * route rend deux listes vides se comporte exactement comme avant (D6).
   */
  @Get(":id/creneaux-publics")
  publicSchedule(@Param("id") id: string): Promise<PublicPickupScheduleView> {
    return this.queries.execute<GetPublicPickupScheduleQuery, PublicPickupScheduleView>(
      new GetPublicPickupScheduleQuery(id),
    );
  }

  /**
   * Enregistre l'horaire public **en bloc**. `PUT` idempotent plutôt qu'un CRUD
   * à trois verbes : le chevauchement se juge sur l'ensemble, et l'écran édite
   * une grille entière.
   */
  @Put(":id/creneaux-publics")
  @HttpCode(HttpStatus.NO_CONTENT)
  async savePublicSchedule(
    @Param("id") id: string,
    @Body(new ZodBody(publicPickupSchedulePayloadSchema)) payload: PublicPickupSchedulePayload,
  ): Promise<void> {
    await this.commands.execute<SavePublicPickupScheduleCommand, void>(
      new SavePublicPickupScheduleCommand(id, payload),
    );
  }
}
