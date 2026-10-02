import {
  type DoorstepSettingsPayload,
  doorstepSettingsPayloadSchema,
  type DoorstepSettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../platform/shared/http/zod-body.pipe.js";
import { SetDoorstepSettingsCommand } from "../application/commands/set-doorstep-settings.command.js";
import { GetDoorstepSettingsQuery } from "../application/queries/get-doorstep-settings.query.js";

/**
 * **La décision réglée d'avance à la porte**, le réglage GLOBAL
 * (`plan-a-la-porte.md`, B3 bis, LB-Q6) — « Me demander », « Déposer avec
 * photo », « Rapporter ». Sous `delivery_procedures` depuis le 2026-10-02
 * (il était sous `delivery_settings`) : c'est une condition de livraison,
 * comme la procédure et la règle par adresse, et c'est le commercial qui la
 * règle — Hugo : « c'est lui qui supervise les termes et conditions pour les
 * livreurs ». `delivery_settings` lui aurait ouvert véhicules, bacs et point
 * de départ. Une adresse la redéfinit sur la fiche société
 * (`admin/companies/…/doorstep-rule`). Il n'injecte que les bus.
 */
@Controller("admin/livraison/a-la-porte")
@AdminSurface("delivery_procedures")
export class DoorstepSettingsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<DoorstepSettingsView> {
    return this.queries.execute<GetDoorstepSettingsQuery, DoorstepSettingsView>(
      new GetDoorstepSettingsQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async set(
    @Body(new ZodBody(doorstepSettingsPayloadSchema)) payload: DoorstepSettingsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetDoorstepSettingsCommand, void>(
      new SetDoorstepSettingsCommand(payload.rule, staffUserId),
    );
  }
}
