import {
  mailCopyDraftPayloadSchema,
  mailCopyPreviewQuerySchema,
  mailCopyResetPayloadSchema,
  mailCopyTrialPayloadSchema,
  type MailCopyAdminView,
  type MailCopyDraftPayload,
  type MailCopyPreviewQuery,
  type MailCopyPreviewView,
  type MailCopyPublishedView,
  type MailCopyResetPayload,
  type MailCopyTrialPayload,
} from "@lfd/contracts";
import { Body, Controller, Get, HttpCode, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { PublishMailCopyCommand } from "../application/commands/publish-mail-copy.command.js";
import { ResetMailCopyDraftCommand } from "../application/commands/reset-mail-copy-draft.command.js";
import { SaveMailCopyDraftCommand } from "../application/commands/save-mail-copy-draft.command.js";
import { SendMailCopyTrialCommand } from "../application/commands/send-mail-copy-trial.command.js";
import { GetMailCopyAdminQuery } from "../application/queries/get-mail-copy-admin.query.js";
import { GetMailCopyPreviewQuery } from "../application/queries/get-mail-copy-preview.query.js";

/**
 * Édition **staff** des textes des e-mails (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E2) — sous le
 * droit des textes de la boutique, `b2b_storefront` (C7) : `read` pour voir et
 * prévisualiser, `write` pour modifier, publier et s'envoyer un essai.
 *
 * Les écritures rendent `204` : l'écran relit. « Publier » seul rend la
 * version posée — un identifiant, pas un modèle de lecture.
 */
@Controller("admin/mail-copy")
@AdminSurface("b2b_storefront")
export class AdminMailCopyController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<MailCopyAdminView> {
    return this.queries.execute<GetMailCopyAdminQuery, MailCopyAdminView>(
      new GetMailCopyAdminQuery(),
    );
  }

  /** Écrit un brouillon, sur la révision lue — `409` si quelqu'un a écrit entre-temps. */
  @Put("drafts")
  @HttpCode(204)
  async saveDraft(
    @Body(new ZodBody(mailCopyDraftPayloadSchema)) payload: MailCopyDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SaveMailCopyDraftCommand, void>(
      new SaveMailCopyDraftCommand(
        payload.mail,
        payload.path,
        payload.locale,
        payload.text,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }

  /** « Rétablir le texte d'origine » — appliqué au prochain « Publier », pas avant. */
  @Post("resets")
  @HttpCode(204)
  async reset(
    @Body(new ZodBody(mailCopyResetPayloadSchema)) payload: MailCopyResetPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ResetMailCopyDraftCommand, void>(
      new ResetMailCopyDraftCommand(
        payload.mail,
        payload.path,
        payload.locale,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }

  @Post("publications")
  async publish(@StaffUserId() staffUserId: string): Promise<MailCopyPublishedView> {
    const version = await this.commands.execute<PublishMailCopyCommand, number>(
      new PublishMailCopyCommand(staffUserId),
    );
    return { version };
  }

  /** L'aperçu d'un e-mail : son vrai gabarit, des données d'exemple — rien d'écrit, rien d'envoyé. */
  @Get("previews")
  preview(
    @Query(new ZodQuery(mailCopyPreviewQuerySchema)) query: MailCopyPreviewQuery,
  ): Promise<MailCopyPreviewView> {
    return this.queries.execute<GetMailCopyPreviewQuery, MailCopyPreviewView>(
      new GetMailCopyPreviewQuery(query.mail, query.locale, query.source),
    );
  }

  /** « M'envoyer un essai » — à l'adresse de la fiche de l'appelant, et à elle seule. */
  @Post("trials")
  @HttpCode(204)
  async trial(
    @Body(new ZodBody(mailCopyTrialPayloadSchema)) payload: MailCopyTrialPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SendMailCopyTrialCommand, void>(
      new SendMailCopyTrialCommand(payload.mail, payload.locale, payload.source, staffUserId),
    );
  }
}
