import {
  counterAccountCeilingPayloadSchema,
  type CounterAccountCeilingPayload,
  type CounterAccountCeilingView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetCounterAccountCeilingCommand } from "../application/commands/set-counter-account-ceiling.command.js";
import { GetCounterAccountCeilingQuery } from "../application/queries/get-counter-account-ceiling.query.js";

/**
 * Réglage **staff** du plafond des comptes ouverts au comptoir
 * (`plan-comptes-du-comptoir.md`, § 3.3), sous `lfc_order_settings` comme les
 * autres réglages des commandes (heure limite, annulation par le client,
 * stock du comptoir).
 *
 * `GET` rend la vue ; `PUT` (`204`) prend `{ ceilingCents }`, un entier ou
 * `null` (aucun plafond) ; un montant négatif est un `400`.
 */
@Controller("admin/counter-account-ceiling")
@AdminSurface("lfc_order_settings")
export class AdminCounterAccountCeilingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  read(): Promise<CounterAccountCeilingView> {
    return this.queries.execute<GetCounterAccountCeilingQuery, CounterAccountCeilingView>(
      new GetCounterAccountCeilingQuery(),
    );
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "pose une valeur : rejouée, la même requête repose le même plafond (seuls l'horodatage et l'auteur avancent), sans fait ni effet",
  )
  async update(
    @Body(new ZodBody(counterAccountCeilingPayloadSchema)) payload: CounterAccountCeilingPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetCounterAccountCeilingCommand, void>(
      new SetCounterAccountCeilingCommand(payload.ceilingCents, staffUserId),
    );
  }
}
