import {
  shopCopyDraftPayloadSchema,
  shopCopyHistoryQuerySchema,
  shopCopyResetPayloadSchema,
  type ActivityPageView,
  type ShopCopyAdminView,
  type ShopCopyDraftPayload,
  type ShopCopyHistoryQuery,
  type ShopCopyPublishedView,
  type ShopCopyResetPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { PublishShopCopyCommand } from "../application/commands/publish-shop-copy.command.js";
import { ResetShopCopyDraftCommand } from "../application/commands/reset-shop-copy-draft.command.js";
import { SaveShopCopyDraftCommand } from "../application/commands/save-shop-copy-draft.command.js";
import { GetShopCopyAdminQuery } from "../application/queries/get-shop-copy-admin.query.js";
import { GetShopCopyHistoryQuery } from "../application/queries/get-shop-copy-history.query.js";

/**
 * Édition **staff** des textes de la boutique (plan §3, §10) — sous le droit
 * de la vitrine : c'est le même métier, `read` pour voir, `write` pour
 * modifier et publier.
 *
 * Les écritures rendent `204` : l'écran relit. « Publier » seul rend la
 * version posée — un identifiant, pas un modèle de lecture.
 */
@Controller("admin/shop-copy")
@AdminSurface("b2b_storefront")
export class AdminShopCopyController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<ShopCopyAdminView> {
    return this.queries.execute<GetShopCopyAdminQuery, ShopCopyAdminView>(
      new GetShopCopyAdminQuery(),
    );
  }

  /** Écrit un brouillon, sur la révision lue — `409` si quelqu'un a écrit entre-temps. */
  @Put("drafts")
  @HttpCode(204)
  async saveDraft(
    @Body(new ZodBody(shopCopyDraftPayloadSchema)) payload: ShopCopyDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SaveShopCopyDraftCommand, void>(
      new SaveShopCopyDraftCommand(
        payload.key,
        payload.locale,
        payload.text,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }

  /** « Revenir à l'original » — appliqué au prochain « Publier », pas avant. */
  @Post("resets")
  @HttpCode(204)
  async reset(
    @Body(new ZodBody(shopCopyResetPayloadSchema)) payload: ShopCopyResetPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ResetShopCopyDraftCommand, void>(
      new ResetShopCopyDraftCommand(
        payload.key,
        payload.locale,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }

  @Post("publications")
  async publish(@StaffUserId() staffUserId: string): Promise<ShopCopyPublishedView> {
    const version = await this.commands.execute<PublishShopCopyCommand, number>(
      new PublishShopCopyCommand(staffUserId),
    );
    return { version };
  }

  /** Les publications passées, telles que le journal les garde. */
  @Get("publications")
  history(
    @Query(new ZodQuery(shopCopyHistoryQuerySchema)) query: ShopCopyHistoryQuery,
  ): Promise<ActivityPageView> {
    return this.queries.execute<GetShopCopyHistoryQuery, ActivityPageView>(
      new GetShopCopyHistoryQuery(query),
    );
  }
}
