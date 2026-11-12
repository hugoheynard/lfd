import type {
  MailCharterDraftPayload,
  MailCharterHistoryView,
  MailCharterPreviewPayload,
  MailCharterPreviewView,
  MailCharterPublicationView,
  MailCharterPublishPayload,
  MailCharterView,
} from "@lfd/mail-blocks";
import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import {
  PublishMailCharterCommand,
  type MailCharterPublication,
} from "../application/commands/publish-mail-charter.command.js";
import { SaveMailCharterDraftCommand } from "../application/commands/save-mail-charter-draft.command.js";
import { GetMailCharterHistoryQuery } from "../application/queries/get-mail-charter-history.query.js";
import { GetMailCharterQuery } from "../application/queries/get-mail-charter.query.js";
import { PreviewMailCharterQuery } from "../application/queries/preview-mail-charter.query.js";
import {
  mailCharterDraftPayloadSchema,
  mailCharterPreviewPayloadSchema,
  mailCharterPublishPayloadSchema,
} from "./mail-charter-payloads.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/**
 * **La charte d'un espace d'e-mails** (plan `plan-editeur-par-blocs.md`,
 * § 25, C1), sous le droit des e-mails, `mail_templates` : `read` pour la
 * lire, son historique et son aperçu ; `write` pour enregistrer et publier.
 * `:space` vaut `lfc` ou `lfd` ; un autre espace est un 404 nommé.
 */
@Controller("admin/mail-charters")
@AdminSurface("mail_templates")
export class AdminMailChartersController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /** Ouvre la charte : rien n'est écrit, la charte de départ est calculée. */
  @Get(":space")
  read(@Param("space") space: string): Promise<MailCharterView> {
    return this.queries.execute<GetMailCharterQuery, MailCharterView>(
      new GetMailCharterQuery(space),
    );
  }

  @Get(":space/history")
  history(@Param("space") space: string): Promise<MailCharterHistoryView> {
    return this.queries.execute<GetMailCharterHistoryQuery, MailCharterHistoryView>(
      new GetMailCharterHistoryQuery(space),
    );
  }

  /** Enregistre le brouillon, sur la révision lue — `409` si quelqu'un a écrit entre-temps. */
  @Put(":space/draft")
  @Idempotent(
    "par sa propre clé : la révision lue ; rejouée, l'enregistrement l'a fait monter et la requête est refusée (409) avant toute écriture",
  )
  @HttpCode(204)
  async saveDraft(
    @Param("space") space: string,
    @Body(new ZodBody(mailCharterDraftPayloadSchema)) payload: MailCharterDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SaveMailCharterDraftCommand, void>(
      new SaveMailCharterDraftCommand(
        space,
        payload.settings,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }

  /** Publie le brouillon : la charte vaut pour les e-mails de l'espace au prochain envoi. */
  @Post(":space/publications")
  @Idempotent(
    "par sa propre clé : la révision lue ; rejouée, la publication l'a fait monter et vidé le brouillon, et la requête est refusée (409) avant de copier le logo au stockage",
  )
  publish(
    @Param("space") space: string,
    @Body(new ZodBody(mailCharterPublishPayloadSchema)) payload: MailCharterPublishPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<MailCharterPublicationView> {
    return this.commands.execute<PublishMailCharterCommand, MailCharterPublication>(
      new PublishMailCharterCommand(space, payload.expectedRevision, staffUserId),
    );
  }

  /** L'aperçu — une lecture : un `POST` parce que les réglages voyagent dans le corps. */
  @Post(":space/previews")
  @Idempotent("rendu pur en POST : compose l'aperçu en mémoire, n'écrit rien et n'envoie rien")
  @HttpCode(200)
  @RequirePermission("mail_templates:read")
  preview(
    @Param("space") space: string,
    @Body(new ZodBody(mailCharterPreviewPayloadSchema)) payload: MailCharterPreviewPayload,
  ): Promise<MailCharterPreviewView> {
    return this.queries.execute<PreviewMailCharterQuery, MailCharterPreviewView>(
      new PreviewMailCharterQuery(
        space,
        payload.template ?? null,
        payload.locale,
        payload.settings ?? null,
      ),
    );
  }
}
