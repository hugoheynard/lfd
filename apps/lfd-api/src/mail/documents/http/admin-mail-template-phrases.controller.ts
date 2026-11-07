import type {
  MailEditorPhrasesView,
  MailPhraseDraftPayload,
  MailPhraseResetPayload,
} from "@lfd/mail-blocks";
import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ResetMailCopyDraftCommand } from "../../copy/application/commands/reset-mail-copy-draft.command.js";
import { SaveMailCopyDraftCommand } from "../../copy/application/commands/save-mail-copy-draft.command.js";
import { GetMailTemplatePhrasesQuery } from "../application/queries/get-mail-template-phrases.query.js";
import {
  mailPhraseDraftPayloadSchema,
  mailPhraseResetPayloadSchema,
} from "./mail-template-payloads.js";

/**
 * **Les phrases d'un e-mail, sous le droit de l'éditeur** (plan
 * `plan-editeur-par-blocs.md`, § 16, S4d ; Hugo, 2026-11-07 : « des routes
 * propres sous `mail_templates` ») : personne n'a besoin de `b2b_storefront`
 * pour éditer un e-mail.
 *
 * Seule la garde change : ces routes envoient LES MÊMES commandes que
 * `admin/mail-copy` (`SaveMailCopyDraftCommand`, `ResetMailCopyDraftCommand`),
 * l'e-mail tiré du chemin. Aucune règle n'est recopiée ici. Les phrases
 * enregistrées partent avec la publication unique de l'e-mail
 * (`POST …/publications`).
 */
@Controller("admin/mail-templates")
@AdminSurface("mail_templates")
export class AdminMailTemplatePhrasesController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get(":template/phrases")
  phrases(@Param("template") template: string): Promise<MailEditorPhrasesView> {
    return this.queries.execute<GetMailTemplatePhrasesQuery, MailEditorPhrasesView>(
      new GetMailTemplatePhrasesQuery(template),
    );
  }

  /** Écrit le brouillon d'une phrase, sur la révision lue — `409` si quelqu'un a écrit entre-temps. */
  @Put(":template/phrases/drafts")
  @HttpCode(204)
  async saveDraft(
    @Param("template") template: string,
    @Body(new ZodBody(mailPhraseDraftPayloadSchema)) payload: MailPhraseDraftPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SaveMailCopyDraftCommand, void>(
      new SaveMailCopyDraftCommand(
        template,
        payload.path,
        payload.locale,
        payload.text,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }

  /** « Rétablir le texte d'origine » — appliqué au prochain « Publier », pas avant. */
  @Post(":template/phrases/resets")
  @HttpCode(204)
  async reset(
    @Param("template") template: string,
    @Body(new ZodBody(mailPhraseResetPayloadSchema)) payload: MailPhraseResetPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ResetMailCopyDraftCommand, void>(
      new ResetMailCopyDraftCommand(
        template,
        payload.path,
        payload.locale,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }
}
