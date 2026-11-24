import type {
  ChorusDepositStatusView,
  BudgetCommitmentView,
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
import {
  COMMERCIAL_INVOICE,
  CREDIT_NOTE,
  mandateReferenceOf,
} from "../domain/entities/invoice.types.js";
import { chorusStatusViewOf } from "../domain/services/chorus-status-view.js";
import { budgetCommitmentOf } from "../domain/value-objects/invoice-budget-commitment.js";
import { chorusStandingOfRows } from "./chorus-deposit-rows.js";
import { invoicePaymentMeansSchema } from "./invoice-json.schema.js";
import { invoicePayerOf } from "./invoice-payer-name.js";
import { awaitingPeriodQuotesOf } from "./period-quote-views.js";
import { BLOCKED_OUTCOME, ISSUED_OUTCOME } from "./prisma-monthly-invoice-outcomes.js";

const OUTCOMES: readonly MonthlyInvoiceAutopilotOutcomeView[] = [
  "pending",
  "issued",
  "nothing_to_invoice",
  "not_yet_open",
  "failed",
];

/**
 * Les issues d'une clôture, leurs factures, ses devis de période en attente
 * (P2 bis), et la tentative automatique — quatre lectures ; deux de plus
 * quand un payeur est signalé (E10).
 */
@Injectable()
export class PrismaMonthlyInvoicesReader extends MonthlyInvoicesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ofPeriod(legalEntityId: string, periodClosesAt: Date): Promise<MonthlyInvoicesRead> {
    const [floor, outcomes, run, periodQuotes] = await Promise.all([
      // `findFirst`, jamais `findUnique` : Prisma regroupe les `findUnique`
      // simultanés en un `id: { in: [...] }`, qu'une clé booléenne refuse
      // (« Unknown argument `in` ») — la vue lit une clôture par carte, en
      // parallèle, depuis M4c (régression : 500 sur `GET monthly-invoices`).
      this.prisma.invoicingFloor.findFirst({ where: { id: true } }),
      this.prisma.invoiceMonthlyOutcome.findMany({
        where: { legalEntityId, periodClosesAt },
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
              type: true,
              buyer: true,
              chorusDeposits: { select: { kind: true, occurredOn: true, reason: true } },
              _count: { select: { orders: true } },
            },
          },
        },
      }),
      this.prisma.invoiceAutopilotRun.findUnique({
        where: { legalEntityId_periodClosesAt: { legalEntityId, periodClosesAt } },
      }),
      awaitingPeriodQuotesOf(this.prisma, legalEntityId, periodClosesAt),
    ]);
    const blocked = outcomes.filter((row) => row.outcome === BLOCKED_OUTCOME);
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
                mandateReference: mandateReferenceOf(
                  invoicePaymentMeansSchema.safeParse(row.invoice.paymentMeans).data ?? null,
                ),
                unbillableOrders: row.unbillableOrders,
                ...commitmentViewOf(row),
                ...chorusViewOf(row.invoice),
              },
            ],
      ),
      signaled: (await this.stillCarried(blocked, periodClosesAt)).map((row) => ({
        payerCompanyId: row.payerCompanyId,
        payerName: row.payerName,
        mandateReference: row.mandateReference,
        ...commitmentViewOf(row),
        message: row.message ?? "",
        unbillableOrders: row.unbillableOrders,
        recordedAt: row.recordedAt.toISOString(),
      })),
      periodQuotes,
      autopilotRun: run === null ? null : runView(run),
    };
  }

  /**
   * **E10 — un blocage sans commande ne s'affiche plus.** Un refus est rangé
   * sous sa clé (payeur, mandat, engagement) ; quand l'engagement de ses bons
   * a été corrigé depuis, la clé n'en porte plus aucun, et le refus resterait
   * à l'écran pour toujours (l'issue finale ne s'efface pas, elle reste en
   * base). Il est caché quand, parmi les bons non facturés du payeur passés
   * avant la clôture, aucun ne porte sa clé ET qu'au moins un porte un
   * engagement — ou que le refus en portait un. Un payeur privé n'a jamais
   * d'engagement : ses refus s'affichent tous, comme avant P2.
   */
  private async stillCarried<
    T extends {
      readonly payerCompanyId: string;
      readonly budgetCommitmentNumber: string;
      readonly budgetCommitmentServiceCode: string;
    },
  >(blocked: readonly T[], periodClosesAt: Date): Promise<readonly T[]> {
    const payers = [...new Set(blocked.map((row) => row.payerCompanyId))];
    if (payers.length === 0) {
      return [];
    }
    const orders = await this.prisma.order.findMany({
      where: {
        createdAt: { lt: periodClosesAt },
        status: { not: "cancelled" },
        OR: [
          { billedCompanyId: { in: payers } },
          { billedCompanyId: null, companyId: { in: payers } },
        ],
      },
      select: {
        id: true,
        companyId: true,
        billedCompanyId: true,
        budgetCommitmentNumber: true,
        budgetCommitmentServiceCode: true,
      },
    });
    const invoiced = await this.prisma.invoiceOrder.findMany({
      where: { orderId: { in: orders.map((order) => order.id) }, invoiceType: COMMERCIAL_INVOICE },
      select: { orderId: true },
    });
    const taken = new Set(invoiced.map((row) => row.orderId));
    const keys = new Map<string, Set<string>>();
    for (const order of orders.filter((candidate) => !taken.has(candidate.id))) {
      const payer = order.billedCompanyId ?? order.companyId ?? "";
      const set = keys.get(payer) ?? new Set<string>();
      set.add(
        commitmentKey(order.budgetCommitmentNumber ?? "", order.budgetCommitmentServiceCode ?? ""),
      );
      keys.set(payer, set);
    }
    return blocked.filter((row) => {
      const carried = keys.get(row.payerCompanyId) ?? new Set<string>();
      const own = commitmentKey(row.budgetCommitmentNumber, row.budgetCommitmentServiceCode);
      const anyCommitment = [...carried].some((key) => key !== NO_COMMITMENT_KEY);
      return carried.has(own) || (own === NO_COMMITMENT_KEY && !anyCommitment);
    });
  }
}

const NO_COMMITMENT_KEY = commitmentKey("", "");

function commitmentKey(number: string, serviceCode: string): string {
  return JSON.stringify([number, serviceCode]);
}

/** Les deux colonnes de clé d'une issue ; absentes de la vue quand elles sont vides (E11). */
function commitmentViewOf(row: {
  readonly budgetCommitmentNumber: string;
  readonly budgetCommitmentServiceCode: string;
}): { budgetCommitment?: BudgetCommitmentView } {
  const commitment = budgetCommitmentOf(
    row.budgetCommitmentNumber,
    row.budgetCommitmentServiceCode,
  );
  return commitment === null ? {} : { budgetCommitment: commitment };
}

function runView(run: {
  readonly periodClosesAt: Date;
  readonly ranAt: Date;
  readonly outcome: string;
  readonly message: string | null;
}): MonthlyInvoiceAutopilotRunView | null {
  const outcome = OUTCOMES.find((known) => known === run.outcome);
  // Le CHECK tient la liste ; une autre valeur ne s'affiche pas plutôt que mal.
  if (outcome === undefined) {
    return null;
  }
  return {
    periodClosesAt: run.periodClosesAt.toISOString(),
    ranAt: run.ranAt.toISOString(),
    outcome,
    message: run.message,
  };
}

function dayOf(column: Date): string {
  return column.toISOString().slice(0, 10);
}

/**
 * L'état Chorus d'une facture d'organisme public et son échéance effective
 * (T3′) ; rien pour toute autre.
 */
function chorusViewOf(invoice: {
  readonly id: string;
  readonly type: string;
  readonly buyer: unknown;
  readonly issuedOn: Date;
  readonly dueOn: Date | null;
  readonly chorusDeposits: readonly {
    readonly kind: string;
    readonly occurredOn: Date;
    readonly reason: string | null;
  }[];
}): { readonly chorus?: ChorusDepositStatusView } {
  const chorus = chorusStatusViewOf(
    {
      isCreditNote: invoice.type === CREDIT_NOTE,
      buyerLegalForm: invoicePayerOf(invoice.id, invoice.buyer).legalForm,
      issuedOn: dayOf(invoice.issuedOn),
      dueOn: invoice.dueOn === null ? null : dayOf(invoice.dueOn),
    },
    chorusStandingOfRows(invoice.id, invoice.chorusDeposits),
  );
  return chorus === null ? {} : { chorus };
}
