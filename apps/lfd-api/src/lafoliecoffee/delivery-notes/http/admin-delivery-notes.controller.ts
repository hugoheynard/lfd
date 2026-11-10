import { Controller, HttpCode, Post } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import {
  ReconcileDeliveryNotesCommand,
  type DeliveryNoteReconciliationReport,
} from "../application/commands/reconcile-delivery-notes.command.js";

/**
 * **Le réconciliateur des BL, à la demande** (plan
 * plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.2 et § 8.4) :
 * le passage que le runbook fait lancer après le déploiement d'E2, et dont on
 * lit le compte rendu.
 *
 * Sous `ops_health` (`write` par le verbe), comme le rejeu des messages morts
 * de la boîte d'envoi : un geste de réparation lancé depuis la carte de santé,
 * pas un geste de commande. Aucune ressource neuve.
 */
@Controller("admin/delivery-notes/reconcile")
@AdminSurface("ops_health")
export class AdminDeliveryNotesController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  reconcile(): Promise<DeliveryNoteReconciliationReport> {
    return this.commands.execute<ReconcileDeliveryNotesCommand, DeliveryNoteReconciliationReport>(
      new ReconcileDeliveryNotesCommand(),
    );
  }
}
