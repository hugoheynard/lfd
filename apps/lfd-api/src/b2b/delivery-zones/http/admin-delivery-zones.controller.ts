import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  type CreatedDeliveryZoneResponse,
  type DeliveryZonePayload,
  deliveryZonePayloadSchema,
  type UncoveredPostalCodeView,
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
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateDeliveryZoneCommand } from "../application/create-delivery-zone.command.js";
import { ListUncoveredPostalCodesQuery } from "../application/list-uncovered-postal-codes.query.js";
import { RemoveDeliveryZoneCommand } from "../application/remove-delivery-zone.command.js";
import { UpdateDeliveryZoneCommand } from "../application/update-delivery-zone.command.js";

/**
 * Gestion **staff** des zones de livraison (Exploitation › Livraison › Zones
 * de livraison). Surface staff murée par `@AdminSurface` : identité vérifiée,
 * puis périmètre — `delivery_fee` depuis le 2026-10-10, sortie de
 * `b2b_settings` : une zone, c'est un frais.
 */
@Controller("admin/delivery-zones")
@AdminSurface("delivery_fee")
export class AdminDeliveryZonesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Les codes postaux d'adresses de livraison qu'aucune zone ne couvre : ces
   * comptes ne peuvent pas être livrés. Lu par l'écran des zones pour proposer
   * d'ajouter un tarif.
   */
  @Get("uncovered-postal-codes")
  uncoveredPostalCodes(): Promise<readonly UncoveredPostalCodeView[]> {
    return this.queries.execute<ListUncoveredPostalCodesQuery, readonly UncoveredPostalCodeView[]>(
      new ListUncoveredPostalCodesQuery(),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodBody(deliveryZonePayloadSchema)) payload: DeliveryZonePayload,
  ): Promise<CreatedDeliveryZoneResponse> {
    const id = await this.commands.execute<CreateDeliveryZoneCommand, string>(
      new CreateDeliveryZoneCommand(payload),
    );
    return { id };
  }

  @Patch(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param("id") id: string,
    @Body(new ZodBody(deliveryZonePayloadSchema)) payload: DeliveryZonePayload,
  ): Promise<void> {
    await this.commands.execute<UpdateDeliveryZoneCommand, void>(
      new UpdateDeliveryZoneCommand(id, payload),
    );
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.commands.execute<RemoveDeliveryZoneCommand, void>(new RemoveDeliveryZoneCommand(id));
  }
}
