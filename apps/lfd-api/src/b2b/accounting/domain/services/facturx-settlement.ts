import type { InvoiceVatBreakdown, InvoiceVatCategory } from "@lfd/money";

import type { InvoiceState } from "../entities/invoice.types.js";
import { centsAmount, dateElement, ratePercent, textElement } from "./facturx-format.js";
import { paymentTermsDescription } from "./facturx-mentions.js";
import {
  COMPANY_DISCOUNT,
  DELIVERY_FOLLOWS_GOODS,
  DELIVERY_STANDARD,
  LATE_FEE_PREFIX,
  LOYALTY_VOUCHER,
} from "./invoice-dossier.js";

/**
 * `ApplicableHeaderTradeSettlement` du XML Factur-X, dans l'ordre du schéma
 * CII D16B : ICS BT-90, devise, moyen de paiement BG-16, ventilation BG-23,
 * remises BG-20 et frais BG-21, conditions BT-20, échéance BT-9 et RUM
 * BT-89, totaux BG-22, facture corrigée BT-25.
 *
 * Le prélèvement (E4, question E3a b) : quand la facture a figé un mandat,
 * le code 59 (UNTDID 4461), l'ICS du vendeur figé et la RUM. Sans mandat
 * figé, aucun moyen n'est écrit plutôt qu'un moyen deviné. Ordre des
 * éléments écrit de mémoire du XSD D16B, non vérifié contre lui.
 *
 * Tout est repris de la ventilation figée par l'émission ; rien n'est
 * recalculé ici. Une remise ou un frais se ventile en autant d'éléments que
 * de taux où il a une part non nulle : c'est la seule écriture que la norme
 * admet (BR-32 / BR-37 : une catégorie et un taux par élément).
 */

const CURRENCY = "EUR";
/** UNTDID 5153 — la TVA. */
const VAT_TYPE = "VAT";
/** UNCL 5305 — taux normal ou réduit, le seul régime que nous facturons. */
const STANDARD_CATEGORY = "S";

/** Le libellé lu (BT-97 / BT-104) d'une remise ou d'un frais, par sa clé de ventilation. */
const ALLOWANCE_CHARGE_REASONS: Readonly<Record<string, string>> = {
  [COMPANY_DISCOUNT]: "Remise client",
  [LOYALTY_VOUCHER]: "Bon de fidélité",
  [DELIVERY_STANDARD]: "Frais de livraison",
  [DELIVERY_FOLLOWS_GOODS]: "Frais de livraison",
};
const LATE_FEE_REASON = "Majoration de commande tardive";

/** La ligne de catégorie de TVA d'une ligne d'article (BG-30). */
export function lineTradeTax(rate: number): string {
  return [
    "<ram:ApplicableTradeTax>",
    textElement("ram:TypeCode", VAT_TYPE),
    textElement("ram:CategoryCode", STANDARD_CATEGORY),
    textElement("ram:RateApplicablePercent", ratePercent(rate)),
    "</ram:ApplicableTradeTax>",
  ].join("");
}

/** Le règlement de l'en-tête, en entier. */
export function headerSettlement(state: InvoiceState): string {
  return [
    "<ram:ApplicableHeaderTradeSettlement>",
    state.paymentMeans === null ? "" : textElement("ram:CreditorReferenceID", state.seller.ics),
    textElement("ram:InvoiceCurrencyCode", CURRENCY),
    paymentMeans(state),
    ...state.vat.categories.map(headerTradeTax),
    ...state.vat.categories.flatMap(allowanceCharges),
    paymentTerms(state),
    monetarySummation(state.vat),
    correctedInvoice(state.correctedInvoiceNumber),
    "</ram:ApplicableHeaderTradeSettlement>",
  ].join("");
}

/** BG-16 — BT-81, le code du moyen ; rien sans mandat figé. */
function paymentMeans(state: InvoiceState): string {
  if (state.paymentMeans === null) {
    return "";
  }
  return [
    "<ram:SpecifiedTradeSettlementPaymentMeans>",
    textElement("ram:TypeCode", state.paymentMeans.code),
    "</ram:SpecifiedTradeSettlementPaymentMeans>",
  ].join("");
}

/** BG-23 — base (BT-116), TVA (BT-117), catégorie (BT-118), taux (BT-119). */
function headerTradeTax(category: InvoiceVatCategory): string {
  return [
    "<ram:ApplicableTradeTax>",
    textElement("ram:CalculatedAmount", centsAmount(category.vatCents)),
    textElement("ram:TypeCode", VAT_TYPE),
    textElement("ram:BasisAmount", centsAmount(category.taxableBaseCents)),
    textElement("ram:CategoryCode", STANDARD_CATEGORY),
    textElement("ram:RateApplicablePercent", ratePercent(category.rate)),
    "</ram:ApplicableTradeTax>",
  ].join("");
}

function allowanceCharges(category: InvoiceVatCategory): readonly string[] {
  const allowances = category.allowances
    .filter((part) => part.amountCents !== 0)
    .map((part) => allowanceCharge(false, part.key, part.amountCents, category.rate));
  const charges = category.charges
    .filter((part) => part.amountCents !== 0)
    .map((part) => allowanceCharge(true, part.key, part.amountCents, category.rate));
  return [...allowances, ...charges];
}

/** BG-20 (remise, `false`) ou BG-21 (frais, `true`), sur UN taux. */
function allowanceCharge(isCharge: boolean, key: string, cents: number, rate: number): string {
  return [
    "<ram:SpecifiedTradeAllowanceCharge>",
    `<ram:ChargeIndicator><udt:Indicator>${String(isCharge)}</udt:Indicator></ram:ChargeIndicator>`,
    textElement("ram:ActualAmount", centsAmount(cents)),
    textElement("ram:Reason", reasonOf(key)),
    "<ram:CategoryTradeTax>",
    textElement("ram:TypeCode", VAT_TYPE),
    textElement("ram:CategoryCode", STANDARD_CATEGORY),
    textElement("ram:RateApplicablePercent", ratePercent(rate)),
    "</ram:CategoryTradeTax>",
    "</ram:SpecifiedTradeAllowanceCharge>",
  ].join("");
}

/** Une clé inconnue s'écrit telle quelle : un libellé brut vaut mieux qu'un libellé deviné. */
function reasonOf(key: string): string {
  if (key.startsWith(LATE_FEE_PREFIX)) {
    return LATE_FEE_REASON;
  }
  return ALLOWANCE_CHARGE_REASONS[key] ?? key;
}

/** BT-20 et BT-9 ; un avoir n'a pas d'échéance, ses conditions restent dites. */
function paymentTerms(state: InvoiceState): string {
  return [
    "<ram:SpecifiedTradePaymentTerms>",
    textElement("ram:Description", paymentTermsDescription(state)),
    state.dueOn === null ? "" : dateElement("ram:DueDateDateTime", state.dueOn, "udt"),
    state.paymentMeans === null
      ? ""
      : textElement("ram:DirectDebitMandateID", state.paymentMeans.mandateReference),
    "</ram:SpecifiedTradePaymentTerms>",
  ].join("");
}

/**
 * BG-22 — BT-106 Σ lignes, BT-108 frais, BT-107 remises, BT-109 HT, BT-110
 * TVA, BT-112 TTC, BT-115 à payer. Aucun acompte ni arrondi (BT-113,
 * BT-114) : à payer = TTC.
 */
function monetarySummation(vat: InvoiceVatBreakdown): string {
  return [
    "<ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    textElement("ram:LineTotalAmount", centsAmount(vat.goodsHtCents)),
    textElement("ram:ChargeTotalAmount", centsAmount(vat.chargesCents)),
    textElement("ram:AllowanceTotalAmount", centsAmount(vat.allowancesCents)),
    textElement("ram:TaxBasisTotalAmount", centsAmount(vat.taxableBaseCents)),
    textElement("ram:TaxTotalAmount", centsAmount(vat.vatCents), ` currencyID="${CURRENCY}"`),
    textElement("ram:GrandTotalAmount", centsAmount(vat.totalCents)),
    textElement("ram:DuePayableAmount", centsAmount(vat.totalCents)),
    "</ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
  ].join("");
}

/** BT-25 — la facture que l'avoir corrige. Sa date (BT-26) n'est pas figée sur l'avoir. */
function correctedInvoice(number: string | null): string {
  if (number === null) {
    return "";
  }
  return `<ram:InvoiceReferencedDocument>${textElement("ram:IssuerAssignedID", number)}</ram:InvoiceReferencedDocument>`;
}
