import { grams, invoiceVatBreakdown, lineTotalCents, splitOrderByRate } from "@lfd/money";

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
import { simulateInvoiceDossier } from "../invoice-dossier.js";
import { invoiceFromDossier } from "../invoice-from-dossier.js";
import { refundCreditNote } from "../refund-credit-note.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import { frozenOrder } from "./collection-fixtures.js";
import { frozenBon, goodsLine } from "./per-order-cycle-fixtures.js";

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
    buyer: BUYER,
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
  // Un seul bon : sa remise et son port qui suit la marchandise, découpés sur lui.
  const split = splitOrderByRate({
    lines: goods,
    eligibleDiscountCents: 101,
    discountCents: 0,
    extras: [{ htCents: 199, followsGoods: true }],
  });
  const vat = invoiceVatBreakdown({
    goods,
    allowances: [{ key: "company_discount", byRate: split.eligibleDiscount }],
    charges: [
      { key: "delivery_standard", byRate: [{ vatRate: 20, amountCents: 250 }] },
      { key: "delivery_follows_goods", byRate: split.extras[0] ?? [] },
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
      orders: [{ orderId: "o_1", reference: "ORD-001", receivedOn: "2026-09-29" }],
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
    number: InvoiceNumber.compose("LFD", 2026, 2),
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

/**
 * Un cycle dont chaque bon a sa composition : remise de retrait sur le pain
 * seul (boisson exclue), port qui suit la marchandise, port au taux normal.
 * Les remises et le port arrivent découpés bon par bon (plan
 * `plan-remises-ventilees-bon-par-bon.md`, §3).
 */
function perOrderCycle(): Invoice {
  const computed = simulateInvoiceDossier([
    frozenBon({
      reference: "ORD-1",
      lines: [goodsLine("PAIN", 5.5, 2_333), goodsLine("JUS", 20, 1_001, true)],
      pickupDiscountCents: 467,
    }),
    frozenBon({
      reference: "ORD-2",
      lines: [goodsLine("PAIN", 5.5, 1_111), goodsLine("JUS", 20, 777), goodsLine("FLAN", 10, 499)],
      deliveryFeeCents: 333,
      deliveryVatMode: "follows_goods",
    }),
    frozenBon({
      reference: "ORD-3",
      lines: [goodsLine("JUS", 20, 3_001)],
      deliveryFeeCents: 250,
      deliveryVatMode: "standard",
    }),
  ]).invoice;
  const { lines: _lines, vat: _vat, ...issue } = realisticInput({ id: "inv_per_order" });
  return invoiceFromDossier({ ...issue, computed });
}

/** 12,34567 € HT le kilo : un prix au millicentime, que trente arrondis écartent. */
const GRAVLAX_PER_KILO = 1_234_567;

/** Un bon pro : le pain du fixture partagé, et 1 001 g de gravlax. */
function weighedBon(index: number): FrozenInvoiceOrder {
  const base = frozenOrder(`ORD-W${String(index)}`, new Date(index * 60_000));
  const gravlax = {
    sku: "GRAVLAX",
    productNameSnapshot: "Saumon gravlax",
    unitPriceMillicents: GRAVLAX_PER_KILO,
    vatRate: "5.50",
    quantity: 1_001,
    saleUnit: "weight" as const,
    lineTotalCents: lineTotalCents(GRAVLAX_PER_KILO, grams(1_001)),
  };
  return { ...base, lines: [...base.lines, gravlax], vatShares: null };
}

/**
 * La facture du mois d'un dossier au poids (plan `vente-au-poids.md`,
 * § 3 bis, point 7) : trente bons, une ligne KGM au prix net dérivé (BT-146)
 * et une ligne H87 à côté — par le chemin d'émission réel.
 */
function weighedDossier(): Invoice {
  const computed = simulateInvoiceDossier(
    Array.from({ length: 30 }, (_, index) => weighedBon(index)),
  ).invoice;
  const { lines: _lines, vat: _vat, ...issue } = realisticInput({ id: "inv_weighed_dossier" });
  return invoiceFromDossier({ ...issue, computed });
}

export function facturXSamples(): readonly FacturXSample[] {
  return [
    { name: "facture-du-mois", invoice: Invoice.issue(realisticInput({})) },
    { name: "plusieurs-taux-remise-livraison", invoice: multiRateWithDiscountAndDelivery() },
    { name: "prelevement-sepa", invoice: directDebit() },
    { name: "carte-acquittee", invoice: paidByCard() },
    { name: "avoir-partiel", invoice: partialCreditNote() },
    { name: "quantites-au-kilo", invoice: weighed() },
    { name: "remises-bon-par-bon", invoice: perOrderCycle() },
    { name: "dossier-au-poids", invoice: weighedDossier() },
  ];
}
