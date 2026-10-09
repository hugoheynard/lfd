import { invoiceVatBreakdown } from "@lfd/money";

import {
  BUYER,
  breakdownOf,
  issueInput,
  line,
  SELLER,
  SELLER_FACTS,
} from "../../entities/__tests__/invoice-fixtures.js";
import type { IssueInvoiceInput } from "../../entities/invoice.js";
import { Invoice } from "../../entities/invoice.js";
import {
  BANK_CARD,
  SEPA_DIRECT_DEBIT,
  type InvoiceLineInput,
} from "../../entities/invoice.types.js";
import { InvoiceNumber } from "../../value-objects/invoice-number.js";
import { refundCreditNote } from "../refund-credit-note.js";

/**
 * **Les pièces témoins de la validation Factur-X** : une par forme que
 * l'émission produit. Le Schematron EN 16931 (spec
 * `facturx-schematron.spec.ts`) et veraPDF (`verify:facturx-pdf`) passent sur
 * les MÊMES pièces. Les dates ne sont comparées qu'entre elles.
 */
/**
 * Les parties telles que la production les fige, et non telles que les
 * fixtures partagées les abrègent : le vendeur relu de `LegalAddress.lines()`
 * (pays en code, obligatoire) et portant son numéro de TVA, l'acheteur relu
 * de `prisma-statement-buyer.reader.ts` (pays en clair). Sans eux, le
 * Schematron refuse BR-09, BR-11 et BR-S-02 — à raison, mais sur une pièce
 * que l'émission ne produit pas (vérifié le 2026-10-09).
 */
function realisticInput(overrides: Partial<IssueInvoiceInput>): IssueInvoiceInput {
  return issueInput({
    seller: {
      ...SELLER,
      vatNumber: SELLER_FACTS.vatNumber,
      addressLines: ["Route de la Balme", "73000 Chambéry", "FR"],
    },
    buyer: { ...BUYER, billingAddressLines: [...BUYER.billingAddressLines, "France"] },
    ...overrides,
  });
}

export interface FacturXSample {
  /** Le nom du cas, et du fichier PDF rendu par le script veraPDF. */
  readonly name: string;
  readonly invoice: Invoice;
}

function multiRateWithDiscountAndDelivery(): Invoice {
  const lines: readonly InvoiceLineInput[] = [line("PAIN", 5.5, 1_333, 3), line("JUS", 20, 667)];
  const goods = lines.map((l) => ({ htCents: l.amountCents, vatRate: l.vatRate }));
  const vat = invoiceVatBreakdown({
    goods,
    allowances: [{ key: "company_discount", amountCents: 101 }],
    charges: [
      { key: "delivery_standard", htCents: 250, vatRate: 20 },
      { key: "delivery_follows_goods", htCents: 199, prorataBases: goods },
    ],
  });
  return Invoice.issue(realisticInput({ id: "inv_rates", lines, vat }));
}

function directDebit(): Invoice {
  return Invoice.issue(
    realisticInput({
      id: "inv_sdd",
      paymentMeans: { code: SEPA_DIRECT_DEBIT, mandateReference: "RUM-LFD-000042" },
    }),
  );
}

const CARD_LINES = [line("PAIN", 5.5, 1_000), line("JUS", 20, 500)];

function paidByCard(): Invoice {
  const vat = breakdownOf(CARD_LINES);
  return Invoice.issue(
    realisticInput({
      id: "inv_card",
      orders: [{ orderId: "o_1", reference: "CMD-001", deliveredOn: "2026-09-29" }],
      lines: CARD_LINES,
      vat,
      dueOn: "2026-09-30",
      paymentMeans: { code: BANK_CARD },
      prepayment: { amountCents: vat.totalCents, paidOn: "2026-09-28" },
    }),
  );
}

/** Un remboursement partiel de 7,00 € sur la facture carte, ventilé au prorata. */
function partialCreditNote(): Invoice {
  const corrected = paidByCard();
  const credit = refundCreditNote(corrected.toState().vat, [], 700);
  if (credit === null) {
    throw new Error("le remboursement témoin ne produit aucun avoir");
  }
  return Invoice.creditNote({
    id: "cn_partial",
    number: InvoiceNumber.compose(2026, 2),
    issuedOn: "2026-10-02",
    corrected,
    priorCreditNotes: [],
    orders: corrected.toState().orders,
    lines: credit.lines,
    vat: credit.vat,
  });
}

function weighed(): Invoice {
  const flour: InvoiceLineInput = {
    ...line("FARINE", 5.5, 154),
    unitCode: "KGM",
    quantityThousandths: 1_250,
    unitPriceMillicents: 123_456,
  };
  const lines = [flour, line("PAIN", 5.5, 1_000, 2)];
  return Invoice.issue(realisticInput({ id: "inv_kgm", lines, vat: breakdownOf(lines) }));
}

export function facturXSamples(): readonly FacturXSample[] {
  return [
    { name: "facture-du-mois", invoice: Invoice.issue(realisticInput({})) },
    { name: "plusieurs-taux-remise-livraison", invoice: multiRateWithDiscountAndDelivery() },
    { name: "prelevement-sepa", invoice: directDebit() },
    { name: "carte-acquittee", invoice: paidByCard() },
    { name: "avoir-partiel", invoice: partialCreditNote() },
    { name: "quantites-au-kilo", invoice: weighed() },
  ];
}
