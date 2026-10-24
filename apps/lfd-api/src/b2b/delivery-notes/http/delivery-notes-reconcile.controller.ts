import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  ReconcileDeliveryNotesCommand,
  type DeliveryNoteReconciliationReport,
} from "../application/commands/reconcile-delivery-notes.command.js";

/**
 * Endpoint **machine** du réconciliateur des bons de livraison (plan
 * `documentation/commandes/plan-e2-rattrapage-des-bons.md`, § 8.2). Même
 * porte que `admin/outbox/sweep` : le `RecomputeGuard` et son jeton, présentés
 * par le Worker sur son cron horaire (`container/worker.ts`). Idempotent.
 */
@Controller("admin/delivery-notes/sweep")
@Public()
@UseGuards(RecomputeGuard)
export class DeliveryNotesReconcileController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  sweep(): Promise<DeliveryNoteReconciliationReport> {
    return this.commands.execute<ReconcileDeliveryNotesCommand, DeliveryNoteReconciliationReport>(
      new ReconcileDeliveryNotesCommand(),
    );
  }
}
