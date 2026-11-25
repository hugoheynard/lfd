import {
  type MarkWorkshopStepRed,
  markWorkshopStepRedSchema,
  productionWorksheetQuerySchema,
} from "@lfd/contracts";
import { Body, Controller, Delete, HttpCode, Param, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { StaffUserId } from "../../../platform/auth/staff.decorator.js";
import { IntentKey } from "../../../platform/shared/http/intent-key.decorator.js";
import { ZodBody, ZodParam } from "../../../platform/shared/http/zod-body.pipe.js";
import { MarkStepDoneCommand } from "../application/commands/mark-step-done.command.js";
import { MarkStepRedCommand } from "../application/commands/mark-step-red.command.js";
import { UndoStepCommand } from "../application/commands/undo-step.command.js";

/** Le jour du chemin, validé dans sa FORME avant d'entrer (la figure de la fiche). */
const DAY = new ZodParam(productionWorksheetQuerySchema.shape.date, "date");

/** Le code de retour d'un geste qui n'a rien à rendre — le client relit la fiche. */
const NO_CONTENT = 204;

/**
 * **Les étapes d'une ligne** (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.3) : un
 * poste qui ne finit pas la ligne coche sa part, la met en rouge, ou la
 * décoche. Sous le même droit que « Fait » (`production_worksheet`), et par
 * intention : un double appui ne refait pas le geste.
 *
 * Un contrôleur à part de la fiche (`ProductionWorksheetController`), sous le
 * même préfixe : l'étape change pour une autre raison que la fournée. Il
 * n'injecte que le bus de commandes.
 */
@Controller("admin/production")
@AdminSurface("production_worksheet")
export class ProductionLineStepsController {
  constructor(private readonly commands: CommandBus) {}

  /** **« Étape faite »** : 409 si le poste finit la ligne ou n'en est pas un poste. */
  @Post("worksheet/:date/lines/:sku/steps/:workstationId")
  @HttpCode(NO_CONTENT)
  async markDone(
    @Param("date", DAY) date: string,
    @Param("sku") sku: string,
    @Param("workstationId") workstationId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<MarkStepDoneCommand, void>(
      new MarkStepDoneCommand(date, sku, workstationId, staffUserId, intentKey),
    );
  }

  /** **Le rouge d'une étape**, une raison si on veut ; sans plafond. */
  @Post("worksheet/:date/lines/:sku/steps/:workstationId/red")
  @HttpCode(NO_CONTENT)
  async markRed(
    @Param("date", DAY) date: string,
    @Param("sku") sku: string,
    @Param("workstationId") workstationId: string,
    @Body(new ZodBody(markWorkshopStepRedSchema)) body: MarkWorkshopStepRed,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<MarkStepRedCommand, void>(
      new MarkStepRedCommand(date, sku, workstationId, body.reason ?? null, staffUserId, intentKey),
    );
  }

  /** **Décocher** : l'étape attend de nouveau. */
  @Delete("worksheet/:date/lines/:sku/steps/:workstationId")
  @HttpCode(NO_CONTENT)
  async undo(
    @Param("date", DAY) date: string,
    @Param("sku") sku: string,
    @Param("workstationId") workstationId: string,
    @StaffUserId() staffUserId: string,
    @IntentKey() intentKey: string,
  ): Promise<void> {
    await this.commands.execute<UndoStepCommand, void>(
      new UndoStepCommand(date, sku, workstationId, staffUserId, intentKey),
    );
  }
}
