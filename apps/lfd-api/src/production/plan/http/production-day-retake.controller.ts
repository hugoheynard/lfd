import { type ProductionWorksheetRetake, productionWorksheetQuerySchema } from "@lfd/contracts";
import { Controller, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";
import { RetakeProductionDayCommand } from "../application/commands/retake-production-day.command.js";
import { Idempotent } from "../../../platform/shared/http/idempotent.decorator.js";

/** Le jour du chemin, validé dans sa FORME par un pipe : un 400 qui nomme le paramètre. */
const DAY = new ZodParam(productionWorksheetQuerySchema.shape.date, "date");

/**
 * **Le retirage**, un geste du plan : il recalcule le compte à produire
 * arrêté. Il se fait depuis la fiche d'atelier, d'où son chemin
 * (`worksheet/:date/retake`) et sa surface (`production_worksheet`), qui
 * ne changent pas avec le rangement.
 *
 * Il n'injecte qu'un bus. `lint:controller-buses` le tient.
 */
@Controller("admin/production")
@AdminSurface("production_worksheet")
export class ProductionDayRetakeController {
  constructor(private readonly commands: CommandBus) {}

  /**
   * **Reprendre le tirage** : absorber ce qui est arrivé depuis la clôture.
   *
   * Le geste est **attesté** — l'écran vient de montrer les lignes qui
   * changent et de dire laquelle a déjà une fournée. Sans auteur, ce serait le
   * recalcul silencieux que l'agrégat refuse.
   *
   * `absorbed: 0` n'est pas une erreur : rien n'était arrivé, et la réponse rend
   * le tirage que la fiche montre déjà.
   */
  @Post("worksheet/:date/retake")
  @Idempotent(
    "reprend les commandes arrivées : rejouée, il n'y a plus rien à absorber et ni l'écriture ni le journal ne partent",
  )
  async retake(
    @Param("date", DAY) date: string,
    @StaffUserId() staffUserId: string,
  ): Promise<ProductionWorksheetRetake> {
    return this.commands.execute<RetakeProductionDayCommand, ProductionWorksheetRetake>(
      new RetakeProductionDayCommand(date, staffUserId),
    );
  }
}
