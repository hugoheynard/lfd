import {
  legalDocumentParagraphWritePayloadSchema,
  legalDocumentPositionPayloadSchema,
  legalDocumentRevisionQuerySchema,
  legalDocumentTitlePayloadSchema,
  legalRequiredSectionPayloadSchema,
  type LegalDocumentParagraphCreated,
  type LegalDocumentParagraphWritePayload,
  type LegalDocumentPositionPayload,
  type LegalDocumentRevisionQuery,
  type LegalDocumentTitlePayload,
  type LegalDocumentView,
  type LegalDocumentKey,
  type LegalRequiredSectionPayload,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddLegalDocumentParagraphCommand } from "../application/add-legal-document-paragraph.command.js";
import { AddRequiredLegalSectionCommand } from "../application/add-required-legal-section.command.js";
import { EditLegalDocumentParagraphCommand } from "../application/edit-legal-document-paragraph.command.js";
import { GetLegalDocumentQuery } from "../application/get-legal-document.query.js";
import { MoveLegalDocumentParagraphCommand } from "../application/move-legal-document-paragraph.command.js";
import { RemoveLegalDocumentParagraphCommand } from "../application/remove-legal-document-paragraph.command.js";
import { SetLegalDocumentTitleCommand } from "../application/set-legal-document-title.command.js";
import { LegalMentionParam } from "./legal-mention.pipe.js";

/**
 * Édition **staff** des mentions légales (back-office → Réglages › Légal).
 *
 * La lecture y est doublée alors qu'elle existe déjà en public, et c'est
 * volontaire : l'écran d'édition doit connaître la RÉVISION et la dernière
 * main, que la surface publique n'a aucune raison de porter au client.
 *
 * 🔴 Sous `lfc_legal`, et plus `b2b_settings` (plan
 * `legal/plan-cgv-par-audience.md`, C0, 2026-10-15) : le pied de page, qui
 * partageait ce contrôleur, reste sous `b2b_settings` dans
 * {@link AdminFooterContentController}. Un contrôleur ne mêle pas deux droits.
 */
@Controller("admin/content")
@AdminSurface("lfc_legal")
export class AdminPlatformContentController {
  constructor(
    private readonly queries: QueryBus,
    private readonly commands: CommandBus,
  ) {}

  /**
   * Le document d'une mention — **une seule route pour les cinq**, la mention
   * en paramètre de chemin. Cinq routes copiées auraient divergé au premier
   * correctif, et rien à l'écran ne les aurait distinguées.
   */
  @Get("legal/:mention")
  legalDocument(
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
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
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
    @Body(new ZodBody(legalDocumentTitlePayloadSchema)) payload: LegalDocumentTitlePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    const { expectedRevision, ...heading } = payload;
    await this.commands.execute<SetLegalDocumentTitleCommand, void>(
      new SetLegalDocumentTitleCommand(mention, heading, expectedRevision, staffUserId),
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
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
    @Body(new ZodBody(legalDocumentParagraphWritePayloadSchema))
    payload: LegalDocumentParagraphWritePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<LegalDocumentParagraphCreated> {
    const { expectedRevision, ...prose } = payload;
    const id = await this.commands.execute<AddLegalDocumentParagraphCommand, string>(
      new AddLegalDocumentParagraphCommand(mention, prose, expectedRevision, staffUserId),
    );
    return { id };
  }

  /**
   * Crée une **section requise** (plan `legal/plan-page-confidentialite.md`
   * §4.2) avec le texte saisi, et rend son identifiant. Même droit que les
   * autres écritures : c'est un article de plus, qu'on ne pourra pas retirer.
   */
  @Post("legal/:mention/sections")
  async addRequiredLegalSection(
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
    @Body(new ZodBody(legalRequiredSectionPayloadSchema)) payload: LegalRequiredSectionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<LegalDocumentParagraphCreated> {
    const { expectedRevision, section, ...prose } = payload;
    const id = await this.commands.execute<AddRequiredLegalSectionCommand, string>(
      new AddRequiredLegalSectionCommand(mention, section, prose, expectedRevision, staffUserId),
    );
    return { id };
  }

  @Put("legal/:mention/paragraphs/:paragraphId")
  @HttpCode(204)
  async editLegalDocumentParagraph(
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
    @Param("paragraphId") paragraphId: string,
    @Body(new ZodBody(legalDocumentParagraphWritePayloadSchema))
    payload: LegalDocumentParagraphWritePayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    const { expectedRevision, ...prose } = payload;
    await this.commands.execute<EditLegalDocumentParagraphCommand, void>(
      new EditLegalDocumentParagraphCommand(
        mention,
        paragraphId,
        prose,
        expectedRevision,
        staffUserId,
      ),
    );
  }

  /** La révision lue passe en chaîne de requête : un `DELETE` n'a pas de corps. */
  @Delete("legal/:mention/paragraphs/:paragraphId")
  @HttpCode(204)
  async removeLegalDocumentParagraph(
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
    @Param("paragraphId") paragraphId: string,
    @Query(new ZodQuery(legalDocumentRevisionQuerySchema)) query: LegalDocumentRevisionQuery,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveLegalDocumentParagraphCommand, void>(
      new RemoveLegalDocumentParagraphCommand(
        mention,
        paragraphId,
        query.expectedRevision,
        staffUserId,
      ),
    );
  }

  /**
   * Déplace un article. Le schéma ne tient que la borne BASSE du rang : la
   * haute dépend du document, et c'est l'agrégat qui la refuse.
   */
  @Put("legal/:mention/paragraphs/:paragraphId/position")
  @HttpCode(204)
  async moveLegalDocumentParagraph(
    @Param("mention", LegalMentionParam) mention: LegalDocumentKey,
    @Param("paragraphId") paragraphId: string,
    @Body(new ZodBody(legalDocumentPositionPayloadSchema)) payload: LegalDocumentPositionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<MoveLegalDocumentParagraphCommand, void>(
      new MoveLegalDocumentParagraphCommand(
        mention,
        paragraphId,
        payload.position,
        payload.expectedRevision,
        staffUserId,
      ),
    );
  }
}
