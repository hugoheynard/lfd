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
  type PromotionView,
  type PromotionsSourceView,
  type RevisePromotionPayload,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ArchivePromotionCommand } from "../application/commands/archive-promotion.command.js";
import { PausePromotionCommand } from "../application/commands/pause-promotion.command.js";
import { PosePromotionCommand } from "../application/commands/pose-promotion.command.js";
import { ResumePromotionCommand } from "../application/commands/resume-promotion.command.js";
import { RevisePromotionCommand } from "../application/commands/revise-promotion.command.js";
import { GetPromotionQuery } from "../application/queries/get-promotion.query.js";
import { GetPromotionsSourceQuery } from "../application/queries/get-promotions-source.query.js";
import { ListPromotionsQuery } from "../application/queries/list-promotions.query.js";
import { PRICING_SURFACE } from "../domain/promotion-surface.js";
import { promotionTermsOf } from "./promotion-terms.mapper.js";

/**
 * **L'écran Promotions** (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lots L7-L8), sous `b2b_pricing` — la ressource des règles de prix :
 * qui posait une règle d'étage promotion pose une promotion.
 *
 * Les promotions de retrait à UN point s'écrivent depuis ce point, sous
 * `lfc_site_settings` (`AdminPickupPromotionsController`) ; ici, le geste les
 * refuse (`PromotionWrongSurfaceError`). Les deux lectures s'ouvrent à l'un
 * OU l'autre droit : chacun voit ce que l'autre a posé.
 *
 * Depuis L12, `promotions_source` ne vaut plus que `promotions` : l'écran
 * écrit toujours, et les refus d'écriture sont ceux de l'agrégat et de
 * `PromotionWriteGuard` (vérifié le 2026-10-30, `promotions-source.ts`).
 */
@Controller("admin/promotions")
@AdminSurface("b2b_pricing")
export class AdminPromotionsController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * Toutes, archivées comprises ; `pickupId` restreint à celles de ce point,
   * `companyId` à celles dont le public nomme cette société.
   */
  @Get()
  @RequireAnyPermission("b2b_pricing:read", "lfc_site_settings:read")
  list(
    @Query("pickupId") pickupId: string | undefined,
    @Query("companyId") companyId: string | undefined,
  ): Promise<PromotionListView> {
    return this.queries.execute<ListPromotionsQuery, PromotionListView>(
      new ListPromotionsQuery(presentOrNull(pickupId), presentOrNull(companyId)),
    );
  }

  /**
   * La source seule — lue par les anciens éditeurs, dont les droits sont ceux
   * de la grille (`b2b_settings`) et de la fiche d'un site. Déclarée AVANT
   * `:id`, qui l'avalerait sinon.
   */
  @Get("source")
  @RequireAnyPermission("b2b_pricing:read", "lfc_site_settings:read", "b2b_settings:read")
  source(): Promise<PromotionsSourceView> {
    return this.queries.execute<GetPromotionsSourceQuery, PromotionsSourceView>(
      new GetPromotionsSourceQuery(),
    );
  }

  @Get(":id")
  @RequireAnyPermission("b2b_pricing:read", "lfc_site_settings:read")
  get(@Param("id") id: string): Promise<PromotionView> {
    return this.queries.execute<GetPromotionQuery, PromotionView>(new GetPromotionQuery(id));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async pose(
    @Body(new ZodBody(promotionTermsPayloadSchema)) payload: PromotionTermsPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<CreatedIdResponse> {
    const id = await this.commands.execute<PosePromotionCommand, string>(
      new PosePromotionCommand(promotionTermsOf(payload), staffUserId, PRICING_SURFACE),
    );
    return { id };
  }

  @Put(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revise(
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
        PRICING_SURFACE,
      ),
    );
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.NO_CONTENT)
  async pause(
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<PausePromotionCommand, void>(
      new PausePromotionCommand(id, staffUserId, payload.reason, PRICING_SURFACE),
    );
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resume(
    @Param("id") id: string,
    @Body(new ZodBody(pricingReasonPayloadSchema)) payload: PricingReasonPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ResumePromotionCommand, void>(
      new ResumePromotionCommand(id, staffUserId, payload.reason, PRICING_SURFACE),
    );
  }

  @Post(":id/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(
    @Param("id") id: string,
    @Body(new ZodBody(archivePromotionPayloadSchema)) payload: ArchivePromotionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ArchivePromotionCommand, void>(
      new ArchivePromotionCommand(id, staffUserId, payload.reason, PRICING_SURFACE),
    );
  }
}

/** Un paramètre de requête absent ou vide ne filtre pas. */
function presentOrNull(value: string | undefined): string | null {
  return value === undefined || value === "" ? null : value;
}
