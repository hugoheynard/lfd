import { productionBatchQuerySchema } from "@lfd/contracts";
import { Controller, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../platform/auth/staff.decorator.js";
import { ZodParam } from "../../platform/shared/http/zod-body.pipe.js";
import { LaunchResupplyCommand } from "../application/commands/launch-resupply.command.js";

/** Le jour du chemin, validé dans sa FORME par un pipe (400 nommant le paramètre). */
const DAY = new ZodParam(productionBatchQuerySchema.shape.date, "date");

/**
 * **« Lancer » un réassort « au plus tôt »** — Prod manager › Réassorts (R4a,
 * `documentation/reassort-boutiques/plan-au-plus-tot.md` §2).
 *
 * Sous `production_resupply`, le droit du réassort au fournil (envoyer,
 * « Monté ») : un `POST` exige `production_resupply:write`. Aucun droit
 * nouveau. Le chemin garde le préfixe de la journée de fabrication
 * (`admin/production/batch/:date`) : c'est elle que le geste modifie.
 *
 * 204 : le client relit l'onglet, qui dit « Lancé par X à HH:MM » quand le
 * commerce a reçu le fait.
 */
@Controller("admin/production")
@AdminSurface("production_resupply")
export class ProductionResupplyLaunchController {
  constructor(private readonly commands: CommandBus) {}

  @Post("batch/:date/resupplies/:resupplyId/launch")
  @HttpCode(HttpStatus.NO_CONTENT)
  async launch(
    @Param("date", DAY) date: string,
    @Param("resupplyId") resupplyId: string,
    @StaffUserId() staffUserId: string,
  ): Promise<void> {
    await this.commands.execute<LaunchResupplyCommand, void>(
      new LaunchResupplyCommand(date, resupplyId, staffUserId),
    );
  }
}
