import {
  type ProductionDayStatus,
  type ProductionPlanClosure,
  productionBatchQuerySchema,
} from "@lfd/contracts";
import { Controller, Get, Param, Post } from "@nestjs/common";
import { CommandBus, QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { CloseProductionDayCommand } from "../application/commands/close-production-day.command.js";
import { GetProductionDayStatusQuery } from "../application/queries/get-production-day-status.query.js";

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
