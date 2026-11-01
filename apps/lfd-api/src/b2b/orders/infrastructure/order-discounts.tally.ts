import { boundedSample } from "../../../platform/post-deploy/batches.js";
import {
  REPORT_SAMPLE_LIMIT,
  type OperationReport,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import type { BackfillReportLine } from "./prisma-order-discount-backfill.js";
import type { TermsBackfillLine } from "./prisma-order-discount-terms-backfill.js";

/**
 * **Le décompte des trois passes** de l'opération « remises des commandes » :
 * des comptes et des phrases par numéro de commande, jamais une donnée
 * personnelle.
 */
export class OrderDiscountsTally {
  private readonly missingLines: BackfillReportLine[] = [];
  private readonly driftedLines: BackfillReportLine[] = [];
  private readonly termsLines: TermsBackfillLine[] = [];

  missing(line: BackfillReportLine): void {
    this.missingLines.push(line);
  }

  drifted(line: BackfillReportLine): void {
    this.driftedLines.push(line);
  }

  terms(line: TermsBackfillLine): void {
    this.termsLines.push(line);
  }

  report(): OperationReport {
    const recovered = this.missingLines.filter(isWritable).length;
    const refreshed = this.driftedLines.filter(isWritable).length;
    const filled = this.termsLines.filter((line) => line.outcome.kind === "backfilled").length;
    const byHand = [
      ...[...this.missingLines, ...this.driftedLines].flatMap(handLine),
      ...this.termsLines.flatMap((line) =>
        line.outcome.kind === "undecided"
          ? [`Termes à trancher — ${line.orderNumber} : ${line.outcome.reason}`]
          : [],
      ),
    ];
    return {
      writable: recovered + refreshed + filled,
      byHand: byHand.length,
      summary: [
        `Remises manquantes : ${String(recovered)} à recréer sur ${String(this.missingLines.length)} commande(s) remisée(s) sans remise active.`,
        `Remises périmées : ${String(refreshed)} à reprendre sur ${String(this.driftedLines.length)} commande(s) en désaccord.`,
        `Termes figés : ${String(filled)} à déduire sur ${String(this.termsLines.length)} remise(s) sans termes.`,
        `${String(byHand.length)} cas à trancher à la main.`,
      ],
      sample: boundedSample(byHand, REPORT_SAMPLE_LIMIT),
    };
  }
}

/** Une ligne écrite (ou à écrire) : une remise recréée, ou des remises périmées archivées. */
function isWritable(line: BackfillReportLine): boolean {
  const kind = line.outcome.kind;
  return kind === "computed" || kind === "frozen" || kind === "archived";
}

function handLine(line: BackfillReportLine): readonly string[] {
  const { outcome } = line;
  if (outcome.kind === "undecided") {
    return [`À trancher — ${line.orderNumber} : ${outcome.reason}`];
  }
  if (outcome.kind === "unreadable") {
    return [`Illisible — ${line.orderNumber} : ${outcome.reason}`];
  }
  return [];
}
