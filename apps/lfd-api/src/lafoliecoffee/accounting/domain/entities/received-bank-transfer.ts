import {
  BankTransferAmountMismatchError,
  BankTransferInvoiceNotFoundError,
  BankTransferMixedPayersError,
  InvalidBankTransferError,
  InvoiceAlreadySettledByTransferError,
  InvoiceNotPaidByTransferError,
} from "../errors/bank-transfer-errors.js";
import { SEPA_CREDIT_TRANSFER } from "./invoice.types.js";

/** La longueur d'une référence lue sur un relevé (SEPA : 140 caractères). */
export const TRANSFER_REFERENCE_MAX = 140;

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * Une facture telle que le virement la juge : ce qu'elle doit encore, qui la
 * doit, son moyen figé, et si un virement l'a déjà réglée.
 */
export interface TransferInvoice {
  readonly invoiceId: string;
  readonly number: string;
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  /** Le code BG-16 figé à l'émission ; `null` sans moyen (avoir, sans mandat). */
  readonly paymentMeansCode: string | null;
  readonly isCreditNote: boolean;
  /** TTC moins ce qui était déjà payé à l'émission (BT-115). */
  readonly remainingCents: number;
  /** Le virement reçu qui la règle déjà ; `null` sinon. */
  readonly settledByTransferId: string | null;
  /** Ses bons, opaques. */
  readonly orderIds: readonly string[];
}

/** Ce que le staff lit sur le relevé. */
export interface BankTransferEntry {
  readonly amountCents: number;
  /** `AAAA-MM-JJ`, jour de Paris. */
  readonly receivedOn: string;
  readonly reference: string;
  readonly invoiceIds: readonly string[];
}

export interface RecordedBy {
  readonly transferId: string;
  readonly legalEntityId: string;
  readonly staffId: string;
  readonly at: Date;
  /** `AAAA-MM-JJ`, jour de Paris de `at` : un virement ne se reçoit pas demain. */
  readonly today: string;
}

export interface ReceivedBankTransferState {
  readonly id: string;
  readonly legalEntityId: string;
  readonly payerCompanyId: string;
  readonly payerName: string;
  readonly amountCents: number;
  readonly receivedOn: string;
  readonly reference: string;
  readonly recordedAt: Date;
  readonly recordedByStaffId: string;
  /** Les factures réglées, dans l'ordre saisi, avec leur reste dû. */
  readonly invoices: readonly SettledInvoice[];
}

export interface SettledInvoice {
  readonly invoiceId: string;
  readonly number: string;
  readonly amountCents: number;
  readonly orderIds: readonly string[];
}

/**
 * **Un virement reçu** (plan `plan-paiement-au-compte-par-virement.md`, V7) :
 * une somme lue sur le relevé, et les factures au virement d'UN payeur
 * qu'elle règle en entier. Pas de règlement partiel : le reste dû total des
 * factures égale le montant, au centime.
 *
 * La factory est le seul chemin : tout ce qui pourrait refuser l'écriture se
 * juge ici, avant que les commandes ne bougent. Un virement saisi ne change
 * plus — la base le tient en ajout seul.
 */
export class ReceivedBankTransfer {
  private constructor(private readonly state: ReceivedBankTransferState) {}

  /**
   * @param invoices les factures lues pour `entry.invoiceIds` (absentes : introuvables).
   * @throws {InvalidBankTransferError} montant, jour, référence ou liste mal formés.
   * @throws {BankTransferInvoiceNotFoundError} facture inconnue chez cette entité.
   * @throws {InvoiceNotPaidByTransferError} facture qui ne se règle pas par virement.
   * @throws {InvoiceAlreadySettledByTransferError} facture déjà réglée.
   * @throws {BankTransferMixedPayersError} factures de deux payeurs.
   * @throws {BankTransferAmountMismatchError} le reste dû ne fait pas le montant.
   */
  static record(
    entry: BankTransferEntry,
    invoices: readonly TransferInvoice[],
    by: RecordedBy,
  ): ReceivedBankTransfer {
    const reference = assertEntry(entry, by.today);
    const chosen = chosenInvoices(entry.invoiceIds, invoices, by.legalEntityId);
    const [first] = chosen;
    if (first === undefined) {
      throw new InvalidBankTransferError("choisir au moins une facture.");
    }
    for (const invoice of chosen) {
      assertSettleable(invoice, first.payerCompanyId);
    }
    const due = chosen.reduce((sum, invoice) => sum + invoice.remainingCents, 0);
    if (due !== entry.amountCents) {
      throw new BankTransferAmountMismatchError(entry.amountCents, due);
    }
    return new ReceivedBankTransfer({
      id: by.transferId,
      legalEntityId: by.legalEntityId,
      payerCompanyId: first.payerCompanyId,
      payerName: first.payerName,
      amountCents: entry.amountCents,
      receivedOn: entry.receivedOn,
      reference,
      recordedAt: by.at,
      recordedByStaffId: by.staffId,
      invoices: chosen.map((invoice) => ({
        invoiceId: invoice.invoiceId,
        number: invoice.number,
        amountCents: invoice.remainingCents,
        orderIds: invoice.orderIds,
      })),
    });
  }

  get id(): string {
    return this.state.id;
  }

  toState(): ReceivedBankTransferState {
    return this.state;
  }
}

/** Rend la référence nettoyée. */
function assertEntry(entry: BankTransferEntry, today: string): string {
  if (!Number.isSafeInteger(entry.amountCents) || entry.amountCents <= 0) {
    throw new InvalidBankTransferError("le montant doit être un nombre positif de centimes.");
  }
  if (!DAY.test(entry.receivedOn) || Number.isNaN(Date.parse(entry.receivedOn))) {
    throw new InvalidBankTransferError(
      `le jour de réception « ${entry.receivedOn} » n'est pas une date.`,
    );
  }
  if (entry.receivedOn > today) {
    throw new InvalidBankTransferError(
      `le jour de réception (${entry.receivedOn}) est dans le futur : saisir le jour lu sur le relevé.`,
    );
  }
  const reference = entry.reference.trim();
  if (reference === "" || reference.length > TRANSFER_REFERENCE_MAX) {
    throw new InvalidBankTransferError(
      `la référence lue sur le relevé est obligatoire, ${TRANSFER_REFERENCE_MAX} caractères au plus.`,
    );
  }
  if (new Set(entry.invoiceIds).size !== entry.invoiceIds.length) {
    throw new InvalidBankTransferError("une facture est citée deux fois.");
  }
  return reference;
}

/** Les factures dans l'ordre saisi ; une absente, ou d'une autre entité, est introuvable. */
function chosenInvoices(
  ids: readonly string[],
  invoices: readonly TransferInvoice[],
  legalEntityId: string,
): readonly TransferInvoice[] {
  const byId = new Map(invoices.map((invoice) => [invoice.invoiceId, invoice]));
  return ids.map((id) => {
    const invoice = byId.get(id);
    if (invoice === undefined || invoice.legalEntityId !== legalEntityId) {
      throw new BankTransferInvoiceNotFoundError(id);
    }
    return invoice;
  });
}

function assertSettleable(invoice: TransferInvoice, payerCompanyId: string): void {
  if (invoice.isCreditNote || invoice.paymentMeansCode !== SEPA_CREDIT_TRANSFER) {
    throw new InvoiceNotPaidByTransferError(invoice.number);
  }
  if (invoice.settledByTransferId !== null) {
    throw new InvoiceAlreadySettledByTransferError(invoice.number);
  }
  if (invoice.payerCompanyId !== payerCompanyId) {
    throw new BankTransferMixedPayersError(invoice.number);
  }
}
