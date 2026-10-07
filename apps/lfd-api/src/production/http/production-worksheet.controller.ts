import {
  type MarkWorkshopLine,
  type ProductionContainerRule,
  type ProductionContainerView,
  type ProductionWorksheetQuery,
  type ProductionWorksheetRetake,
  type ProductionWorksheetView,
  type RecordWorkshopBatch,
  markWorkshopLineSchema,
  productionContainerSchema,
  productionWorksheetQuerySchema,
  recordWorkshopBatchSchema,
  workshopBatchIdSchema,
  workshopBatchRefSchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodBody, ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { CancelBatchCommand } from "../application/commands/cancel-batch.command.js";
import { RecordBatchCommand } from "../application/commands/record-batch.command.js";
import { RemoveProductionContainerCommand } from "../application/commands/remove-production-container.command.js";
import { MarkWorksheetLineCommand } from "../application/commands/mark-worksheet-line.command.js";
import { RetakeProductionDayCommand } from "../application/commands/retake-production-day.command.js";
import { SetProductionContainerCommand } from "../application/commands/set-production-container.command.js";
import { UnmarkWorksheetLineCommand } from "../application/commands/unmark-worksheet-line.command.js";
import { ListProductionContainersQuery } from "../application/queries/list-production-containers.query.js";
import { GetCurrentProductionWorksheetQuery } from "../application/queries/get-current-production-worksheet.query.js";
import { GetProductionWorksheetQuery } from "../application/queries/get-production-worksheet.query.js";

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit. */
const NO_CONTENT = 204;

/**
 * **La fiche d'atelier** — ce que le fournil a à sortir, et ce qui est sorti.
 *
 * Un contrôleur à part de `ProductionDayController`, qui frôle les 300 lignes :
 * ce n'est pas un découpage de confort mais la SRP appliquée aux surfaces — la
 * journée (clore, coliser, imprimer) et la fiche (cocher, reprendre, régler) ne
 * changent pas pour les mêmes raisons. Le préfixe reste le même, parce que c'est
 * le même fournil qui les ouvre.
 *
 * Il n'injecte que des **bus**, comme tous les autres : ni service, ni dépôt, ni
 * port de lecture. `lint:controller-buses` le tient.
 *
 * L'identité staff vient du guard, jamais de la charge utile — une coche sans
 * auteur ne se conteste pas, elle s'efface.
 *
 * `production_worksheet` depuis le 2026-10-01 (`documentation/livraisons/droits/plan-droits-par-geste.md`, 5.1),
 * contenants du four compris : c'est du matériel de four, pas d'expédition.
 */
@Controller("admin/production")
@AdminSurface("production_worksheet")
export class ProductionWorksheetController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  /**
   * **La fiche d'une journée**, arbitrée entre deux sources.
   *
   * Une journée arrêtée rend son instantané et l'heure du tirage ; une journée
   * ouverte rend la demande du commerce et `generatedAt: null`. L'écran dit
   * alors « plan non arrêté » plutôt que d'afficher l'heure de la lecture, qui
   * n'atteste de rien.
   *
   * Le jour vient de la chaîne de requête pour qu'un lien soit partageable, comme
   * le prévisionnel : un fournil qui dit « regarde le 14 » envoie une adresse.
   */
  @Get("worksheet")
  async worksheet(
    @Query(new ZodQuery(productionWorksheetQuerySchema)) query: ProductionWorksheetQuery,
  ): Promise<ProductionWorksheetView> {
    return this.queries.execute<GetProductionWorksheetQuery, ProductionWorksheetView>(
      new GetProductionWorksheetQuery(query.date),
    );
  }

  /**
   * **La fiche de la journée qu'on travaille** : demain si son plan est arrêté,
   * aujourd'hui sinon — au jour de Paris, selon l'horloge du serveur.
   *
   * Elle existe pour que l'écran cesse de choisir sa journée sur l'horloge du
   * poste, et de faire deux lectures pour le savoir. Même vue que la route datée,
   * qui reste servie pour les liens partagés.
   */
  @Get("worksheet/current")
  async currentWorksheet(): Promise<ProductionWorksheetView> {
    return this.queries.execute<GetCurrentProductionWorksheetQuery, ProductionWorksheetView>(
      new GetCurrentProductionWorksheetQuery(),
    );
  }

  /**
   * **La ligne est sortie du four.**
   *
   * `PUT` et non `POST` : cocher est idempotent du point de vue de l'état — la
   * case est faite, et recocher la refait avec les initiales du dernier geste.
   * C'est le pendant du `DELETE` juste en dessous, et les deux ensemble disent
   * exactement ce qu'une case à cocher fait.
   *
   * Rend 204 : le client relit la fiche, il ne reconstruit pas son état depuis
   * une réponse — §4.
   */
  @Put("worksheet/:date/lines/:sku/done")
  @HttpCode(NO_CONTENT)
  async mark(
    @Param("date") date: string,
    @Param("sku") sku: string,
    @Body(new ZodBody(markWorkshopLineSchema)) body: MarkWorkshopLine,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<MarkWorksheetLineCommand, void>(
      new MarkWorksheetLineCommand(dayOf(date), sku, body.initials, staffUserId),
    );
  }

  /**
   * **La coche s'enlève** — toutes les fournées de la ligne sont annulées.
   *
   * Autorisé, contrairement au colisage : une case cochée par erreur à 4 h du
   * matin doit pouvoir se reprendre. Refusé (409) si des pièces de l'article
   * sont déjà dans des sacs : il faut les ressortir du bac d'abord.
   */
  @Delete("worksheet/:date/lines/:sku/done")
  @HttpCode(NO_CONTENT)
  async unmark(
    @Param("date") date: string,
    @Param("sku") sku: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<UnmarkWorksheetLineCommand, void>(
      new UnmarkWorksheetLineCommand(dayOf(date), sku, staffUserId),
    );
  }

  /**
   * **Une fournée est sortie** (plan des fournées, D3).
   *
   * `PUT` sur l'identifiant tiré par l'écran : rejouer la même requête rend le
   * même état (succès silencieux), un autre contenu sous le même identifiant
   * est refusé (409). Même droit que la case — c'est le même geste, en
   * plusieurs fois.
   */
  @Put("worksheet/:date/lines/:sku/batches/:batchId")
  @HttpCode(NO_CONTENT)
  async recordBatch(
    @Param("date") date: string,
    @Param("sku") sku: string,
    @Param("batchId") batchId: string,
    @Body(new ZodBody(recordWorkshopBatchSchema)) body: RecordWorkshopBatch,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<RecordBatchCommand, void>(
      new RecordBatchCommand(
        dayOf(date),
        sku,
        workshopBatchIdSchema.parse(batchId),
        body.quantity,
        body.initials,
        staffUserId,
      ),
    );
  }

  /**
   * **La fournée ne compte plus** — annulée entière, tracée, jamais supprimée.
   * Tout poste du fournil peut annuler celle d'un autre (Hugo, 2026-09-28).
   * Refusée si des pièces sont déjà dans des sacs (409).
   */
  @Delete("worksheet/:date/batches/:batchId")
  @HttpCode(NO_CONTENT)
  async cancelBatch(
    @Param("date") date: string,
    @Param("batchId") batchId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<CancelBatchCommand, void>(
      new CancelBatchCommand(dayOf(date), workshopBatchRefSchema.parse(batchId), staffUserId),
    );
  }

  /**
   * **Reprendre le tirage** : absorber ce qui est arrivé depuis la clôture.
   *
   * Le seul geste du lot qui recalcule le compte à produire, et il est **attesté**
   * — l'écran vient de montrer les lignes qui changent et de dire laquelle est
   * déjà cochée. Sans auteur, ce serait le recalcul silencieux que l'agrégat
   * refuse.
   *
   * `absorbed: 0` n'est pas une erreur : rien n'était arrivé, et la réponse rend
   * le tirage que la fiche montre déjà.
   */
  @Post("worksheet/:date/retake")
  async retake(
    @Param("date") date: string,
    @StaffUserId() staffUserId: string,
  ): Promise<ProductionWorksheetRetake> {
    return this.commands.execute<RetakeProductionDayCommand, ProductionWorksheetRetake>(
      new RetakeProductionDayCommand(dayOf(date), staffUserId),
    );
  }

  /** Les contenants réglés, tous — quelques dizaines de lignes au plus. */
  @Get("containers")
  async containers(): Promise<readonly ProductionContainerView[]> {
    return this.queries.execute<ListProductionContainersQuery, readonly ProductionContainerView[]>(
      new ListProductionContainersQuery(),
    );
  }

  /**
   * **Régler le contenant d'un produit.** `PUT` : un SKU n'a qu'un réglage, et
   * le poser deux fois de suite doit donner le même état.
   */
  @Put("containers/:sku")
  @HttpCode(NO_CONTENT)
  async setContainer(
    @Param("sku") sku: string,
    @Body(new ZodBody(productionContainerSchema)) body: ProductionContainerRule,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<SetProductionContainerCommand, void>(
      new SetProductionContainerCommand(sku, body, staffUserId),
    );
  }

  /** Retirer le réglage — la colonne de la fiche redevient vide. */
  @Delete("containers/:sku")
  @HttpCode(NO_CONTENT)
  async removeContainer(@Param("sku") sku: string): Promise<void> {
    await this.commands.execute<RemoveProductionContainerCommand, void>(
      new RemoveProductionContainerCommand(sku),
    );
  }
}

/**
 * Le jour du chemin, validé dans sa FORME avant d'entrer.
 *
 * Le domaine le refuserait aussi — `ServiceDay.of` lève sur autre chose qu'un
 * jour ISO — mais le message de la frontière nomme le paramètre, ce qui est ce
 * dont a besoin celui qui a tapé l'URL. Même geste que `productionBatchQuerySchema`
 * chez le contrôleur voisin.
 */
function dayOf(date: string): string {
  return productionWorksheetQuerySchema.parse({ date }).date;
}
