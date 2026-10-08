import type {
  MonthlyInvoiceAutopilotOutcomeView,
  MonthlyInvoiceAutopilotRunView,
  MonthlyInvoiceView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  MonthlyInvoicesReader,
  type MonthlyInvoicesRead,
} from "../domain/ports/monthly-invoices.reader.js";
import { invoicePaymentMeansSchema } from "./invoice-json.schema.js";
import { BLOCKED_OUTCOME, ISSUED_OUTCOME } from "./prisma-monthly-invoice-outcomes.js";

const OUTCOMES: readonly MonthlyInvoiceAutopilotOutcomeView[] = [
  "pending",
  "issued",
  "nothing_to_invoice",
  "not_yet_open",
  "failed",
];

/** Les issues du mois, leurs factures, et la tentative automatique — trois lectures. */
@Injectable()
export class PrismaMonthlyInvoicesReader extends MonthlyInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofMonth(legalEntityId: string, month: string): Promise<MonthlyInvoicesRead> {
    const [floor, outcomes, run] = await Promise.all([
      this.prisma.invoicingFloor.findUnique({ where: { id: true } }),
      this.prisma.invoiceMonthlyOutcome.findMany({
        where: { legalEntityId, month },
        orderBy: [{ payerName: "asc" }, { mandateReference: "asc" }],
        include: {
          invoice: {
            select: {
              id: true,
              number: true,
              issuedOn: true,
              dueOn: true,
              totalTtcCents: true,
              paymentMeans: true,
              _count: { select: { orders: true } },
            },
          },
        },
      }),
      this.prisma.invoiceAutopilotRun.findUnique({
        where: { legalEntityId_month: { legalEntityId, month } },
      }),
    ]);
    return {
      floorAt: floor?.floorAt ?? null,
      invoices: outcomes.flatMap((row): MonthlyInvoiceView[] =>
        row.outcome !== ISSUED_OUTCOME || row.invoice === null
          ? []
          : [
              {
                invoiceId: row.invoice.id,
                number: row.invoice.number,
                payerCompanyId: row.payerCompanyId,
                payerName: row.payerName,
                issuedOn: dayOf(row.invoice.issuedOn),
                dueOn: row.invoice.dueOn === null ? null : dayOf(row.invoice.dueOn),
                totalCents: row.invoice.totalTtcCents,
                orderCount: row.invoice._count.orders,
                mandateReference:
                  invoicePaymentMeansSchema.safeParse(row.invoice.paymentMeans).data
                    ?.mandateReference ?? null,
                unbillableOrders: row.unbillableOrders,
              },
            ],
      ),
      signaled: outcomes
        .filter((row) => row.outcome === BLOCKED_OUTCOME)
        .map((row) => ({
          payerCompanyId: row.payerCompanyId,
          payerName: row.payerName,
          mandateReference: row.mandateReference,
          message: row.message ?? "",
          unbillableOrders: row.unbillableOrders,
          recordedAt: row.recordedAt.toISOString(),
        })),
      autopilotRun: run === null ? null : runView(run),
    };
  }
}

function runView(run: {
  readonly month: string;
  readonly ranAt: Date;
  readonly outcome: string;
  readonly message: string | null;
}): MonthlyInvoiceAutopilotRunView | null {
  const outcome = OUTCOMES.find((known) => known === run.outcome);
  // Le CHECK tient la liste ; une autre valeur ne s'affiche pas plutôt que mal.
  if (outcome === undefined) {
    return null;
  }
  return { month: run.month, ranAt: run.ranAt.toISOString(), outcome, message: run.message };
}

function dayOf(column: Date): string {
  return column.toISOString().slice(0, 10);
}
