import {
  carryOverMercurialeLinePayloadSchema,
  type AmendedMercurialeResponse,
  type CarryOverMercurialeLinePayload,
  type SaleReferenceDecisionView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CarryOverMercurialeLineCommand } from "../application/commands/carry-over-mercuriale-line.command.js";
import { ListSaleReferenceDecisionsQuery } from "../application/queries/list-sale-reference-decisions.query.js";

/**
 * **Les décisions tarifaires debout sur une référence de vente**
 * (`plan-pro-voit-les-declinaisons.md`, L7) — la liste que la fiche née d'un
 * détachement montre pour son ancienne référence, et le geste qui reporte
 * une mercuriale sur la nouvelle (`plan-tarif-date-sur-une-reference.md`, § 6).
 */
@Controller("admin/pricing/sale-references")
@AdminSurface("b2b_pricing")
export class AdminSaleReferenceDecisionsController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get(":sku/decisions")
  async list(@Param("sku") sku: string): Promise<readonly SaleReferenceDecisionView[]> {
    return this.queries.execute<
      ListSaleReferenceDecisionsQuery,
      readonly SaleReferenceDecisionView[]
    >(new ListSaleReferenceDecisionsQuery(sku));
  }

  /**
   * **Reporter** le prix que l'ancienne référence `:sku` porte dans cette
   * mercuriale sur la nouvelle (`toSku`) — un avenant daté. Rend son
   * identifiant ; l'écran relit la liste ensuite.
   */
  @Post(":sku/decisions/mercuriales/:mercurialeId/carry-over")
  @HttpCode(HttpStatus.CREATED)
  async carryOver(
    @Param("sku") sku: string,
    @Param("mercurialeId") mercurialeId: string,
    @Body(new ZodBody(carryOverMercurialeLinePayloadSchema))
    payload: CarryOverMercurialeLinePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<AmendedMercurialeResponse> {
    const amendmentId = await this.commands.execute<CarryOverMercurialeLineCommand, string>(
      new CarryOverMercurialeLineCommand(
        mercurialeId,
        sku,
        payload.toSku,
        payload.reason,
        staffUserId,
      ),
    );
    return { amendmentId };
  }
}
