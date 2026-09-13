import {
  footerContentPayloadSchema,
  legalDocumentHeadingSchema,
  legalDocumentParagraphPayloadSchema,
  legalDocumentPositionPayloadSchema,
  type FooterContentPayload,
  type FooterContentView,
  type LegalDocumentHeading,
  type LegalDocumentParagraphCreated,
  type LegalDocumentParagraphPayload,
  type LegalDocumentPositionPayload,
  type LegalDocumentView,
  type LegalMention,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddLegalDocumentParagraphCommand } from "../application/add-legal-document-paragraph.command.js";
import { EditLegalDocumentParagraphCommand } from "../application/edit-legal-document-paragraph.command.js";
import { GetFooterContentQuery } from "../application/get-footer-content.query.js";
import { GetLegalDocumentQuery } from "../application/get-legal-document.query.js";
import { MoveLegalDocumentParagraphCommand } from "../application/move-legal-document-paragraph.command.js";
import { RemoveLegalDocumentParagraphCommand } from "../application/remove-legal-document-paragraph.command.js";
import { SaveFooterContentCommand } from "../application/save-footer-content.command.js";
import { SetLegalDocumentTitleCommand } from "../application/set-legal-document-title.command.js";
import { LegalMentionParam } from "./legal-mention.pipe.js";

/**
 * Édition **staff** du contenu de plateforme (back-office → Contenu plateforme).
 *
 * La lecture y est doublée alors qu'elle existe déjà en public, et c'est
 * volontaire : l'écran d'édition doit connaître la RÉVISION et la dernière
 * main, que la surface publique n'a aucune raison de porter au client.
 *
 * `PUT` et non `PATCH` : on enregistre le pied de page ENTIER, dans ses trois
 * langues. Un enregistrement partiel laisserait une langue en arrière sans que
 * rien ne le dise — exactement ce que le contrat cherche à rendre impossible.
 */
@Controller("admin/content")
@AdminSurface("b2b_settings")
export class AdminPlatformContentController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  @Get("footer")
  footer(): Promise<FooterContentView> {
    return this.queries.execute<GetFooterContentQuery, FooterContentView>(
      new GetFooterContentQuery(),
    );
  }

  @Put("footer")
  saveFooter(
    @Body(new ZodBody(footerContentPayloadSchema)) payload: FooterContentPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<FooterContentView> {
    return this.commands.execute<SaveFooterContentCommand, FooterContentView>(
      new SaveFooterContentCommand(payload, staffUserId),
    );
  }

  /**
   * Le document d'une mention — **une seule route pour les cinq**, la mention
   * en paramètre de chemin. Cinq routes copiées auraient divergé au premier
   * correctif, et rien à l'écran ne les aurait distinguées.
   */
  @Get("legal/:mention")
  legalDocument(
    @Param("mention", LegalMentionParam) mention: LegalMention,
  ): Promise<LegalDocumentView> {
    return this.queries.execute<GetLegalDocumentQuery, LegalDocumentView>(
      new GetLegalDocumentQuery(mention),
    );
  }

  /**
   * Renomme le document. `204` : une commande ne rend pas de modèle de lecture,
   * l'écran relit.
   */
  @Put("legal/:mention/title")
  @HttpCode(204)
  async setLegalDocumentTitle(
    @Param("mention", LegalMentionParam) mention: LegalMention,
    @Body(new ZodBody(legalDocumentHeadingSchema)) payload: LegalDocumentHeading,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetLegalDocumentTitleCommand, void>(
      new SetLegalDocumentTitleCommand(mention, payload, staffUserId),
    );
  }

  /**
   * Ajoute un article et rend **son seul identifiant** — pas le document.
   *
   * C'est la seule écriture des documents légaux qui rende quelque chose, et le
   * §4 l'autorise : l'écran a besoin de désigner ce qu'il vient d'ajouter, et le
   * déduire d'une relecture supposerait que personne d'autre n'a écrit depuis.
   */
  @Post("legal/:mention/paragraphs")
  async addLegalDocumentParagraph(
    @Param("mention", LegalMentionParam) mention: LegalMention,
    @Body(new ZodBody(legalDocumentParagraphPayloadSchema)) payload: LegalDocumentParagraphPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<LegalDocumentParagraphCreated> {
    const id = await this.commands.execute<AddLegalDocumentParagraphCommand, string>(
      new AddLegalDocumentParagraphCommand(mention, payload, staffUserId),
    );
    return { id };
  }

  @Put("legal/:mention/paragraphs/:paragraphId")
  @HttpCode(204)
  async editLegalDocumentParagraph(
    @Param("mention", LegalMentionParam) mention: LegalMention,
    @Param("paragraphId") paragraphId: string,
    @Body(new ZodBody(legalDocumentParagraphPayloadSchema)) payload: LegalDocumentParagraphPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<EditLegalDocumentParagraphCommand, void>(
      new EditLegalDocumentParagraphCommand(mention, paragraphId, payload, staffUserId),
    );
  }

  @Delete("legal/:mention/paragraphs/:paragraphId")
  @HttpCode(204)
  async removeLegalDocumentParagraph(
    @Param("mention", LegalMentionParam) mention: LegalMention,
    @Param("paragraphId") paragraphId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveLegalDocumentParagraphCommand, void>(
      new RemoveLegalDocumentParagraphCommand(mention, paragraphId, staffUserId),
    );
  }

  /**
   * Déplace un article. Le schéma ne tient que la borne BASSE du rang : la
   * haute dépend du document, et c'est l'agrégat qui la refuse.
   */
  @Put("legal/:mention/paragraphs/:paragraphId/position")
  @HttpCode(204)
  async moveLegalDocumentParagraph(
    @Param("mention", LegalMentionParam) mention: LegalMention,
    @Param("paragraphId") paragraphId: string,
    @Body(new ZodBody(legalDocumentPositionPayloadSchema)) payload: LegalDocumentPositionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<MoveLegalDocumentParagraphCommand, void>(
      new MoveLegalDocumentParagraphCommand(mention, paragraphId, payload.position, staffUserId),
    );
  }
}
