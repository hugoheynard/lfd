import {
  type ProductionDayStatus,
  type ProductionDueThresholdsView,
  type ProductionForecastQuery,
  type ProductionForecastView,
  type ProductionPlanClosure,
  type ProductionPlanReopening,
  productionBatchQuerySchema,
  productionForecastQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, Param, Post, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import {
  AdminSurface,
  RequireAnyPermission,
  RequirePermission,
} from "../../platform/auth/admin-surface.decorator.js";
import { ZodParam, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { CloseProductionDayCommand } from "../application/commands/close-production-day.command.js";
import { ReopenProductionDayCommand } from "../application/commands/reopen-production-day.command.js";
import { GetDayDossierPdfQuery } from "../application/queries/get-day-dossier-pdf.query.js";
import { GetProductionCountPdfQuery } from "../application/queries/get-production-count-pdf.query.js";
import { GetProductionDayStatusQuery } from "../day/index.js";
import { GetProductionForecastQuery } from "../application/queries/get-production-forecast.query.js";
import { GetProductionDueThresholdsQuery } from "../day/index.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { Idempotent } from "../../platform/shared/http/idempotent.decorator.js";
import { type ProductionPaper, servePaper } from "../shared/print/index.js";

/**
 * Le jour du chemin, validé dans sa FORME par un pipe : un `.parse` écrit dans
 * la route laissait sortir un `ZodError` nu, rendu en 500 (corrigé le
 * 2026-10-22). Le pipe le rend en 400 en nommant le paramètre.
 */
const DAY = new ZodParam(productionBatchQuerySchema.shape.date, "date");

/**
 * **Le plan de la journée** — arrêt, réouverture, état, prévisionnel,
 * échéances, et les deux papiers du plan (dossier, compte à produire).
 *
 * Le préfixe `admin/production` est partagé avec les contrôleurs des autres
 * métiers du fournil (fiche d'atelier, réassorts, retirage) : un contrôleur
 * par métier, des chemins qui ne changent pas.
 *
 * 🔴 Cette route vivait dans `lafoliecoffee/orders/http/` — une surface de production
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
 * l'arrêt, sous `production_count_stop` depuis le 2026-10-06. « Prête » ne vit
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
    @Param("date", DAY) date: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return servePaper(
      response,
      await this.queries.execute<GetProductionCountPdfQuery, ProductionPaper>(
        new GetProductionCountPdfQuery(date),
      ),
    );
  }

  /**
   * **Le dossier du jour, en PDF** — le récapitulatif, puis un bon par
   * commande : le paquet qui part au fournil, en un seul fichier.
   *
   * Même surface et même garde que le compte à produire, et même refus tant
   * que la journée n'est pas arrêtée : il se lit dans ce qu'elle a figé.
   */
  @Get("batch/:date/dossier.pdf")
  async dossier(
    @Param("date", DAY) date: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    return servePaper(
      response,
      await this.queries.execute<GetDayDossierPdfQuery, ProductionPaper>(
        new GetDayDossierPdfQuery(date),
      ),
    );
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
   * Lecture seule, prévision calculée par le commerce. Ouverte au prévisionnel
   * (`production_plan`) ET à la fiche d'atelier (`production_worksheet`), qui
   * montre les tranches au fournil : un rôle « fournil » n'a que la seconde, et
   * sa fiche aurait dit les tranches illisibles (relevé le 2026-10-28).
   */
  @Get("batch/:date/due-thresholds")
  @RequireAnyPermission("production_plan:read", "production_worksheet:read")
  async dueThresholds(@Param("date", DAY) date: string): Promise<ProductionDueThresholdsView> {
    return this.queries.execute<GetProductionDueThresholdsQuery, ProductionDueThresholdsView>(
      new GetProductionDueThresholdsQuery(date),
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
  async status(@Param("date", DAY) date: string): Promise<ProductionDayStatus> {
    return this.queries.execute<GetProductionDayStatusQuery, ProductionDayStatus>(
      new GetProductionDayStatusQuery(date),
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
   * lire le plan (plan `documentation/fournil/arret-du-plan.md`, §6).
   */
  @Idempotent(
    "le rejeu ne change rien de faux : il réannonce l'arrêt du plan tel qu'il est (une réparation voulue, Hugo, 2026-11-12) — un retirage y apprend au commerce les commandes ajoutées, et les abonnés appliquent un état exact",
  )
  @Post("batch/:date/close")
  @RequirePermission("production_count_stop:write")
  async close(
    @Param("date", DAY) date: string,
    @StaffUserId() staffUserId: string,
  ): Promise<ProductionPlanClosure> {
    return this.commands.execute<CloseProductionDayCommand, ProductionPlanClosure>(
      new CloseProductionDayCommand(date, "manual", staffUserId),
    );
  }

  /**
   * **Rouvre une journée arrêtée** (Hugo, 2026-10-14) : le plan est retiré,
   * les clients peuvent de nouveau commander pour ce jour, et le prochain
   * arrêt refait tout. Refusée dès qu'une fournée, un colisage ou une tournée
   * a commencé — le refus nomme lequel.
   *
   * Sous le droit de l'arrêt, `production_count_stop:write` : défaire un
   * geste demande le droit de le faire. Aucun droit nouveau, rien d'écrit à
   * un rôle.
   */
  @Post("batch/:date/reopen")
  @Idempotent(
    "transition : rejouée sur un plan déjà rouvert, l'agrégat refuse (409 ProductionDayNotClosedError) avant toute écriture ni tout fait",
  )
  @RequirePermission("production_count_stop:write")
  async reopen(
    @Param("date", DAY) date: string,
    @StaffUserId() staffUserId: string,
  ): Promise<ProductionPlanReopening> {
    return this.commands.execute<ReopenProductionDayCommand, ProductionPlanReopening>(
      new ReopenProductionDayCommand(date, staffUserId),
    );
  }
}
