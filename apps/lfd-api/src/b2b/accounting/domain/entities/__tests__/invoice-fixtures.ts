import { invoiceVatBreakdown, type InvoiceVatBreakdown } from "@lfd/money";

import type { InvoiceSellerFacts } from "../../services/invoice-issuance-blockers.js";
import { CREDITOR } from "../../services/__tests__/collection-fixtures.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { InvoicePaymentTerms } from "../../value-objects/invoice-payment-terms.js";
import { statementSellerOf } from "../billing-statement.js";
import { Invoice, type IssueInvoiceInput } from "../invoice.js";
import type { InvoiceBuyer, InvoiceLineInput } from "../invoice.types.js";

/**
 * Les données des specs de la facture. Les dates ne sont comparées qu'entre
 * elles (émission, échéance, numéro) — jamais à l'horloge.
 */

export const ISSUED_ON = "2026-09-30";
export const DUE_ON = "2026-10-14";

export const TERMS = InvoicePaymentTerms.create({
  latePenaltyRateBasisPoints: 1_415,
  recoveryIndemnityCents: 4_000,
  earlyPaymentDiscount: "Pas d'escompte pour paiement anticipé.",
});

export const SELLER = statementSellerOf(CREDITOR);

export const SELLER_FACTS: InvoiceSellerFacts = {
  legalEntityId: CREDITOR.legalEntityId,
  name: CREDITOR.name,
  legalForm: CREDITOR.legalForm,
  rcs: CREDITOR.rcs,
  vatNumber: "FR00900000001",
  archived: false,
  paymentTerms: TERMS,
};

export const BUYER: InvoiceBuyer = {
  companyId: "c_port",
  name: "Boulangerie du Port",
  legalForm: "SARL",
  siret: "55210055400013",
  siren: "552100554",
  vatNumber: "FR89552100554",
  billingAddressLines: ["1 rue du Port", "73000 Chambéry", "France"],
};

/** Un prix de vitrine : la facture ne le multiplie jamais. */
const FIXTURE_UNIT_PRICE_MILLICENTS = 500_000;

export function line(
  sku: string,
  vatRate: number,
  amountCents: number,
  pieces = 1,
): InvoiceLineInput {
  return {
    sku,
    label: `Produit ${sku}`,
    unitCode: "H87",
    quantityThousandths: pieces * 1_000,
    // Le prix n'entre dans aucun invariant : le HT est repris des bons (F6).
    unitPriceMillicents: FIXTURE_UNIT_PRICE_MILLICENTS,
    vatRate,
    amountCents,
  };
}

export const LINES: readonly InvoiceLineInput[] = [
  line("PAIN", 5.5, 1_000, 2),
  line("JUS", 20, 500),
];

/** La ventilation que le simulateur aurait rendue pour ces lignes, sans remise ni frais. */
export function breakdownOf(lines: readonly InvoiceLineInput[]): InvoiceVatBreakdown {
  return invoiceVatBreakdown({
    goods: lines.map((l) => ({ htCents: l.amountCents, vatRate: l.vatRate })),
    allowances: [],
    charges: [],
  });
}

export function issueInput(overrides: Partial<IssueInvoiceInput> = {}): IssueInvoiceInput {
  return {
    id: "inv_1",
    number: InvoiceNumber.compose(2026, 1),
    issuedOn: ISSUED_ON,
    dueOn: DUE_ON,
    sellerFacts: SELLER_FACTS,
    seller: SELLER,
    buyer: BUYER,
    deliveryAddressLines: null,
    orders: [
      { orderId: "o_1", reference: "CMD-001", deliveredOn: "2026-09-12" },
      { orderId: "o_2", reference: "CMD-002", deliveredOn: null },
    ],
    lines: LINES,
    vat: breakdownOf(LINES),
    paymentMeans: null,
    prepayment: null,
    ...overrides,
  };
}

export function issuedInvoice(): Invoice {
  return Invoice.issue(issueInput());
}
