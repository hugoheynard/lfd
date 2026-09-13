import {
  type MarkPackingLine,
  type ProductionPackingQuery,
  type ProductionPackingView,
  type SetPackingContainers,
  markPackingLineSchema,
  productionPackingQuerySchema,
  setPackingContainersSchema,
} from "@lfd/contracts";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import type { AuthenticatedStaffRequest } from "../../platform/auth/staff-principal.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { DeclarePackingContainersCommand } from "../application/commands/declare-packing-containers.command.js";
import { MarkPackingLineCommand } from "../application/commands/mark-packing-line.command.js";
import { UnmarkPackingLineCommand } from "../application/commands/unmark-packing-line.command.js";
import { GetProductionPackingQuery } from "../application/queries/get-production-packing.query.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **Le poste de colisage** — répartir ce qui est sorti du four dans les bacs.
 *
 * Un troisième contrôleur sous le même préfixe, et non trois routes de plus chez
 * `ProductionWorksheetController` qui frôle déjà les 300 lignes : ce n'est pas un
 * découpage de confort mais la SRP appliquée aux surfaces — fabriquer et
 * répartir ne changent pas pour les mêmes raisons. Le préfixe reste le même,
 * parce que c'est le même fournil qui les ouvre.
 *
 * ⚠️ **La fermeture du bac n'est pas ici.** Elle vit chez
 * `ProductionDayController` (`POST batch/:date/sheets/:reference/packed`), qui
 * est l'adresse encodée dans les QR des feuilles déjà imprimées et en
 * circulation. La déplacer casserait un papier posé sur un plan de travail.
 *
 * Il n'injecte que des **bus**, comme tous les autres : ni service, ni dépôt, ni
 * port de lecture. `lint:controller-buses` le tient.
 */
@Controller("admin/production")
@AdminSurface("b2b_orders")
export class ProductionPackingController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **Les bacs ET la ressource**, en une lecture.
   *
   * Les deux plateaux de la balance n'ont de sens que pris au même instant :
   * deux appels laisseraient une fenêtre où le reste affiché ne correspondrait
   * à aucun état réel.
   *
   * Le jour vient de la chaîne de requête pour qu'un lien soit partageable,
   * comme la fiche : un fournil qui dit « regarde le 14 » envoie une adresse.
   */
  @Get("packing")
  async packing(
    @Query(new ZodQuery(productionPackingQuerySchema)) query: ProductionPackingQuery,
  ): Promise<ProductionPackingView> {
    return this.queries.execute<GetProductionPackingQuery, ProductionPackingView>(
      new GetProductionPackingQuery(query.date),
    );
  }

  /**
   * **La ligne est dans le bac.**
   *
   * `PUT` et non `POST` : cocher est idempotent du point de vue de l'état — la
   * ligne y est, et recocher l'y remet avec les initiales du dernier geste.
   * C'est le pendant du `DELETE` juste en dessous, et les deux ensemble disent
   * exactement ce qu'une case à cocher fait.
   *
   * Rend 204 : le client relit le poste, il ne reconstruit pas son état depuis
   * une réponse — §4.
   */
  @Put("packing/:date/sheets/:reference/lines/:sku")
  @HttpCode(NO_CONTENT)
  async mark(
    @Param("date") date: string,
    @Param("reference") reference: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(markPackingLineSchema)) body: MarkPackingLine,
    @Req() request: AuthenticatedStaffRequest,
  ): Promise<void> {
    await this.commands.execute<MarkPackingLineCommand, void>(
      new MarkPackingLineCommand(
        dayOf(date),
        reference,
        sku,
        body.initials,
        staffSubjectOf(request),
      ),
    );
  }

  /**
   * **Combien de containers cette commande occupe** — les bacs du véhicule.
   *
   * `PUT` : une commande n'a qu'un nombre de bacs, et le poser deux fois de
   * suite doit donner le même état. `0` est une réponse recevable — c'est
   * d'ailleurs celle de toutes les commandes tant que personne n'a compté.
   *
   * 🔴 À ne pas confondre avec `PUT containers/:sku` chez le contrôleur voisin,
   * qui règle le matériel du FOUR par SKU. Même mot, deux objets : ici c'est le
   * contenant d'expédition d'UNE commande.
   */
  @Put("packing/:date/sheets/:reference/containers")
  @HttpCode(NO_CONTENT)
  async containers(
    @Param("date") date: string,
    @Param("reference") reference: string,
    @Body(new ZodBody(setPackingContainersSchema)) body: SetPackingContainers,
  ): Promise<void> {
    await this.commands.execute<DeclarePackingContainersCommand, void>(
      new DeclarePackingContainersCommand(dayOf(date), reference, body.containers),
    );
  }

  /**
   * **La ligne ressort du bac.**
   *
   * Autorisé tant que le bac n'est pas fermé : une ligne cochée par erreur à 5 h
   * du matin doit pouvoir se reprendre. Après la fermeture, l'agrégat refuse —
   * le contenu a été annoncé au client.
   */
  @Delete("packing/:date/sheets/:reference/lines/:sku")
  @HttpCode(NO_CONTENT)
  async unmark(
    @Param("date") date: string,
    @Param("reference") reference: string,
    @Param("sku") sku: string,
  ): Promise<void> {
    await this.commands.execute<UnmarkPackingLineCommand, void>(
      new UnmarkPackingLineCommand(dayOf(date), reference, sku),
    );
  }
}

/**
 * Le jour du chemin, validé dans sa FORME avant d'entrer.
 *
 * Le domaine le refuserait aussi — `ServiceDay.of` lève sur autre chose qu'un
 * jour ISO — mais le message de la frontière nomme le paramètre, ce qui est ce
 * dont a besoin celui qui a tapé l'URL. Même geste que chez les deux
 * contrôleurs voisins.
 */
function dayOf(date: string): string {
  return productionPackingQuerySchema.parse({ date }).date;
}

/**
 * L'identité staff posée par le guard. Le `?` du type l'autorise à manquer ; en
 * pratique le guard a couru avant nous, mais on refuse plutôt que d'écrire une
 * coche anonyme — un fait daté sans auteur ne se conteste pas, il s'efface.
 *
 * Jumeau de ceux de `production-day.controller.ts` et
 * `production-worksheet.controller.ts` (vérifié le 2026-09-13) : six lignes
 * recopiées plutôt qu'un module d'utilitaires HTTP partagé, que rien d'autre ne
 * justifierait aujourd'hui.
 */
function staffSubjectOf(request: AuthenticatedStaffRequest): string {
  const subject = request.staff?.subject;
  if (subject === undefined) {
    throw new UnauthorizedException("Session staff requise.");
  }
  return subject;
}
