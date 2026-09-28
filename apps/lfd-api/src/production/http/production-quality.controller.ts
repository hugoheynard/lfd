import {
  type ProductionQualityQuery,
  productionQualityQuerySchema,
  type QualityBoardView,
  type QualityCheckRendered,
  type QualityChecksView,
  type QualityPhotoUploaded,
  qualityPhotoPositionSchema,
  type RenderQualityCheckPayload,
  renderQualityCheckSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import type { Response } from "express";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import type { StoredDocument } from "../../platform/storage/document-store.js";
import { DepositQualityPhotoCommand } from "../application/commands/deposit-quality-photo.command.js";
import { RenderQualityCheckCommand } from "../application/commands/render-quality-check.command.js";
import { GetQualityBoardQuery } from "../application/queries/get-quality-board.query.js";
import { GetQualityPhotoQuery } from "../application/queries/get-quality-photo.query.js";
import { ListQualityChecksQuery } from "../application/queries/list-quality-checks.query.js";
import {
  qualityPhotoUpload,
  serveQualityPhoto,
  type UploadedQualityPhoto,
} from "./quality-photo-http.js";

/**
 * **Le contrôle qualité, depuis la Supervision** (plan
 * `documentation/production/plan-controle-qualite.md`, D3, D8).
 *
 * Le seul GESTE de la Supervision : elle n'agit pas sur la commande, elle la
 * juge (§1). `b2b_supervision:write` est le droit de juger ; les `POST` le
 * demandent par leur verbe.
 *
 * 🔴 **Deux GET exigent `write` explicitement** (`RequirePermission`) : le
 * détail (notes, historique) et les photos. Une photo peut montrer une
 * étiquette, un nom, une adresse ; qui n'a que `read` voit la PASTILLE — la
 * route `GET quality` — et rien d'autre (D3).
 *
 * N'injecte que les bus (`lint:controller-buses`).
 */
@Controller("admin/supervision/quality")
@AdminSurface("b2b_supervision")
export class ProductionQualityController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les pastilles de la journée — `read` suffit. */
  @Get()
  board(
    @Query(new ZodQuery(productionQualityQuerySchema)) query: ProductionQualityQuery,
  ): Promise<QualityBoardView> {
    return this.queries.execute<GetQualityBoardQuery, QualityBoardView>(
      new GetQualityBoardQuery(query.date),
    );
  }

  /** L'historique des verdicts, notes comprises — `write` exigé (D3). */
  @Get("checks")
  @RequirePermission("b2b_supervision:write")
  checks(
    @Query(new ZodQuery(productionQualityQuerySchema)) query: ProductionQualityQuery,
  ): Promise<QualityChecksView> {
    return this.queries.execute<ListQualityChecksQuery, QualityChecksView>(
      new ListQualityChecksQuery(query.date),
    );
  }

  /** Une photo d'un contrôle — `write` exigé (D3). */
  @Get("checks/:checkId/photos/:position")
  @RequirePermission("b2b_supervision:write")
  async photo(
    @Param("checkId") checkId: string,
    @Param("position", new ZodQuery(qualityPhotoPositionSchema)) position: number,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const photo = await this.queries.execute<GetQualityPhotoQuery, StoredDocument>(
      new GetQualityPhotoQuery(checkId, position),
    );
    return serveQualityPhoto(res, photo);
  }

  /** Déposer UNE photo, dès qu'elle est prise (D8) — rend son `uploadId`. */
  @Post("photos")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(qualityPhotoUpload())
  async deposit(
    @UploadedFile() file: UploadedQualityPhoto | undefined,
    @StaffUserId() staffUserId: string,
  ): Promise<QualityPhotoUploaded> {
    const uploadId = await this.commands.execute<DepositQualityPhotoCommand, string>(
      new DepositQualityPhotoCommand(file?.buffer ?? null, staffUserId),
    );
    return { uploadId };
  }

  /** Rendre un verdict — idempotent par `id` (D8). */
  @Post("checks")
  @HttpCode(HttpStatus.CREATED)
  async render(
    @Body(new ZodBody(renderQualityCheckSchema)) payload: RenderQualityCheckPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<QualityCheckRendered> {
    const id = await this.commands.execute<RenderQualityCheckCommand, string>(
      new RenderQualityCheckCommand(
        payload.id,
        payload.serviceDay,
        payload.target,
        payload.verdict,
        payload.note,
        payload.uploadIds,
        staffUserId,
      ),
    );
    return { id };
  }
}
