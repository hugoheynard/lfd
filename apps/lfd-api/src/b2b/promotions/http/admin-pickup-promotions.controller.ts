import {
  archivePromotionPayloadSchema,
  pricingReasonPayloadSchema,
  promotionTermsPayloadSchema,
  revisePromotionPayloadSchema,
  type ArchivePromotionPayload,
  type CreatedIdResponse,
  type PricingReasonPayload,
  type PromotionListView,
  type PromotionTermsPayload,
  type RevisePromotionPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchivePromotionCommand } from "../application/commands/archive-promotion.command.js";
import { PausePromotionCommand } from "../application/commands/pause-promotion.command.js";
import { PosePromotionCommand } from "../application/commands/pose-promotion.command.js";
import { ResumePromotionCommand } from "../application/commands/resume-promotion.command.js";
import { RevisePromotionCommand } from "../application/commands/revise-promotion.command.js";
import { ListPromotionsQuery } from "../application/queries/list-promotions.query.js";
import type { PromotionSurface } from "../domain/promotion-surface.js";
import { promotionTermsOf } from "./promotion-terms.mapper.js";

/**
 * **Les promotions d'UN point de retrait** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9 et § 14 S-droits, lots L7-L8), sous `lfc_site_settings` — la
 * ressource de la fiche d'un site (`PATCH admin/sites/:id`), qui réglait la
 * remise de ce point : qui la réglait la règle encore, rien ne s'ouvre à un
 * autre droit (décision de Hugo du 2026-10-30, qui corrige L7 : la route
 * vivait sous `admin/pickup-addresses`, `b2b_settings`, que l'écran des
 * sites a quittée le 2026-10-13).
 *
 * Seules les promotions « retrait à CE point » s'y touchent ; le geste
 * refuse les autres (`PromotionWrongSurfaceError`). Même verrou que l'écran
 * Promotions : 409 tant que la source n'est pas `promotions`.
 */
@Controller("admin/sites/:pickupId/promotions")
@AdminSurface("lfc_site_settings")
export class AdminPickupPromotionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  list(@Param("pickupId") pickupId: string): Promise<PromotionListView> {
    return this.queries.execute<ListPromotionsQuery, PromotionListView>(
      new ListPromotionsQuery(pickupId),
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async pose(
    @Param("pickupId") pickupId: string,
    @Body(new ZodBody(promotionTermsPayloadSchema)) payload: PromotionTermsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<PosePromotionCommand, string>(
      new PosePromotionCommand(promotionTermsOf(payload), staffUserId, atPoint(pickupId)),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revise(
    @Param("pickupId") pickupId: string,
    @Param("id") id: string,
    @Body(new ZodBody(revisePromotionPayloadSchema)) payload: RevisePromotionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<RevisePromotionCommand, void>(
      new RevisePromotionCommand(
        id,
        promotionTermsOf(payload.terms),
        staffUserId,
        payload.reason,
        atPoint(pickupId),
      ),
    );
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.NO_CONTENT)
  async pause(
    @Param("pickupId") pickupId: string,
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<PausePromotionCommand, void>(
      new PausePromotionCommand(id, staffUserId, payload.reason, atPoint(pickupId)),
    );
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resume(
    @Param("pickupId") pickupId: string,
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ResumePromotionCommand, void>(
      new ResumePromotionCommand(id, staffUserId, payload.reason, atPoint(pickupId)),
    );
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param("pickupId") pickupId: string,
    @Param("id") id: string,
    @Body(new ZodBody(archivePromotionPayloadSchema)) payload: ArchivePromotionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ArchivePromotionCommand, void>(
      new ArchivePromotionCommand(id, staffUserId, payload.reason, atPoint(pickupId)),
    );
  }
}

function atPoint(pickupId: string): PromotionSurface {
  return { kind: "pickup_point", pickupId };
}
