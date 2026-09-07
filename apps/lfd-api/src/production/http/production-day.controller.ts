import {
  type ProductionDayStatus,
  type ProductionPlanClosure,
  productionBatchQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, Param, Post, Res, StreamableFile } from "@nestjs/common";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { CloseProductionDayCommand } from "../application/commands/close-production-day.command.js";
import { GetProductionDayStatusQuery } from "../application/queries/get-production-day-status.query.js";
import {
  GetAtelierSheetPdfQuery,
  GetProductionCountPdfQuery,
} from "../application/queries/get-production-paper.query.js";
import type { ProductionPaper } from "../application/services/production-paper.service.js";

/**
 * **La journée de fabrication, côté fournil.**
 *
 * 🔴 Cette route vivait dans `b2b/orders/http/` — une surface de production
 * hébergée par le commerce, sous un chemin qui disait déjà `admin/production`.
 * C'était le symptôme le plus visible d'une frontière qui n'existait que dans
 * les noms de dossiers : le fournil décidait qu'une journée bascule, mais depuis
 * le contexte d'à côté.
 *
 * Elle garde son chemin — un back-office en ligne ne change pas d'URL parce
 * qu'on range son code autrement.
 *
 * Le contrôleur n'injecte qu'un **bus**, comme tous les autres : ni service, ni
 * dépôt, ni port de lecture. `lint:controller-buses` le tient.
 */
@Controller("admin/production")
@AdminSurface("b2b_orders")
export class ProductionDayController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **Ce qu'une journée dit d'elle-même** — et la divergence, s'il y en a une.
   *
   * ⚠️ `pendingInCommerce` est le contrepoids du couplage minimal : la
   * production publie, le commerce s'abonne, et le bus vit en processus. Un
   * abonné qui échoue laisse des commandes `placed` sur une journée close, et
   * sans cette lecture la divergence n'existerait que dans la tête de celui qui
   * la cherche. Zéro attendu ; autre chose se rattrape en reclosant.
   */
  /**
   * **Le compte à produire du jour, en PDF** — ce qu'on affiche au mur.
   *
   * Il est ARCHIVÉ au premier tirage : c'est un instantané arrêté à la clôture,
   * et les commandes bougent après. Le refaire plus tard donnerait un autre
   * nombre que celui sur lequel les fournées sont parties.
   *
   * Refusé tant que la journée n'est pas arrêtée : un compte tiré d'une journée
   * ouverte serait faux à la seconde où on le lit.
   */
  @Get("batch/:date/compte-a-produire.pdf")
  async count(
    @Param("date") date: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.paper(
      response,
      await this.queries.execute<GetProductionCountPdfQuery, ProductionPaper>(
        new GetProductionCountPdfQuery(productionBatchQuerySchema.parse({ date }).date),
      ),
    );
  }

  /**
   * **La feuille d'atelier d'une commande, en PDF** — celle qui part au fournil.
   *
   * Elle se lit dans la JOURNÉE, jamais dans le commerce : c'est ce que la
   * production a inscrit à la clôture, et c'est ce papier-là qui est parti.
   *
   * ⚠️ Elle porte son **QR de colisage**, et c'est l'inverse du bon de commande :
   * ce code encode un NOM (`/colisage/{référence}`), pas un secret. La référence
   * est déjà écrite en toutes lettres au-dessus.
   */
  @Get("batch/:date/sheets/:reference.pdf")
  async sheet(
    @Param("date") date: string,
    @Param("reference") reference: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return this.paper(
      response,
      await this.queries.execute<GetAtelierSheetPdfQuery, ProductionPaper>(
        new GetAtelierSheetPdfQuery(productionBatchQuerySchema.parse({ date }).date, reference),
      ),
    );
  }

  /** Les en-têtes d'un PDF servi, écrits une fois. */
  private paper(response: Response, paper: ProductionPaper): StreamableFile {
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      contentDispositionAttachment(sanitiseFileName(paper.fileName, "document.pdf")),
    );
    return new StreamableFile(paper.bytes);
  }

  @Get("batch/:date/status")
  async status(@Param("date") date: string): Promise<ProductionDayStatus> {
    return this.queries.execute<GetProductionDayStatusQuery, ProductionDayStatus>(
      new GetProductionDayStatusQuery(productionBatchQuerySchema.parse({ date }).date),
    );
  }

  /**
   * **Clôt le plan du soir** d'une journée : ses commandes s'inscrivent chez la
   * production, et le compte à produire est arrêté.
   *
   * Le geste que l'équipe fait déjà — arrêter de prendre pour demain — devient
   * le moment que le système n'avait pas. Il ne demande à personne de juger quoi
   * que ce soit : il acte une heure, pas un tri.
   *
   * **Rejouable, et c'est le rattrapage prévu.** Une seconde clôture ne
   * recalcule rien — le compte à produire est un instantané — mais republie le
   * fait, ce dont le commerce a besoin si son abonné a échoué. La réponse dit
   * laquelle des deux choses vient d'arriver (`alreadyClosed`).
   */
  @Post("batch/:date/close")
  async close(@Param("date") date: string): Promise<ProductionPlanClosure> {
    return this.commands.execute<CloseProductionDayCommand, ProductionPlanClosure>(
      new CloseProductionDayCommand(productionBatchQuerySchema.parse({ date }).date),
    );
  }
}
