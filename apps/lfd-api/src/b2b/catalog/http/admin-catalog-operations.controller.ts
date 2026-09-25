import {
  setOperationOverridePayloadSchema,
  type ReceivedOperationView,
  type SetOperationOverridePayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SetOperationOverrideCommand } from "../application/commands/set-operation-override.command.js";
import { ListReceivedOperationsQuery } from "../application/queries/list-received-operations.query.js";

/**
 * **Les opérations datées reçues du référentiel**, et leur surcharge à la
 * réception (D9 de `documentation/order/architecture-operations-datees.md`).
 *
 * `b2b_catalog` et jamais `pim_catalog`, pour la raison que la boîte de
 * réception donne déjà : restreindre ce qui entre en vente est le métier du
 * commercial ; préparer Noël au référentiel ne l'est pas. C'est aussi le droit
 * de `CatalogItemOverride`, dont cette surcharge est la jumelle.
 */
@Controller("admin/catalog/operations")
@AdminSurface("b2b_catalog")
export class AdminCatalogOperationsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Toutes, retirées comprises — l'écran les dit « opération retirée ». */
  @Get()
  list(): Promise<ReceivedOperationView[]> {
    return this.queries.execute<ListReceivedOperationsQuery, ReceivedOperationView[]>(
      new ListReceivedOperationsQuery(),
    );
  }

  /**
   * La surcharge ENTIÈRE, comme l'écran l'affiche. Seule sa forme se refuse :
   * elle se combine au référentiel à la lecture, elle ne s'y confronte pas.
   */
  @Put(":key/override")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setOverride(
    @Param("key") key: string,
    @Body(new ZodBody(setOperationOverridePayloadSchema)) payload: SetOperationOverridePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetOperationOverrideCommand, void>(
      new SetOperationOverrideCommand(
        key,
        {
          isHidden: payload.isHidden,
          orderUntil: payload.orderUntil === null ? null : new Date(payload.orderUntil),
          audience: payload.audience,
          hiddenSkus: payload.hiddenSkus,
        },
        staffUserId,
      ),
    );
  }
}
