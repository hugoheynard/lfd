import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { Invoice } from "../../domain/entities/invoice.js";
import { InvoiceAssemblyError } from "../../domain/errors/invoice-errors.js";
import { InvoiceIssuedFact } from "../../domain/events/invoice-issued.fact.js";
import { CreditNoteIssuedEvent, InvoiceIssuedEvent } from "../../domain/events/invoice.events.js";
import { InvoiceNumbering } from "../../domain/ports/invoice-numbering.js";
import { InvoiceRepository } from "../../domain/ports/invoice.repository.js";
import type { InvoiceNumber } from "../../domain/value-objects/invoice-number.js";

/** Une pièce à émettre : son entité, son jour, et de quoi la construire une fois numérotée. */
export interface InvoiceIssuance {
  readonly legalEntityId: string;
  /** `AAAA-MM-JJ` — son année choisit la séquence ; jamais avant la dernière émise. */
  readonly issuedOn: string;
  /**
   * Construit la pièce avec le numéro réservé : `invoiceFromDossier` pour une
   * facture, `Invoice.creditNote` pour un avoir. Appelé DANS la transaction :
   * un refus de l'agrégat rend le numéro avec elle.
   */
  readonly draft: (number: InvoiceNumber) => Invoice;
}

/**
 * **Émet une facture ou un avoir** (plan `plan-emission-de-la-facture.md`,
 * lot E2) : réserve le numéro, construit la pièce, l'écrit et la journalise,
 * dans UNE transaction courte. Tout échec la défait entière — numéro compris.
 *
 * Une facture (380) écrit aussi son fait durable `invoice.issued` dans la
 * même transaction (E6) : c'est lui qui fait partir « Votre facture FA-… »,
 * et seulement si l'émission est validée. Un avoir n'en écrit pas.
 *
 * Aucune décision métier ici : qui facturer, quand, sur quels bons, c'est la
 * facture du mois (E4) et la facture carte (E5) qui le diront en l'appelant.
 */
@Injectable()
export class InvoiceIssuer {
  constructor(
    private readonly numbering: InvoiceNumbering,
    private readonly invoices: InvoiceRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
  ) {}

  /**
   * @throws ce que l'agrégat refuse (`InvoiceIssuanceBlockedError`, …) — sans numéro consommé.
   * @throws {InvoiceAssemblyError} la pièce construite n'est pas de l'entité ou du jour demandés.
   */
  async issue(request: InvoiceIssuance): Promise<Invoice> {
    const at = this.clock.now();
    return this.uow.run(async () => {
      const number = await this.numbering.next(request.legalEntityId, request.issuedOn);
      const invoice = request.draft(number);
      assertMatches(invoice, request);
      await this.invoices.insert(invoice);
      if (invoice.isCreditNote) {
        await this.events.publishTraced(new CreditNoteIssuedEvent(invoice, at));
      } else {
        await this.events.publishTraced(new InvoiceIssuedEvent(invoice, at));
        await this.durable.publish(new InvoiceIssuedFact(invoice.id).durableFact());
      }
      return invoice;
    });
  }
}

/** Le numéro a été pris pour UNE séquence : la pièce doit en être. */
function assertMatches(invoice: Invoice, request: InvoiceIssuance): void {
  const state = invoice.toState();
  if (state.legalEntityId !== request.legalEntityId || state.issuedOn !== request.issuedOn) {
    throw new InvoiceAssemblyError(
      state.number,
      `pièce de l'entité ${state.legalEntityId} du ${state.issuedOn}, numéro pris pour ` +
        `${request.legalEntityId} du ${request.issuedOn}`,
    );
  }
}
