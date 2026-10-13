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
 * annuler eux-mêmes, et jusqu'à combien d'heures avant (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.5).
 * Même ressource que l'ouverture de la boutique, `b2b_settings` : la même
 * nature de réglage — ce que la boutique permet au client.
 *
 * `GET` rend la vue ; `PATCH` (`204`) prend `{ openToB2c?, hoursBefore? }`,
 * au moins une clé ; un délai hors de 0 à 168 h est un `400`.
 */
@Controller("admin/customer-cancellation")
@AdminSurface("b2b_settings")
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
