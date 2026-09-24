import {
  type StorefrontPayload,
  storefrontPayloadSchema,
  type StorefrontView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { GetStorefrontQuery } from "../application/get-storefront.query.js";
import { SaveStorefrontCommand } from "../application/save-storefront.command.js";

/**
 * **L'éditeur de la vitrine** — charger, enregistrer (plan
 * `documentation/order/plan-vitrine-enregistrement.md`, D6 et D7).
 *
 * Murée par sa propre ressource, `b2b_storefront` : `GET` demande
 * `b2b_storefront:read`, `PUT` `b2b_storefront:write`. Accordée à `admin` et
 * `communication` — pas à `b2b_settings`, qui ouvrirait la communication aux
 * points de retrait et aux heures limites.
 */
@Controller("admin/storefront")
@AdminSurface("b2b_storefront")
export class AdminStorefrontController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<StorefrontView> {
    return this.queries.execute<GetStorefrontQuery, StorefrontView>(new GetStorefrontQuery());
  }

  /**
   * Enregistre la vitrine ENTIÈRE, et la publie. `PUT` : l'éditeur renvoie tout
   * ce qu'il a chargé, et la révision qui va avec. 409 si quelqu'un a
   * enregistré entre-temps ; l'éditeur relit ensuite (`GET`).
   */
  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(
    @Body(new ZodBody(storefrontPayloadSchema)) payload: StorefrontPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SaveStorefrontCommand, void>(
      new SaveStorefrontCommand(payload, staffUserId),
    );
  }
}
