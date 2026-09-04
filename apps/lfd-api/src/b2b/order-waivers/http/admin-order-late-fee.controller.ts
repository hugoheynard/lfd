import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import {
  orderLateFeePayloadSchema,
  type OrderLateFeePayload,
  type OrderLateFeeView,
} from "@lfd/contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../../platform/auth/staff-principal.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";
import {
  ClearOrderLateFeeCommand,
  ReadOrderLateFeeQuery,
  SaveOrderLateFeeCommand,
} from "../application/order-late-fee.commands.js";

/**
 * **La surtaxe de commande tardive** — un réglage, une seule valeur.
 *
 * Murée par `b2b_settings` et non par `b2b_order_waivers` : décider **combien**
 * coûte un retard n'est pas décider **qui** peut en accorder un. Le second est
 * un geste de comptoir, pris au téléphone ; le premier est une politique
 * tarifaire de la maison, au même rang que le frais d'une zone de livraison.
 *
 * Il n'injecte que des **bus**, comme toute surface staff. Le réglage n'a ni
 * invariant ni transition — trois handlers pour un CRUD ressemblent à de la
 * cérémonie —, mais la règle ne se plie pas au cas facile : c'est sur les cas
 * faciles qu'une exception s'installe, et `lint:controller-buses` compte une
 * dette qui n'est censée que décroître.
 */
@Controller("admin/order-late-fee")
@AdminSurface("b2b_settings")
export class AdminOrderLateFeeController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Le réglage, ou `null` — aucune surtaxe, ce qui est un choix. */
  @Get()
  async read(): Promise<OrderLateFeeView> {
    const setting = await this.queries.execute<ReadOrderLateFeeQuery, LateFeeSetting | null>(
      new ReadOrderLateFeeQuery(),
    );
    return setting === null
      ? null
      : { fee: setting.adjustment, vatRatePercent: setting.vatRatePercent };
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  async save(
    @Req() request: AuthenticatedStaffRequest,
    @Body(new ZodBody(orderLateFeePayloadSchema)) payload: OrderLateFeePayload,
  ): Promise<void> {
    await this.commands.execute<SaveOrderLateFeeCommand, void>(
      new SaveOrderLateFeeCommand(
        { adjustment: payload.fee, vatRatePercent: payload.vatRatePercent },
        staffUserIdOf(request),
      ),
    );
  }

  /** Retire la surtaxe : les dérogations redeviennent gratuites. */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(): Promise<void> {
    await this.commands.execute<ClearOrderLateFeeCommand, void>(new ClearOrderLateFeeCommand());
  }
}

/** Qui a réglé, résolu par `StaffAccessGuard`. Un montant sans auteur ne se relit pas. */
function staffUserIdOf(request: AuthenticatedStaffRequest): string {
  const staffUserId = request.access?.staffUserId;
  if (staffUserId === undefined || staffUserId === "") {
    throw new UnauthorizedException("Identité staff absente de la requête.");
  }
  return staffUserId;
}
