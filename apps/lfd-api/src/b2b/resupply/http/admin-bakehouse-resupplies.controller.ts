import {
  type PlacedSiteResupplyResponse,
  type PlaceSiteResupplyPayload,
  placeSiteResupplySchema,
  type ResupplyArticleView,
  type ResupplyUsedNamesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ListResupplyUsedNamesQuery } from "../application/list-resupply-used-names.query.js";
import { ListResupplyArticlesQuery } from "../application/list-resupply-articles.query.js";
import { MarkResupplyMountedCommand } from "../application/mark-resupply-mounted.command.js";
import { SendBakehouseResupplyCommand } from "../application/send-bakehouse-resupply.command.js";

/**
 * **Envoyer un réassort depuis le fournil** — « je t'envoie ça » (lot R1d,
 * `reassort-boutiques/plan-reapprovisionnement.md`, Hugo 2026-10-21).
 *
 * Sous SON droit, `production_resupply` — distinct de `handover_counter` :
 * envoyer depuis le fournil n'est pas tenir le comptoir. Le point est dans
 * l'URL ; le réassort créé l'est sous ce point, à part de la demande en cours
 * du comptoir. Les points proposés se lisent sur `GET
 * /admin/pickup-addresses`, ouvert à ce droit.
 */
@Controller("admin/bakehouse-resupplies")
@AdminSurface("production_resupply")
export class AdminBakehouseResuppliesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les articles proposables : le catalogue publié de la boutique, sans prix. */
  @Get("articles")
  articles(): Promise<readonly ResupplyArticleView[]> {
    return this.queries.execute<ListResupplyArticlesQuery, readonly ResupplyArticleView[]>(
      new ListResupplyArticlesQuery(),
    );
  }

  /** Les noms déjà employés au point, proposés à la saisie (R1g). */
  @Get("sites/:siteId/names")
  names(@Param("siteId") siteId: string): Promise<ResupplyUsedNamesView> {
    return this.queries.execute<ListResupplyUsedNamesQuery, ResupplyUsedNamesView>(
      new ListResupplyUsedNamesQuery(siteId),
    );
  }

  @Post("sites/:siteId")
  async send(
    @Param("siteId") siteId: string,
    @Body(new ZodBody(placeSiteResupplySchema)) body: PlaceSiteResupplyPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<SendBakehouseResupplyCommand, string>(
      new SendBakehouseResupplyCommand(
        siteId,
        body.target,
        body.lines,
        staffUserId,
        body.name ?? null,
      ),
    );
    return { id };
  }

  /**
   * « Monté » (lot R3e) : le réassort d'un point servi sur place est là — la
   * cloche sonne au comptoir. Sous `production_resupply:write`, le droit de
   * l'envoi du fournil. Idempotent : un second « Monté » répond 204 sans rien
   * changer.
   */
  @Post("sites/:siteId/:resupplyId/mounted")
  @HttpCode(HttpStatus.NO_CONTENT)
  async mounted(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<MarkResupplyMountedCommand, void>(
      new MarkResupplyMountedCommand(siteId, resupplyId, staffUserId),
    );
  }
}
