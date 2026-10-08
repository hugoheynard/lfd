import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  RunInvoiceAutopilotCommand,
  type InvoiceAutopilotReport,
} from "../application/commands/run-invoice-autopilot.command.js";

/**
 * Endpoint **machine** de la facture du mois à 23h55 (plan
 * `documentation/comptabilite/facturation/plan-emission-de-la-facture.md`,
 * lot E4b) : présenté par le Worker sur son cron PROPRE
 * (`MONTHLY_INVOICE_CRON`, `55 21,22 * * *` UTC — 23h55 à Paris l'été pour
 * l'un, l'hiver pour l'autre), avec le jeton du `RecomputeGuard`.
 *
 * Il ne passe QUE la facture, jamais le lot : à 23h55 le dernier jour, la
 * clôture n'est pas atteinte, et le lot reste au passage horaire
 * (`collection-autopilot.controller.ts`). C'est le handler qui décide sur
 * l'heure de Paris (`monthToInvoice`) : les autres jours, et le passage de
 * l'heure qui ne tombe pas à 23h55, se taisent sur un mois déjà tenté.
 */
@Controller("admin/accounting/monthly-invoices/autopilot")
@Public()
@UseGuards(RecomputeGuard)
export class InvoiceAutopilotController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  run(): Promise<InvoiceAutopilotReport> {
    return this.commands.execute<RunInvoiceAutopilotCommand, InvoiceAutopilotReport>(
      new RunInvoiceAutopilotCommand(),
    );
  }
}
