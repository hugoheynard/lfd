import {
  setMadeToOrderPayloadSchema,
  setReservedVisibilityPayloadSchema,
  type ArticleReservationView,
  type CompanyReservedArticlesView,
  type MadeToOrderMarkView,
  type SetMadeToOrderPayload,
  type SetReservedVisibilityPayload,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodBody } from "../../../platform/shared/http/zod-body.pipe.js";
import { ReleaseArticleCommand } from "../application/commands/release-article.command.js";
import { ReserveArticleCommand } from "../application/commands/reserve-article.command.js";
import { SetMadeToOrderCommand } from "../application/commands/set-made-to-order.command.js";
import { SetReservedVisibilityCommand } from "../application/commands/set-reserved-visibility.command.js";
import { GetArticleReservationQuery } from "../application/queries/get-article-reservation.query.js";
import { ListCompanyReservedArticlesQuery } from "../application/queries/list-company-reserved-articles.query.js";
import { ListMadeToOrderMarksQuery } from "../application/queries/list-made-to-order-marks.query.js";

/**
 * **Les articles sur mesure et leur réservation** (plan
 * `documentation/catalogue/plan-articles-sur-mesure.md`, lot L1a) : marquer,
 * régler la visibilité, réserver à une société, retirer.
 *
 * Même surface que le paramétrage du catalogue (`lfc_catalog`) : c'est une
 * décision sur ce qui se vend, prise par ceux qui décident déjà du masquage.
 * Un contrôleur à part parce que le sujet en est un, et que le contrôleur
 * voisin dépasserait sa taille.
 *
 * ⚠️ Tant que le lot L1b n'est pas déployé, rien de ce qui se règle ici ne
 * restreint le rayon, le devis ni la commande.
 */
@Controller("admin/catalog")
@AdminSurface("lfc_catalog")
export class AdminMadeToOrderController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /** Les articles qui portent un réglage — l'écran les joint au catalogue par SKU. */
  @Get("made-to-order")
  marks(): Promise<MadeToOrderMarkView[]> {
    return this.queries.execute<ListMadeToOrderMarksQuery, MadeToOrderMarkView[]>(
      new ListMadeToOrderMarksQuery(),
    );
  }

  /** Les articles réservés à une société, et ceux de son principal. */
  @Get("reservations/:companyId")
  ofCompany(@Param("companyId") companyId: string): Promise<CompanyReservedArticlesView> {
    return this.queries.execute<ListCompanyReservedArticlesQuery, CompanyReservedArticlesView>(
      new ListCompanyReservedArticlesQuery(companyId),
    );
  }

  @Get(":sku/reservation")
  ofArticle(@Param("sku") sku: string): Promise<ArticleReservationView> {
    return this.queries.execute<GetArticleReservationQuery, ArticleReservationView>(
      new GetArticleReservationQuery(sku),
    );
  }

  @Put(":sku/made-to-order")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setMadeToOrder(
    @Param("sku") sku: string,
    @Body(new ZodBody(setMadeToOrderPayloadSchema)) payload: SetMadeToOrderPayload,
  ): Promise<void> {
    await this.commands.execute<SetMadeToOrderCommand, void>(
      new SetMadeToOrderCommand(sku, payload.madeToOrder),
    );
  }

  @Put(":sku/reserved-visibility")
  @HttpCode(HttpStatus.NO_CONTENT)
  async setReservedVisibility(
    @Param("sku") sku: string,
    @Body(new ZodBody(setReservedVisibilityPayloadSchema)) payload: SetReservedVisibilityPayload,
  ): Promise<void> {
    await this.commands.execute<SetReservedVisibilityCommand, void>(
      new SetReservedVisibilityCommand(sku, payload.visibility),
    );
  }

  /** Réserver : idempotent, un second appel ne change rien. */
  @Put(":sku/reservations/:companyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reserve(
    @Param("sku") sku: string,
    @Param("companyId") companyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<ReserveArticleCommand, void>(
      new ReserveArticleCommand(sku, companyId, staffUserId),
    );
  }

  /** Retirer : idempotent ; l'écran a fait confirmer, le geste est journalisé. */
  @Delete(":sku/reservations/:companyId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async release(@Param("sku") sku: string, @Param("companyId") companyId: string): Promise<void> {
    await this.commands.execute<ReleaseArticleCommand, void>(
      new ReleaseArticleCommand(sku, companyId),
    );
  }
}
