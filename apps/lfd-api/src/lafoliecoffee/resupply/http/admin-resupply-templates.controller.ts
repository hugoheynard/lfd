import {
  type AdjustResupplyTemplatePayload,
  adjustResupplyTemplateSchema,
  type CreateResupplyTemplatePayload,
  createResupplyTemplateSchema,
  type ResupplyTemplateContentPayload,
  type ResupplyTemplateView,
  type SavedResupplyTemplateResponse,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
} from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AdjustResupplyTemplateCommand } from "../application/adjust-resupply-template.command.js";
import { ArchiveResupplyTemplateCommand } from "../application/archive-resupply-template.command.js";
import { CreateResupplyTemplateCommand } from "../application/create-resupply-template.command.js";
import { ListResupplyTemplatesQuery } from "../application/list-resupply-templates.query.js";
import type { ResupplyTemplateContent } from "../domain/resupply-template.js";

/**
 * **La bibliothèque des modèles de réassort d'un point** (plan
 * `documentation/reassort-boutiques/commander.md § 6`, § 5).
 *
 * Sous `resupply_templates` (M2) pour créer, ajuster, archiver. La lecture
 * s'ouvre aussi au comptoir (`handover_counter:read`) et au fournil
 * (`production_resupply:read`), qui appliquent les modèles (M4) — sans rien
 * élargir : ces deux droits lisent déjà tout point sur leurs propres routes.
 */
@Controller("admin/resupply-templates")
@AdminSurface("resupply_templates")
export class AdminResupplyTemplatesController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les modèles actifs du point, lignes inapplicables marquées. */
  @Get("sites/:siteId")
  @RequireAnyPermission(
    "resupply_templates:read",
    "handover_counter:read",
    "production_resupply:read",
  )
  list(@Param("siteId") siteId: string): Promise<readonly ResupplyTemplateView[]> {
    return this.queries.execute<ListResupplyTemplatesQuery, readonly ResupplyTemplateView[]>(
      new ListResupplyTemplatesQuery(siteId),
    );
  }

  /** « Enregistrer comme modèle ». */
  @Post("sites/:siteId")
  @Idempotent(
    "par sa propre clé : la clé du modèle fournie par l'écran ; rejouée, le modèle déjà écrit sous cette clé est rendu tel quel sans rien réécrire",
  )
  create(
    @Param("siteId") siteId: string,
    @Body(new ZodBody(createResupplyTemplateSchema)) body: CreateResupplyTemplatePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<SavedResupplyTemplateResponse> {
    return this.commands.execute<CreateResupplyTemplateCommand, SavedResupplyTemplateResponse>(
      new CreateResupplyTemplateCommand(siteId, contentOf(body), staffUserId, body.key),
    );
  }

  /** Ajuster : le contenu entier, sous la version lue (409 si périmée). */
  @Put(":templateId")
  @Idempotent(
    "par sa propre clé : la version lue du modèle ; rejouée, l'ajustement l'a fait monter et la requête est refusée (409 ResupplyTemplateChangedMeanwhileError) avant toute écriture",
  )
  adjust(
    @Param("templateId") templateId: string,
    @Body(new ZodBody(adjustResupplyTemplateSchema)) body: AdjustResupplyTemplatePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<SavedResupplyTemplateResponse> {
    return this.commands.execute<AdjustResupplyTemplateCommand, SavedResupplyTemplateResponse>(
      new AdjustResupplyTemplateCommand(templateId, contentOf(body), body.version, staffUserId),
    );
  }

  /** Archiver : le modèle quitte la bibliothèque, la ligne reste. */
  @Post(":templateId/archive")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Idempotent(
    "transition : rejouée sur un modèle archivé, l'agrégat refuse (409 ResupplyTemplateArchivedError) avant toute écriture",
  )
  async archive(
    @Param("templateId") templateId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ArchiveResupplyTemplateCommand, void>(
      new ArchiveResupplyTemplateCommand(templateId, staffUserId),
    );
  }
}

/** Le contenu du modèle tel que l'écran l'envoie. */
function contentOf(body: ResupplyTemplateContentPayload): ResupplyTemplateContent {
  return { name: body.name, target: body.target, lines: body.lines };
}
