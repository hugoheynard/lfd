import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { CommandBus } from "@nestjs/cqrs";

import { Public } from "../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../platform/auth/recompute.guard.js";
import {
  RunCollectionAutopilotCommand,
  type CollectionAutopilotReport,
} from "../application/commands/run-collection-autopilot.command.js";
import {
  RunInvoiceAutopilotCommand,
  type InvoiceAutopilotReport,
} from "../application/commands/run-invoice-autopilot.command.js";

/** Ce que le passage horaire a tenté : les factures du mois, puis les lots. */
export interface HourlyAccountingReport extends CollectionAutopilotReport {
  readonly invoiceRuns: InvoiceAutopilotReport["runs"];
}

/**
 * Endpoint **machine** de la constitution automatique (plan
 * `documentation/facturation/prelevement-automatique.md`, PA3).
 *
 * Même porte que `admin/orders/settlement-reminders` — le `RecomputeGuard`
 * et son jeton, présentés par le Worker sur un Cron Trigger horaire PROPRE
 * (`COLLECTION_AUTOPILOT_CRON`, `container/worker.ts`) : un cron partagé avec
 * les relances aurait lié deux rythmes qui n'ont rien à voir (`vitruve`, § 8).
 *
 * Depuis E4 (plan `plan-emission-de-la-facture.md`), le MÊME passage émet
 * d'abord la facture du mois (le dernier jour à 22h15) : un second cron
 * aurait doublé la déclaration (`wrangler.jsonc`, `worker.ts`, leur test de
 * concordance) pour le même rythme horaire. La facture passe AVANT le lot :
 * quand un passage manqué les rend dus ensemble, le lot trouve les factures.
 */
@Controller("admin/accounting/collection/autopilot")
@Public()
@UseGuards(RecomputeGuard)
export class CollectionAutopilotController {
  constructor(private readonly commands: CommandBus) {}

  @Post()
  @HttpCode(200)
  async run(): Promise<HourlyAccountingReport> {
    const invoices = await this.commands.execute<
      RunInvoiceAutopilotCommand,
      InvoiceAutopilotReport
    >(new RunInvoiceAutopilotCommand());
    const collection = await this.commands.execute<
      RunCollectionAutopilotCommand,
      CollectionAutopilotReport
    >(new RunCollectionAutopilotCommand());
    return { ...collection, invoiceRuns: invoices.runs };
  }
}
