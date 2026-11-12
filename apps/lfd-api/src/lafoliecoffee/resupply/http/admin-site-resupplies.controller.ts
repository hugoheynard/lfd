import {
  type AddSiteResupplyLinePayload,
  addSiteResupplyLineSchema,
  type CorrectSiteResupplyLinePayload,
  correctSiteResupplyLineSchema,
  type NameSiteResupplyPayload,
  nameSiteResupplySchema,
  type PlacedSiteResupplyResponse,
  RESUPPLY_TARGETS,
  type ResupplyTarget,
  type SeenSiteResupplyVersionPayload,
  seenSiteResupplyVersionSchema,
  type SiteResuppliesView,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";

import { AddSiteResupplyLineCommand } from "../application/add-site-resupply-line.command.js";
import { CancelSiteResupplyCommand } from "../application/cancel-site-resupply.command.js";
import { CorrectSiteResupplyLineCommand } from "../application/correct-site-resupply-line.command.js";
import { NameSiteResupplyCommand } from "../application/name-site-resupply.command.js";
import { ListSiteResuppliesQuery } from "../application/list-site-resupplies.query.js";
import { SendSiteResupplyCommand } from "../application/send-site-resupply.command.js";
import { WithdrawSiteResupplyLineCommand } from "../application/withdraw-site-resupply-line.command.js";
import { skuParam } from "./resupply-params.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

const targetParamSchema = z.enum(RESUPPLY_TARGETS);

/**
 * **Commander un réassort** — Comptoir › Réassort, pour le point du bandeau
 * (R1, `reassort-boutiques/README.md`, 2026-10-21).
 *
 * Sous `handover_counter`, comme la réception : le comptoir du point
 * commande (Hugo : « le comptoir ; on verra la granularité du droit plus
 * tard »). Le point est dans l'URL et dans chaque `where`.
 *
 * Depuis le 2026-10-21 (R1c), la demande en cours d'une visée est
 * enregistrée : on y ajoute (`drafts/:target/lines`), on corrige, on retire,
 * on envoie (`send`) — les trois derniers sous la version vue par le poste.
 *
 * Le `POST :siteId` d'un seul tenant, qu'employait le bouton « Lancer un
 * réassort au plus tôt » du fournil, est retiré avec l'envoi du fournil (R1d) : il envoyait la
 * demande DU COMPTOIR. Le fournil envoie désormais les siens à part
 * (`AdminBakehouseResuppliesController`). Annuler un réassort déjà
 * réceptionné est refusé (409).
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

  @Post(":siteId/:resupplyId/cancel")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  @Idempotent(
    "transition : rejouée sur un réassort annulé, il n'est plus passé et l'agrégat refuse (409 ResupplyNotCancellableError) avant toute écriture",
  )
  async cancel(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CancelSiteResupplyCommand, void>(
      new CancelSiteResupplyCommand(siteId, resupplyId, staffUserId),
    );
  }

  /** Ajoute à la demande en cours — une fois par intention (`Idempotency-Key`). */
  @Post(":siteId/drafts/:target/lines")
  @RequirePermission("handover_counter:write")
  async addLine(
    @Param("siteId") siteId: string,
    @Param("target", new ZodParam(targetParamSchema, "target")) target: ResupplyTarget,
    @Body(new ZodBody(addSiteResupplyLineSchema)) body: AddSiteResupplyLinePayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<AddSiteResupplyLineCommand, string>(
      new AddSiteResupplyLineCommand(
        siteId,
        target,
        body.sku,
        body.quantity,
        staffUserId,
        intentKey,
      ),
    );
    return { id };
  }

  /** Nomme la demande en cours de la visée, ouverte au besoin (R1g). */
  @Put(":siteId/drafts/:target/name")
  @RequirePermission("handover_counter:write")
  @Idempotent(
    "pose un nom : rejouée, le brouillon ouvert par le premier appel est retrouvé et reçoit le même nom, sans fait ni effet",
  )
  async name(
    @Param("siteId") siteId: string,
    @Param("target", new ZodParam(targetParamSchema, "target")) target: ResupplyTarget,
    @Body(new ZodBody(nameSiteResupplySchema)) body: NameSiteResupplyPayload,
  ): Promise<PlacedSiteResupplyResponse> {
    const id = await this.commands.execute<NameSiteResupplyCommand, string>(
      new NameSiteResupplyCommand(siteId, target, body.name),
    );
    return { id };
  }

  @Patch(":siteId/:resupplyId/lines/:sku")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  @Idempotent(
    "par sa propre clé : la version lue du brouillon ; rejouée, la correction l'a fait monter et la requête est refusée (409 SiteResupplyChangedMeanwhileError) avant toute écriture",
  )
  async correctLine(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @Param("sku", skuParam()) sku: string,
    @Body(new ZodBody(correctSiteResupplyLineSchema)) body: CorrectSiteResupplyLinePayload,
  ): Promise<void> {
    await this.commands.execute<CorrectSiteResupplyLineCommand, void>(
      new CorrectSiteResupplyLineCommand(siteId, resupplyId, sku, body.quantity, body.version),
    );
  }

  @Post(":siteId/:resupplyId/lines/:sku/withdraw")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  @Idempotent(
    "par sa propre clé : la version lue du brouillon ; rejouée, le retrait l'a fait monter et la requête est refusée (409 SiteResupplyChangedMeanwhileError) avant toute écriture",
  )
  async withdrawLine(
    @Param("siteId") siteId: string,
    @Param("resupplyId") resupplyId: string,
    @Param("sku", skuParam()) sku: string,
    @Body(new ZodBody(seenSiteResupplyVersionSchema)) body: SeenSiteResupplyVersionPayload,
  ): Promise<void> {
    await this.commands.execute<WithdrawSiteResupplyLineCommand, void>(
      new WithdrawSiteResupplyLineCommand(siteId, resupplyId, sku, body.version),
    );
  }

  @Post(":siteId/:resupplyId/send")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("handover_counter:write")
  @Idempotent(
    "par sa propre clé : la version lue ; rejouée, l'envoi qui a suivi cette version est reconnu (isPlacementOf) et le handler rend avant toute écriture",
  )
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
