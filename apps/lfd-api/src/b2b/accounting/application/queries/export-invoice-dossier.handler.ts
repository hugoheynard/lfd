import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { InvoiceDossierReader } from "../../domain/ports/invoice-dossier.reader.js";
import { StatementBillingReader } from "../../domain/ports/statement-billing.reader.js";
import {
  gapsCsv,
  invoiceCsv,
  ordersCsv,
  type InvoiceDossierCsvHeading,
} from "../../domain/services/invoice-dossier-csv.js";
import { buildInvoiceDossier, type BuiltInvoiceDossier } from "../invoice-dossier-support.js";
import { ExportInvoiceDossierQuery, type InvoiceDossierSheet } from "./invoice-dossier-queries.js";

/** Le fichier et le nom qu'on propose au navigateur. */
export interface InvoiceDossierFile {
  readonly csv: string;
  readonly fileName: string;
}

interface SheetRenderer {
  readonly prefix: string;
  render(built: BuiltInvoiceDossier, heading: InvoiceDossierCsvHeading): string;
}

/** Une sortie, un rendu : une sortie de plus est une entrée de plus, pas une branche. */
const SHEETS: Readonly<Record<InvoiceDossierSheet, SheetRenderer>> = {
  invoice: { prefix: "FACTURE-SIMULEE", render: (built, h) => invoiceCsv(built.dossier, h) },
  orders: { prefix: "BONS", render: (built, h) => ordersCsv(built.orders, built.calendar, h) },
  gaps: { prefix: "ECARTS", render: (built, h) => gapsCsv(built.dossier, h) },
};

/**
 * Une sortie du dossier en CSV — le **même** dossier que l'écran, par
 * `buildInvoiceDossier`. Le nom porte « SIMULE » ou la nature du fichier : un
 * fichier rangé sur un bureau perd son contexte, jamais son nom.
 */
@QueryHandler(ExportInvoiceDossierQuery)
export class ExportInvoiceDossierHandler implements IQueryHandler<
  ExportInvoiceDossierQuery,
  InvoiceDossierFile
> {
  constructor(
    private readonly dossiers: InvoiceDossierReader,
    private readonly billing: StatementBillingReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: ExportInvoiceDossierQuery): Promise<InvoiceDossierFile> {
    const built = await buildInvoiceDossier(
      { dossiers: this.dossiers, billing: this.billing, clock: this.clock },
      query.companyId,
      query.month,
    );
    const month = built.month.toString();
    const sheet = SHEETS[query.sheet];
    return {
      csv: sheet.render(built, {
        companyName: built.companyName,
        month,
        inProgress: built.inProgress,
      }),
      fileName: `DOSSIER-${sheet.prefix}-${built.companyName}-${month}.csv`,
    };
  }
}
