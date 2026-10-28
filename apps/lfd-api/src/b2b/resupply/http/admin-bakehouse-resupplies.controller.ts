import {
  type BakehouseResupplyDraftView,
  type DiscardBakehouseResupplyDraftPayload,
  discardBakehouseResupplyDraftSchema,
  type SaveBakehouseResupplyDraftPayload,
  saveBakehouseResupplyDraftSchema,
  type SavedBakehouseResupplyDraftResponse,
  type UpdateBakehouseResupplyDraftPayload,
  updateBakehouseResupplyDraftSchema,
  type PlacedSiteResupplyResponse,
  type PlaceSiteResupplyPayload,
  placeSiteResupplySchema,
  type ResupplyArticleView,
  type ResupplyUsedNamesView,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { CreateBakehouseResupplyDraftCommand } from "../application/create-bakehouse-resupply-draft.command.js";
import { DiscardBakehouseResupplyDraftCommand } from "../application/discard-bakehouse-resupply-draft.command.js";
import { ListBakehouseResupplyDraftsQuery } from "../application/list-bakehouse-resupply-drafts.query.js";
import { SaveBakehouseResupplyDraftCommand } from "../application/save-bakehouse-resupply-draft.command.js";
import { SendBakehouseResupplyDraftCommand } from "../application/send-bakehouse-resupply-draft.command.js";
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

  /** Les brouillons ouverts du fournil, le dernier enregistré d'abord. */
  @Get("drafts")
  drafts(): Promise<readonly BakehouseResupplyDraftView[]> {
    return this.queries.execute<
      ListBakehouseResupplyDraftsQuery,
      readonly BakehouseResupplyDraftView[]
    >(new ListBakehouseResupplyDraftsQuery());
  }

  /** « Enregistrer comme brouillon », la première fois. */
  @Post("drafts")
  createDraft(
    @Body(new ZodBody(saveBakehouseResupplyDraftSchema)) body: SaveBakehouseResupplyDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<SavedBakehouseResupplyDraftResponse> {
    return this.commands.execute<
      CreateBakehouseResupplyDraftCommand,
      SavedBakehouseResupplyDraftResponse
    >(new CreateBakehouseResupplyDraftCommand(contentOf(body), staffUserId));
  }

  /** Réécrire un brouillon repris, sous la version lue (409 si périmée). */
  @Put("drafts/:draftId")
  saveDraft(
    @Param("draftId") draftId: string,
    @Body(new ZodBody(updateBakehouseResupplyDraftSchema))
    body: UpdateBakehouseResupplyDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<SavedBakehouseResupplyDraftResponse> {
    return this.commands.execute<
      SaveBakehouseResupplyDraftCommand,
      SavedBakehouseResupplyDraftResponse
    >(new SaveBakehouseResupplyDraftCommand(draftId, contentOf(body), body.version, staffUserId));
  }

  /** « Supprimer le brouillon » : il passe `discarded`, la ligne reste. */
  @Post("drafts/:draftId/discard")
  @HttpCode(HttpStatus.NO_CONTENT)
  async discardDraft(
    @Param("draftId") draftId: string,
    @Body(new ZodBody(discardBakehouseResupplyDraftSchema))
    body: DiscardBakehouseResupplyDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<DiscardBakehouseResupplyDraftCommand, void>(
      new DiscardBakehouseResupplyDraftCommand(draftId, body.version, staffUserId),
    );
  }

  /** Envoyer un brouillon : le contenu de l'écran part, le brouillon passe `sent`. */
  @Post("drafts/:draftId/send")
  async sendDraft(
    @Param("draftId") draftId: string,
    @Body(new ZodBody(updateBakehouseResupplyDraftSchema))
    body: UpdateBakehouseResupplyDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<SendBakehouseResupplyDraftCommand, string>(
      new SendBakehouseResupplyDraftCommand(draftId, contentOf(body), body.version, staffUserId),
    );
    return { id };
  }
}

/** Le contenu du brouillon tel que l'écran l'envoie. */
function contentOf(body: SaveBakehouseResupplyDraftPayload) {
  return { siteId: body.siteId, target: body.target, name: body.name, lines: body.lines };
}
