import { isPublicLegalForm, legalFormSchema } from "@lfd/contracts";

import type { Prisma } from "../../../platform/database/client/client.js";
import {
  standingOf,
  type ChorusDepositEntry,
  type ChorusDepositKind,
  type ChorusInvoiceFacts,
} from "../domain/entities/chorus-deposit.js";
import { CREDIT_NOTE } from "../domain/entities/invoice.types.js";
import { UnreadableInvoiceError } from "../domain/errors/invoice-errors.js";
import type { ChorusListedInvoice } from "../domain/ports/chorus-invoices.reader.js";
import type { ChorusDepositStanding } from "../domain/services/public-invoice-due.js";
import { invoiceBuyerSchema } from "./invoice-json.schema.js";

const DAY_LENGTH = 10;
const KINDS: readonly ChorusDepositKind[] = ["deposited", "rejected", "accepted"];

/** Ce que le dépôt Chorus lit d'une pièce et de son journal, en une requête. */
export const CHORUS_INVOICE_SELECT = {
  id: true,
  number: true,
  type: true,
  issuedOn: true,
  dueOn: true,
  buyer: true,
  payerCompanyId: true,
  legalEntityId: true,
  legalEntity: { select: { name: true } },
  totalTtcCents: true,
  budgetCommitmentNumber: true,
  budgetCommitmentServiceCode: true,
  documentKey: true,
  creditNotes: { select: { id: true }, take: 1 },
  chorusDeposits: {
    select: {
      id: true,
      kind: true,
      occurredOn: true,
      reason: true,
      staffId: true,
      staffName: true,
      recordedAt: true,
    },
  },
} as const satisfies Prisma.InvoiceSelect;

type ChorusInvoiceRow = Prisma.InvoiceGetPayload<{ select: typeof CHORUS_INVOICE_SELECT }>;
type ChorusDepositRow = ChorusInvoiceRow["chorusDeposits"][number];

/**
 * Les pièces d'un acheteur public : sa forme juridique figée (`buyer.legalForm`)
 * est une des formes publiques. Le domaine rejuge (`isPublicInvoice`).
 */
export const PUBLIC_BUYER_WHERE: Prisma.InvoiceWhereInput = {
  OR: legalFormSchema.options
    .filter((form) => isPublicLegalForm(form))
    .map((form) => ({ buyer: { path: ["legalForm"], equals: form } })),
};

export function dayOf(column: Date): string {
  return column.toISOString().slice(0, DAY_LENGTH);
}

/** La facture et ce que le dépôt en juge. Un acheteur illisible : refus technique, jamais deviné. */
export function chorusFactsOf(row: ChorusInvoiceRow): ChorusInvoiceFacts {
  const buyer = invoiceBuyerSchema.safeParse(row.buyer);
  if (!buyer.success) {
    throw new UnreadableInvoiceError(row.id, "buyer");
  }
  return {
    invoiceId: row.id,
    number: row.number,
    payerCompanyId: row.payerCompanyId,
    payerName: buyer.data.name,
    isCreditNote: row.type === CREDIT_NOTE,
    buyerLegalForm: buyer.data.legalForm,
    issuedOn: dayOf(row.issuedOn),
    dueOn: row.dueOn === null ? null : dayOf(row.dueOn),
    creditedOut: row.creditNotes.length > 0,
  };
}

/** Le journal réduit à ses dates, depuis ses lignes lues (sorte, jour, motif). */
export function chorusStandingOfRows(
  invoiceId: string,
  rows: readonly Pick<ChorusDepositRow, "kind" | "occurredOn" | "reason">[],
): ChorusDepositStanding {
  return standingOf(
    rows.map((row) => ({
      kind: kindOf(invoiceId, row.kind),
      occurredOn: dayOf(row.occurredOn),
      reason: row.reason,
    })),
  );
}

function kindOf(invoiceId: string, kind: string): ChorusDepositKind {
  const known = KINDS.find((candidate) => candidate === kind);
  if (known === undefined) {
    throw new UnreadableInvoiceError(invoiceId, "invoice_chorus_deposit.kind");
  }
  return known;
}

/** Une ligne du journal ; une sorte inconnue : refus technique (le CHECK la tient). */
export function chorusEntryOf(invoiceId: string, row: ChorusDepositRow): ChorusDepositEntry {
  return {
    id: row.id,
    kind: kindOf(invoiceId, row.kind),
    occurredOn: dayOf(row.occurredOn),
    reason: row.reason,
    staffId: row.staffId,
    staffName: row.staffName,
    recordedAt: row.recordedAt,
  };
}

/** Une ligne de la page « Chorus Pro ». */
export function chorusListedOf(row: ChorusInvoiceRow): ChorusListedInvoice {
  return {
    ...chorusFactsOf(row),
    legalEntityId: row.legalEntityId,
    legalEntityName: row.legalEntity.name,
    totalTtcCents: row.totalTtcCents,
    budgetCommitmentNumber: row.budgetCommitmentNumber,
    budgetCommitmentServiceCode: row.budgetCommitmentServiceCode,
    documentAvailable: row.documentKey !== null,
    standing: chorusStandingOfRows(row.id, row.chorusDeposits),
  };
}
