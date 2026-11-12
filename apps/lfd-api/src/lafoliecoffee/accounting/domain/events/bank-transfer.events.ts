import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { ReceivedBankTransfer } from "../entities/received-bank-transfer.js";
import { ACCOUNTING_FACTS } from "./accounting-facts.js";
import type { LegalEntitySubject } from "./legal-entity.events.js";

/**
 * Un virement reçu a réglé des factures au virement (V7). Sujet : le payeur
 * — sa fiche le raconte ; l'entité est citée par son nom. Aucune coordonnée
 * bancaire : le montant, le jour, la référence lue et les factures.
 */
export class BankTransferReceivedEvent implements JournaledEvent {
  constructor(
    readonly transfer: ReceivedBankTransfer,
    readonly entity: LegalEntitySubject,
  ) {}

  journalFact(): JournalFact {
    const state = this.transfer.toState();
    return {
      type: ACCOUNTING_FACTS.bankTransferReceived,
      subjectType: "company",
      subjectId: state.payerCompanyId,
      occurredAt: state.recordedAt,
      payload: {
        subjectLabel: state.payerName,
        legalEntity: { id: this.entity.id, name: this.entity.name },
        amountCents: state.amountCents,
        receivedOn: state.receivedOn,
        reference: state.reference,
        invoices: state.invoices.map((invoice) => invoice.number),
      },
    };
  }
}
