import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import {
  setPayerCollectionMeansPayloadSchema,
  type PayerCollectionMeansView,
  type SetPayerCollectionMeansPayload,
} from "@lfd/contracts";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CancelPayerCollectionMeansCommand } from "../application/commands/cancel-payer-collection-means.command.js";
import { SetPayerCollectionMeansCommand } from "../application/commands/set-payer-collection-means.command.js";
import { GetPayerCollectionMeansQuery } from "../application/queries/get-payer-collection-means.query.js";

/**
 * **Le moyen d'encaissement d'un payeur** — prélèvement ou virement (plan
 * `plan-paiement-au-compte-par-virement.md`, V1, V2, V10), à côté de son mode.
 *
 * Lire : `b2b_accounting:read`. Changer ou annuler : `b2b_collection_means:write`,
 * un geste à part — il arrête ou démarre un prélèvement. Un site qui suit son
 * principal se lit (moyen du principal) mais ne se change pas (409).
 */
@Controller("admin/accounting/legal-entities")
@AdminSurface("b2b_accounting")
export class AdminPayerCollectionMeansController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Le moyen en vigueur, depuis quand, et le programmé. */
  @Get(":id/payers/:companyId/collection-means")
  async read(
    @Param("id") id: string,
    @Param("companyId") companyId: string,
  ): Promise<PayerCollectionMeansView> {
    return this.queries.execute<GetPayerCollectionMeansQuery, PayerCollectionMeansView>(
      new GetPayerCollectionMeansQuery(id, companyId),
    );
  }

  /**
   * Change le moyen — 409 s'il en est déjà programmé un autre, pendant un
   * retour bancaire, ou pour un site facturé chez un autre ; 400 sans motif.
   */
  @Put(":id/payers/:companyId/collection-means")
  @RequirePermission("b2b_collection_means:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "le même moyen redemandé — déjà en vigueur ou déjà programmé — n'écrit rien (204) : un rejeu ne double pas le segment",
  )
  async change(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("companyId") companyId: string,
    @Body(new ZodBody(setPayerCollectionMeansPayloadSchema))
    payload: SetPayerCollectionMeansPayload,
  ): Promise<void> {
    await this.commands.execute(
      new SetPayerCollectionMeansCommand(id, companyId, payload.means, payload.reason, staffUserId),
    );
  }

  /** Annule le moyen programmé — 409 si rien n'est programmé. */
  @Delete(":id/payers/:companyId/collection-means/scheduled")
  @RequirePermission("b2b_collection_means:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "un rejeu ne trouve plus rien de programmé : 409, rien n'est réécrit ni annulé deux fois",
  )
  async cancel(
    @StaffUserId() staffUserId: string,
    @Param("id") id: string,
    @Param("companyId") companyId: string,
  ): Promise<void> {
    await this.commands.execute(new CancelPayerCollectionMeansCommand(id, companyId, staffUserId));
  }
}
