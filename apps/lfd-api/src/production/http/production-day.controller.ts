import {
  type ProductionDayStatus,
  type ProductionDueThresholdsView,
  type ProductionForecastQuery,
  type ProductionForecastView,
  type ProductionPlanClosure,
  productionBatchQuerySchema,
  productionForecastQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, Param, Post, Query, Res, StreamableFile } from "@nestjs/common";
import { contentDispositionAttachment, sanitiseFileName } from "@lfd/storage";
import type { Response } from "express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface, RequirePermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { CloseProductionDayCommand } from "../application/commands/close-production-day.command.js";
import { GetAtelierSheetPdfQuery } from "../application/queries/get-atelier-sheet-pdf.query.js";
import { GetProductionCountPdfQuery } from "../application/queries/get-production-count-pdf.query.js";
import { GetProductionDayStatusQuery } from "../application/queries/get-production-day-status.query.js";
import { GetProductionForecastQuery } from "../application/queries/get-production-forecast.query.js";
import { GetProductionDueThresholdsQuery } from "../application/queries/get-production-due-thresholds.query.js";
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
 *
 * `production_plan` — l'état, le prévisionnel, le compte à produire —, sauf
 * l'arrêt, sous `production_count_stop` depuis le 2026-10-06, et sauf la
 * fiche d'atelier imprimable, qui sert un autre poste et porte sa garde (`production_worksheet`, 2026-10-01,
 * `documentation/livraisons/plan-droits-par-geste.md`, 5.1). « Prête » ne vit
 * plus ici depuis K3c : elle se déclare au colisage
 * (`POST admin/packing/:date/orders/:orderId/close`).
 */
@Controller("admin/production")
@AdminSurface("production_plan")
export class ProductionDayController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

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
  @RequirePermission("production_worksheet:read")
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

  /**
   * **Le prévisionnel** — la matrice `produits × jours` d'une plage.
   *
   * Ce n'est pas le lot d'une journée servi sept fois : la question n'est pas
   * « que fabrique-t-on », mais « quand est-ce que ça tombe ». Une seule lecture
   * donc, et deux sources arbitrées côté domaine — le compte à produire arrêté
   * quand la journée est close, la demande du commerce sinon.
   *
   * Les bornes viennent de l'URL pour qu'un lien soit partageable : un fournil
   * qui dit « regarde la semaine du 3 » envoie une adresse, pas un mode d'emploi.
   *
   * ⚠️ Le chemin est en anglais comme ses voisins (`batch`, `packing`,
   * `status`) ; l'écran, lui, s'ouvre sur `/production/previsionnel`. Les deux
   * surfaces ont chacune leur langue, et c'est déjà le partage du dépôt.
   */
  @Get("forecast")
  async forecast(
    @Query(new ZodQuery(productionForecastQuerySchema)) query: ProductionForecastQuery,
  ): Promise<ProductionForecastView> {
    return this.queries.execute<GetProductionForecastQuery, ProductionForecastView>(
      new GetProductionForecastQuery(query.from, query.to),
    );
  }

  /**
   * **Le compte à rebours d'une journée** — pour chaque produit, ce qui doit
   * être sorti avant chaque heure, cumulé (plan production par vagues, V0).
   * Lecture seule, prévision calculée par le commerce ; même garde que le
   * prévisionnel (`production_plan`).
   */
  @Get("batch/:date/due-thresholds")
  async dueThresholds(@Param("date") date: string): Promise<ProductionDueThresholdsView> {
    return this.queries.execute<GetProductionDueThresholdsQuery, ProductionDueThresholdsView>(
      new GetProductionDueThresholdsQuery(productionBatchQuerySchema.parse({ date }).date),
    );
  }

  /**
   * **Ce qu'une journée dit d'elle-même** — et la divergence, s'il y en a une.
   *
   * ⚠️ `pendingInCommerce` est le contrepoids du couplage minimal : la
   * production publie, le commerce s'abonne, et le bus vit en processus. Un
   * abonné qui échoue laisse des commandes `placed` sur une journée close, et
   * sans cette lecture la divergence n'existerait que dans la tête de celui qui
   * la cherche. Zéro attendu ; autre chose se rattrape en reclosant.
   */
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
   *
   * Sous **`production_count_stop:write`** depuis le 2026-10-06, et non sous
   * `production_plan:write` : arrêter le compte n'est pas le même geste que
   * lire le plan (plan `documentation/production/plan-arret-du-plan.md`, §6).
   */
  @Post("batch/:date/close")
  @RequirePermission("production_count_stop:write")
  async close(@Param("date") date: string): Promise<ProductionPlanClosure> {
    return this.commands.execute<CloseProductionDayCommand, ProductionPlanClosure>(
      new CloseProductionDayCommand(productionBatchQuerySchema.parse({ date }).date),
    );
  }
}
