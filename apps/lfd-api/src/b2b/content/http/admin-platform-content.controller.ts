import {
  footerContentPayloadSchema,
  salesTermsHeadingSchema,
  salesTermsParagraphPayloadSchema,
  salesTermsPositionPayloadSchema,
  type FooterContentPayload,
  type FooterContentView,
  type SalesTermsHeading,
  type SalesTermsParagraphCreated,
  type SalesTermsParagraphPayload,
  type SalesTermsPositionPayload,
  type SalesTermsView,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { AddSalesTermsParagraphCommand } from "../application/add-sales-terms-paragraph.command.js";
import { EditSalesTermsParagraphCommand } from "../application/edit-sales-terms-paragraph.command.js";
import { GetFooterContentQuery } from "../application/get-footer-content.query.js";
import { GetSalesTermsQuery } from "../application/get-sales-terms.query.js";
import { MoveSalesTermsParagraphCommand } from "../application/move-sales-terms-paragraph.command.js";
import { RemoveSalesTermsParagraphCommand } from "../application/remove-sales-terms-paragraph.command.js";
import { SaveFooterContentCommand } from "../application/save-footer-content.command.js";
import { SetSalesTermsTitleCommand } from "../application/set-sales-terms-title.command.js";

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

  @Get("sales-terms")
  salesTerms(): Promise<SalesTermsView> {
    return this.queries.execute<GetSalesTermsQuery, SalesTermsView>(new GetSalesTermsQuery());
  }

  /**
   * Renomme le document. `204` : une commande ne rend pas de modèle de lecture,
   * l'écran relit.
   */
  @Put("sales-terms/title")
  @HttpCode(204)
  async setSalesTermsTitle(
    @Body(new ZodBody(salesTermsHeadingSchema)) payload: SalesTermsHeading,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetSalesTermsTitleCommand, void>(
      new SetSalesTermsTitleCommand(payload, staffUserId),
    );
  }

  /**
   * Ajoute un article et rend **son seul identifiant** — pas le document.
   *
   * C'est la seule écriture des CGV qui rende quelque chose, et le §4
   * l'autorise : l'écran a besoin de désigner ce qu'il vient d'ajouter, et le
   * déduire d'une relecture supposerait que personne d'autre n'a écrit depuis.
   */
  @Post("sales-terms/paragraphs")
  async addSalesTermsParagraph(
    @Body(new ZodBody(salesTermsParagraphPayloadSchema)) payload: SalesTermsParagraphPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<SalesTermsParagraphCreated> {
    const id = await this.commands.execute<AddSalesTermsParagraphCommand, string>(
      new AddSalesTermsParagraphCommand(payload, staffUserId),
    );
    return { id };
  }

  @Put("sales-terms/paragraphs/:paragraphId")
  @HttpCode(204)
  async editSalesTermsParagraph(
    @Param("paragraphId") paragraphId: string,
    @Body(new ZodBody(salesTermsParagraphPayloadSchema)) payload: SalesTermsParagraphPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<EditSalesTermsParagraphCommand, void>(
      new EditSalesTermsParagraphCommand(paragraphId, payload, staffUserId),
    );
  }

  @Delete("sales-terms/paragraphs/:paragraphId")
  @HttpCode(204)
  async removeSalesTermsParagraph(
    @Param("paragraphId") paragraphId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<RemoveSalesTermsParagraphCommand, void>(
      new RemoveSalesTermsParagraphCommand(paragraphId, staffUserId),
    );
  }

  /**
   * Déplace un article. Le schéma ne tient que la borne BASSE du rang : la
   * haute dépend du document, et c'est l'agrégat qui la refuse.
   */
  @Put("sales-terms/paragraphs/:paragraphId/position")
  @HttpCode(204)
  async moveSalesTermsParagraph(
    @Param("paragraphId") paragraphId: string,
    @Body(new ZodBody(salesTermsPositionPayloadSchema)) payload: SalesTermsPositionPayload,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<MoveSalesTermsParagraphCommand, void>(
      new MoveSalesTermsParagraphCommand(paragraphId, payload.position, staffUserId),
    );
  }
}
