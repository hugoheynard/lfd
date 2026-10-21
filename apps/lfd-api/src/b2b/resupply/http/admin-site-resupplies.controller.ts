import {
  type AddSiteResupplyLinePayload,
  addSiteResupplyLineSchema,
  type CorrectSiteResupplyLinePayload,
  correctSiteResupplyLineSchema,
  type PlacedSiteResupplyResponse,
  type PlaceSiteResupplyPayload,
  placeSiteResupplySchema,
  RESUPPLY_TARGETS,
  type ResupplyTarget,
  type SeenSiteResupplyVersionPayload,
  seenSiteResupplyVersionSchema,
  type SiteResuppliesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { z } from "zod";

import { AddSiteResupplyLineCommand } from "../application/add-site-resupply-line.command.js";
import { CancelSiteResupplyCommand } from "../application/cancel-site-resupply.command.js";
import { CorrectSiteResupplyLineCommand } from "../application/correct-site-resupply-line.command.js";
import { ListSiteResuppliesQuery } from "../application/list-site-resupplies.query.js";
import { PlaceSiteResupplyCommand } from "../application/place-site-resupply.command.js";
import { SendSiteResupplyCommand } from "../application/send-site-resupply.command.js";
import { WithdrawSiteResupplyLineCommand } from "../application/withdraw-site-resupply-line.command.js";

const targetParamSchema = z.enum(RESUPPLY_TARGETS);

/**
 * **Commander un réassort** — Comptoir › Réassort, pour le point du bandeau
 * (lot R1, `reassort-boutiques/plan-reapprovisionnement.md` §12, 2026-10-21).
 *
 * Sous `handover_counter`, comme la réception : le comptoir du point
 * commande (Hugo : « le comptoir ; on verra la granularité du droit plus
 * tard »). Le point est dans l'URL et dans chaque `where`.
 *
 * Depuis le lot R1c (2026-10-21), la demande en cours d'une visée est
 * enregistrée : on y ajoute (`drafts/:target/lines`), on corrige, on retire,
 * on envoie (`send`) — les trois derniers sous la version vue par le poste.
 * `POST :siteId` reste le geste d'un seul tenant, que le fournil emploie.
 */
@Controller("admin/site-resupplies/sites")
@AdminSurface("handover_counter")
export class AdminSiteResuppliesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Get(":siteId")
  @RequirePermission("handover_counter:read")
  list(@Param("siteId") siteId: string): Promise<SiteResuppliesView> {
    return this.queries.execute<ListSiteResuppliesQuery, SiteResuppliesView>(
      new ListSiteResuppliesQuery(siteId),
    );
  }

  @Post(":siteId")
  @RequirePermission("handover_counter:write")
  async place(
    @Param("siteId") siteId: string,
    @Body(new ZodBody(placeSiteResupplySchema)) body: PlaceSiteResupplyPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<PlaceSiteResupplyCommand, string>(
      new PlaceSiteResupplyCommand(siteId, body.target, body.lines, staffUserId),
    );
    return { id };
  }

  @Post(":siteId/:resupplyId/cancel")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async cancel(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CancelSiteResupplyCommand, void>(
      new CancelSiteResupplyCommand(siteId, resupplyId, staffUserId),
    );
  }

  @Post(":siteId/drafts/:target/lines")
  @RequirePermission("handover_counter:write")
  async addLine(
    @Param("siteId") siteId: string,
    @Param("target", new ZodQuery(targetParamSchema)) target: ResupplyTarget,
    @Body(new ZodBody(addSiteResupplyLineSchema)) body: AddSiteResupplyLinePayload,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<AddSiteResupplyLineCommand, string>(
      new AddSiteResupplyLineCommand(siteId, target, body.sku, body.quantity),
    );
    return { id };
  }

  @Patch(":siteId/:resupplyId/lines/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async correctLine(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(correctSiteResupplyLineSchema)) body: CorrectSiteResupplyLinePayload,
  ): Promise<void> {
    await this.commands.execute<CorrectSiteResupplyLineCommand, void>(
      new CorrectSiteResupplyLineCommand(siteId, resupplyId, sku, body.quantity, body.version),
    );
  }

  @Post(":siteId/:resupplyId/lines/:sku/withdraw")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async withdrawLine(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(seenSiteResupplyVersionSchema)) body: SeenSiteResupplyVersionPayload,
  ): Promise<void> {
    await this.commands.execute<WithdrawSiteResupplyLineCommand, void>(
      new WithdrawSiteResupplyLineCommand(siteId, resupplyId, sku, body.version),
    );
  }

  @Post(":siteId/:resupplyId/send")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  async send(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @Body(new ZodBody(seenSiteResupplyVersionSchema)) body: SeenSiteResupplyVersionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SendSiteResupplyCommand, void>(
      new SendSiteResupplyCommand(siteId, resupplyId, body.version, staffUserId),
    );
  }
}
