import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  BankTransfers,
  type RecordedTransferView,
} from "../../../../payment/channels/requests/index.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { INVOICE_PAYMENT_SUBJECT } from "../../domain/entities/invoice.types.js";
import { BankTransferGapFoundEvent } from "../../domain/events/bank-transfer-gap.event.js";
import { BankTransferTraceReader } from "../../domain/ports/bank-transfer-trace.reader.js";
import {
  type BankTransferGap,
  type InvoiceAllocationFact,
  recordedTransferGaps,
  type RecordedTransferFact,
  settledOrderGaps,
} from "../../domain/services/bank-transfer-consistency.js";
import {
  type BankTransferConsistencyReport,
  CheckBankTransferConsistencyCommand,
} from "./check-bank-transfer-consistency.command.js";

/**
 * La fenêtre relue à chaque passage : trois nuits. Le contrôle passe chaque
 * nuit ; une nuit manquée (cron en échec, container lent) est rattrapée par
 * les deux suivantes, et un écart déjà sonné ne sonne pas deux fois (clé de
 * la cloche).
 */
export const CONSISTENCY_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

/** La taille d'un lot de sujets demandé au bloc. */
const ALLOCATION_BATCH = 500;

/**
 * **Le contrôle de cohérence du virement reçu** (§3.6, décision de Hugo du
 * 2026-11-22) — ce qui remplace les clés étrangères entre la facturation et
 * le bloc `payment`, comme dans un service de paiement à part.
 *
 * Deux sens, sur la fenêtre : les bons réglés par virement trouvent-ils, au
 * bloc, la part de leur virement sur leur facture ? Les virements que le bloc
 * a enregistrés tombent-ils sur des factures connues, dont tous les bons sont
 * réglés par eux ? Chaque écart : une ligne au journal technique, et la
 * cloche. **Rien n'est corrigé** : un écart d'argent se regarde.
 */
@CommandHandler(CheckBankTransferConsistencyCommand)
export class CheckBankTransferConsistencyHandler implements ICommandHandler<
  CheckBankTransferConsistencyCommand,
  BankTransferConsistencyReport
> {
  private readonly logger = new Logger(CheckBankTransferConsistencyHandler.name);

  constructor(
    private readonly trace: BankTransferTraceReader,
    private readonly bankTransfers: BankTransfers,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<BankTransferConsistencyReport> {
    const since = new Date(this.clock.now().getTime() - CONSISTENCY_LOOKBACK_MS);
    const orders = await this.trace.settledOrdersSince(since);
    const allocations = await this.allocationsOf(
      orders.flatMap((order) => (order.invoiceId === null ? [] : [order.invoiceId])),
    );
    const transfers = (await this.bankTransfers.recordedSince(since)).map(toFact);
    const invoices = await this.trace.invoicesOf([
      ...new Set(transfers.flatMap((transfer) => transfer.invoiceIds)),
    ]);
    const gaps = [
      ...settledOrderGaps(orders, allocations),
      ...recordedTransferGaps(transfers, invoices),
    ];
    for (const gap of gaps) {
      this.logger.error(`Virement reçu incohérent : ${describe(gap)}`);
      this.events.publish(new BankTransferGapFoundEvent(gap));
    }
    return {
      since: since.toISOString(),
      checkedOrders: orders.length,
      checkedTransfers: transfers.length,
      gaps: gaps.length,
    };
  }

  /** La part de chaque facture citée, demandée au bloc par lots. */
  private async allocationsOf(
    invoiceIds: readonly string[],
  ): Promise<readonly InvoiceAllocationFact[]> {
    const unique = [...new Set(invoiceIds)];
    const facts: InvoiceAllocationFact[] = [];
    for (let start = 0; start < unique.length; start += ALLOCATION_BATCH) {
      const batch = unique.slice(start, start + ALLOCATION_BATCH);
      const found = await this.bankTransfers.allocationsOf(
        batch.map((id) => ({ type: INVOICE_PAYMENT_SUBJECT, id })),
      );
      for (const allocation of found.values()) {
        facts.push({ invoiceId: allocation.subject.id, transferId: allocation.transferId });
      }
    }
    return facts;
  }
}

function toFact(transfer: RecordedTransferView): RecordedTransferFact {
  const invoiceIds: string[] = [];
  const otherSubjects: string[] = [];
  for (const part of transfer.parts) {
    if (part.subject.type === INVOICE_PAYMENT_SUBJECT) {
      invoiceIds.push(part.subject.id);
    } else {
      otherSubjects.push(`${part.subject.type}/${part.subject.id}`);
    }
  }
  return { transferId: transfer.id, invoiceIds, otherSubjects };
}

/** Identifiants seuls : la ligne de journal ne porte ni montant ni nom. */
function describe(gap: BankTransferGap): string {
  return (
    `${gap.kind} — virement ${gap.transferId}, facture ${gap.invoiceId ?? "aucune"}, ` +
    `bon ${gap.orderId ?? "aucun"}`
  );
}
