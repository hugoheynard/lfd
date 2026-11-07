import type {
  MailDocumentCasePreviewPayload,
  MailDocumentDraftPayload,
  MailDocumentHistoryView,
  MailDocumentPreviewView,
  MailDocumentPublicationView,
  MailDocumentPublishPayload,
  MailDocumentRevertPayload,
  MailDocumentSourcedTrialPayload,
  MailEditorListView,
  MailEditorView,
} from "@lfd/mail-blocks";
import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { SPECIMEN_CASE_ID } from "../../templates/specimens/cases/mail-specimen-case.types.js";
import { PublishMailCopyCommand } from "../../copy/application/commands/publish-mail-copy.command.js";
import { PublishMailDocumentCommand } from "../application/commands/publish-mail-document.command.js";
import { RevertMailDocumentCommand } from "../application/commands/revert-mail-document.command.js";
import { SendMailDocumentTrialCommand } from "../application/commands/send-mail-document-trial.command.js";
import { SaveMailDocumentDraftCommand } from "../application/commands/save-mail-document-draft.command.js";
import { GetMailDocumentHistoryQuery } from "../application/queries/get-mail-document-history.query.js";
import { GetMailTemplateQuery } from "../application/queries/get-mail-template.query.js";
import { ListMailTemplatesQuery } from "../application/queries/list-mail-templates.query.js";
import { PreviewMailDocumentQuery } from "../application/queries/preview-mail-document.query.js";
import {
  mailDocumentDraftPayloadSchema,
  mailDocumentPreviewPayloadSchema,
  mailDocumentPublishPayloadSchema,
  mailDocumentRevertPayloadSchema,
  mailDocumentTrialPayloadSchema,
} from "./mail-template-payloads.js";

/**
 * **L'éditeur d'e-mails par blocs** (plan `plan-editeur-par-blocs.md`, S4c ;
 * branché par S5a), sous le droit `mail_templates` : `read` pour la liste, un
 * e-mail, son historique et son aperçu ; `write` pour enregistrer, publier et
 * revenir au modèle d'origine.
 *
 * Les écritures rendent `204`, ou la version de publication posée : l'écran
 * relit.
 */
@Controller("admin/mail-templates")
@AdminSurface("mail_templates")
export class AdminMailTemplatesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get()
  list(): Promise<MailEditorListView> {
    return this.queries.execute<ListMailTemplatesQuery, MailEditorListView>(
      new ListMailTemplatesQuery(),
    );
  }

  /**
   * Publie les phrases et les ordres de sections en attente de TOUS les
   * e-mails (S5e, § 21) : la commande même de `admin/mail-copy`, seule la
   * garde change. Les brouillons d'arrangement ne partent pas.
   */
  @Post("publications")
  async publishAll(@StaffUserId() staffUserId: string): Promise<MailDocumentPublicationView> {
    const publicationVersion = await this.commands.execute<PublishMailCopyCommand, number>(
      new PublishMailCopyCommand(staffUserId),
    );
    return { publicationVersion };
  }

  /** Ouvre un e-mail : rien n'est écrit, le document de départ est calculé. */
  @Get(":template")
  read(@Param("template") template: string): Promise<MailEditorView> {
    return this.queries.execute<GetMailTemplateQuery, MailEditorView>(
      new GetMailTemplateQuery(template),
    );
  }

  @Get(":template/history")
  history(@Param("template") template: string): Promise<MailDocumentHistoryView> {
    return this.queries.execute<GetMailDocumentHistoryQuery, MailDocumentHistoryView>(
      new GetMailDocumentHistoryQuery(template),
    );
  }

  /** Enregistre le brouillon, sur la révision lue — `409` si quelqu'un a écrit entre-temps. */
  @Put(":template/draft")
  @HttpCode(204)
  async saveDraft(
    @Param("template") template: string,
    @Body(new ZodBody(mailDocumentDraftPayloadSchema)) payload: MailDocumentDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SaveMailDocumentDraftCommand, void>(
      new SaveMailDocumentDraftCommand(
        template,
        payload.document,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }

  /** Publie l'arrangement ET les phrases en attente de cet e-mail, ensemble. */
  @Post(":template/publications")
  async publish(
    @Param("template") template: string,
    @Body(new ZodBody(mailDocumentPublishPayloadSchema)) payload: MailDocumentPublishPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<MailDocumentPublicationView> {
    const publicationVersion = await this.commands.execute<PublishMailDocumentCommand, number>(
      new PublishMailDocumentCommand(template, payload.expectedRevision, staffUserId),
    );
    return { publicationVersion };
  }

  /** Revient au modèle d'origine : retire le document publié et le brouillon. */
  @Post(":template/reverts")
  async revert(
    @Param("template") template: string,
    @Body(new ZodBody(mailDocumentRevertPayloadSchema)) payload: MailDocumentRevertPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<MailDocumentPublicationView> {
    const publicationVersion = await this.commands.execute<RevertMailDocumentCommand, number>(
      new RevertMailDocumentCommand(template, payload.expectedRevision, staffUserId),
    );
    return { publicationVersion };
  }

  /**
   * L'aperçu fidèle — une lecture : un `POST` parce que le document voyage
   * dans le corps. `caseId` choisit le jeu de données (S4d) ; `404` s'il n'est
   * pas un cas de cet e-mail.
   */
  @Post(":template/previews")
  @HttpCode(200)
  @RequirePermission("mail_templates:read")
  preview(
    @Param("template") template: string,
    @Body(new ZodBody(mailDocumentPreviewPayloadSchema)) payload: MailDocumentCasePreviewPayload,
  ): Promise<MailDocumentPreviewView> {
    return this.queries.execute<PreviewMailDocumentQuery, MailDocumentPreviewView>(
      new PreviewMailDocumentQuery(
        template,
        payload.locale,
        payload.source,
        payload.document ?? null,
        payload.caseId,
      ),
    );
  }

  /** « M'envoyer un essai » (S4d) — à l'adresse de la fiche de l'appelant, et à elle seule. */
  @Post(":template/trials")
  @HttpCode(204)
  async trial(
    @Param("template") template: string,
    @Body(new ZodBody(mailDocumentTrialPayloadSchema)) payload: MailDocumentSourcedTrialPayload,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<SendMailDocumentTrialCommand, void>(
      new SendMailDocumentTrialCommand(
        template,
        payload.locale,
        payload.caseId ?? SPECIMEN_CASE_ID,
        staffUserId,
        intentKey,
        payload.source ?? "draft",
      ),
    );
  }
}
