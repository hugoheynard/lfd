import {
  type CustomerCancellationSettingsPatch,
  customerCancellationSettingsPatchSchema,
  type CustomerCancellationSettingsView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { UpdateCustomerCancellationSettingsCommand } from "../application/commands/update-customer-cancellation-settings.command.js";
import { GetCustomerCancellationSettingsQuery } from "../application/queries/get-customer-cancellation-settings.query.js";

/**
 * Réglage **staff** « Réglages › Commandes » : les particuliers peuvent-ils
 * annuler eux-mêmes, et jusqu'à combien d'heures avant (doc
 * `documentation/commandes/annulation/annulation-par-le-client.md`, C6.5).
 * Sous `lfc_order_settings` depuis le 2026-10-13, avec l'heure limite : ce
 * que le client peut faire de sa commande, et jusqu'à quand
 * (`documentation/commandes/passation/plan-reglages-commandes.md`, §3.4, lot O1a).
 *
 * `GET` rend la vue ; `PATCH` (`204`) prend `{ delayEnabled?, hoursBefore? }`,
 * au moins une clé ; un délai hors de 0 à 168 h est un `400`.
 */
@Controller("admin/customer-cancellation")
@AdminSurface("lfc_order_settings")
export class AdminCustomerCancellationController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<CustomerCancellationSettingsView> {
    return this.queries.execute<
      GetCustomerCancellationSettingsQuery,
      CustomerCancellationSettingsView
    >(new GetCustomerCancellationSettingsQuery());
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Body(new ZodBody(customerCancellationSettingsPatchSchema))
    patch: CustomerCancellationSettingsPatch,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<UpdateCustomerCancellationSettingsCommand, void>(
      new UpdateCustomerCancellationSettingsCommand(patch, staffUserId),
    );
  }
}
