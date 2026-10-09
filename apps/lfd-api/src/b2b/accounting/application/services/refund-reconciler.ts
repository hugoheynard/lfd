import { instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import { Invoice } from "../../domain/entities/invoice.js";
import { RefundNotCreditedEvent } from "../../domain/events/refund-not-credited.event.js";
import { OrderInvoicesReader } from "../../domain/ports/order-invoices.reader.js";
import {
  RefundCreditLinks,
  RefundsToCreditReader,
  type CreditableRefund,
} from "../../domain/ports/refunds-to-credit.js";
import {
  refundCreditNote,
  type RefundCreditNote,
} from "../../domain/services/refund-credit-note.js";
import { InvoiceIssuer } from "./invoice-issuer.js";

/** Pourquoi un remboursement réussi reste sans avoir — et qu'un humain doit le voir. */
export type RefundNotCreditedReason = "account_invoice" | "exceeds_invoice";

/**
 * **Le rapprochement des remboursements** (plan
 * `facture-carte-et-remboursements.md`) : un
 * BALAYAGE, pas un effet de bord. Pour chaque remboursement réussi sans avoir
 * d'une commande qui a une facture carte, un avoir du montant — ventilé au
 * prorata (`refundCreditNote`), le dernier prenant le reste exact.
 *
 * Appelé après chaque facture carte émise et après chaque remboursement
 * réussi constaté, **sous le verrou de la commande** que l'appelant a pris :
 * il rattrape donc aussi un remboursement noté avant le retrait.
 *
 * Sans facture : rien (la facture viendra, ou la commande n'en aura pas). Une
 * facture qui n'est PAS une facture carte (la facture du mois) : aucun avoir
 * automatique — le remboursement d'un bon au compte dit autre chose que la
 * vente (A11), il est signalé au journal et à la cloche. Un montant qui
 * dépasse ce que la facture porte encore (un avoir manuel est passé avant)
 * est signalé de même : jamais un avoir faux, jamais une boucle.
 */
@Injectable()
export class RefundReconciler {
  constructor(
    private readonly invoices: OrderInvoicesReader,
    private readonly refunds: RefundsToCreditReader,
    private readonly links: RefundCreditLinks,
    private readonly issuer: InvoiceIssuer,
    private readonly journal: Journal,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  /** @returns le nombre d'avoirs émis. */
  async reconcile(orderId: string): Promise<number> {
    const pending = (await this.refunds.succeededOf(orderId)).filter(
      (r) => r.creditNoteId === null,
    );
    if (pending.length === 0) {
      return 0;
    }
    const pieces = await this.invoices.ofOrder(orderId);
    const invoice = pieces.find((piece) => !piece.isCreditNote);
    if (invoice === undefined) {
      return 0;
    }
    const notes = pieces.filter((piece) => piece.toState().correctedInvoiceId === invoice.id);
    let issued = 0;
    for (const refund of pending) {
      const note = invoice.isPrepaid ? this.creditFor(invoice, notes, refund) : null;
      if (note === null) {
        const reason = invoice.isPrepaid ? "exceeds_invoice" : "account_invoice";
        await this.signal(orderId, invoice, refund, reason);
        continue;
      }
      const credit = await this.issue(orderId, invoice, notes, note);
      await this.links.link(refund.refundId, credit.id);
      notes.push(credit);
      issued += 1;
    }
    return issued;
  }

  private creditFor(
    invoice: Invoice,
    notes: readonly Invoice[],
    refund: CreditableRefund,
  ): RefundCreditNote | null {
    const prior = notes.map((note) => note.toState().vat);
    return refundCreditNote(invoice.toState().vat, prior, refund.amountCents);
  }

  private issue(
    orderId: string,
    invoice: Invoice,
    notes: readonly Invoice[],
    note: RefundCreditNote,
  ): Promise<Invoice> {
    const state = invoice.toState();
    const issuedOn = instantToLocal(this.clock.now()).day;
    const id = this.ids.next();
    const order = state.orders.filter((reference) => reference.orderId === orderId);
    return this.issuer.issue({
      legalEntityId: state.legalEntityId,
      issuedOn,
      draft: (number) =>
        Invoice.creditNote({
          id,
          number,
          issuedOn,
          corrected: invoice,
          priorCreditNotes: notes,
          orders: order,
          lines: note.lines,
          vat: note.vat,
        }),
    });
  }

  /** Le journal dans la transaction ; la cloche par un fait en mémoire. */
  private async signal(
    orderId: string,
    invoice: Invoice,
    refund: CreditableRefund,
    reason: RefundNotCreditedReason,
  ): Promise<void> {
    const reference = invoice.toState().orders.find((o) => o.orderId === orderId);
    const orderNumber = reference?.reference ?? orderId;
    await this.journal.append({
      type: "order.refund_not_credited",
      subjectType: "order",
      subjectId: orderId,
      payload: {
        subjectLabel: orderNumber,
        amountCents: refund.amountCents,
        invoice: { id: invoice.id, name: invoice.number },
        reason,
      },
    });
    this.events.publish(
      new RefundNotCreditedEvent(
        orderId,
        orderNumber,
        refund.refundId,
        refund.amountCents,
        invoice.number,
        reason,
      ),
    );
  }
}
