import type { InvoiceVatCategory, InvoiceVatPart } from "@lfd/money";

import { mandateReferenceOf, type InvoiceState } from "../entities/invoice.types.js";
import { centsAmount, dateElement, ratePercent, textElement } from "./facturx-format.js";
import { paymentTermsDescription } from "./facturx-mentions.js";
import {
  COMPANY_DISCOUNT,
  DELIVERY_FOLLOWS_GOODS,
  DELIVERY_STANDARD,
  LATE_FEE_PREFIX,
  LOYALTY_VOUCHER,
} from "./invoice-dossier.js";
import { BASKET_PROMOTION_PREFIX } from "./invoice-discount-allowances.js";

/**
 * `ApplicableHeaderTradeSettlement` du XML Factur-X, dans l'ordre du schéma
 * CII D16B : ICS BT-90, devise, moyen de paiement BG-16, ventilation BG-23,
 * remises BG-20 et frais BG-21, conditions BT-20, échéance BT-9 et RUM
 * BT-89, totaux BG-22, facture corrigée BT-25.
 *
 * Le prélèvement (E4, question E3a b) : quand la facture a figé un mandat,
 * le code 59 (UNTDID 4461), l'ICS du vendeur figé et la RUM. La carte (E5a) :
 * le code 48 seul, et le déjà payé (BT-113). Sans moyen figé, aucun n'est
 * écrit plutôt qu'un moyen deviné. Ordre des
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
/**
 * BT-97 d'une remise de promotion sans libellé figé (plan des promotions,
 * § 18.4, lot M5) : un identifiant de promotion n'est jamais un motif.
 */
const BASKET_PROMOTION_FALLBACK_REASON = "Remise";

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
    mandateReferenceOf(state.paymentMeans) === null
      ? ""
      : textElement("ram:CreditorReferenceID", state.seller.ics),
    textElement("ram:InvoiceCurrencyCode", CURRENCY),
    paymentMeans(state),
    ...state.vat.categories.map(headerTradeTax),
    billingPeriod(state),
    ...state.vat.categories.flatMap(allowanceCharges),
    paymentTerms(state),
    monetarySummation(state),
    correctedInvoice(state.correctedInvoiceNumber),
    "</ram:ApplicableHeaderTradeSettlement>",
  ].join("");
}

/** BG-16 — BT-81, le code du moyen (59 prélèvement, 48 carte) ; rien sans moyen figé. */
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

/**
 * BG-14 — la période de facturation (BT-73, BT-74) d'une pièce qui couvre
 * PLUSIEURS bons : du premier au dernier livré. Ce que la norme prévoit pour
 * une facture récapitulative, là où BT-72 (une date de livraison unique) ne
 * peut pas l'être. L'émission refuse déjà un bon sans date réelle
 * (`InvoiceIssuanceBlockedError`, `invoice-parties.ts` — vérifié le
 * 2026-10-31) ; le type la laisse nullable, d'où le garde : une période
 * calculée sans ce bon en dirait une fausse. Une pièce d'un seul bon porte
 * déjà BT-72 (`headerDelivery`).
 */
export function billingPeriod(state: InvoiceState): string {
  if (state.orders.length < 2) {
    return "";
  }
  const dates: string[] = [];
  for (const order of state.orders) {
    if (order.receivedOn === null) {
      return "";
    }
    dates.push(order.receivedOn);
  }
  dates.sort();
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (start === undefined || end === undefined) {
    return "";
  }
  return [
    "<ram:BillingSpecifiedPeriod>",
    dateElement("ram:StartDateTime", start, "udt"),
    dateElement("ram:EndDateTime", end, "udt"),
    "</ram:BillingSpecifiedPeriod>",
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
    .map((part) => allowanceCharge(false, part, category.rate));
  const charges = category.charges
    .filter((part) => part.amountCents !== 0)
    .map((part) => allowanceCharge(true, part, category.rate));
  return [...allowances, ...charges];
}

/** BG-20 (remise, `false`) ou BG-21 (frais, `true`), sur UN taux. */
function allowanceCharge(isCharge: boolean, part: InvoiceVatPart, rate: number): string {
  return [
    "<ram:SpecifiedTradeAllowanceCharge>",
    `<ram:ChargeIndicator><udt:Indicator>${String(isCharge)}</udt:Indicator></ram:ChargeIndicator>`,
    textElement("ram:ActualAmount", centsAmount(part.amountCents)),
    textElement("ram:Reason", reasonOf(part)),
    "<ram:CategoryTradeTax>",
    textElement("ram:TypeCode", VAT_TYPE),
    textElement("ram:CategoryCode", STANDARD_CATEGORY),
    textElement("ram:RateApplicablePercent", ratePercent(rate)),
    "</ram:CategoryTradeTax>",
    "</ram:SpecifiedTradeAllowanceCharge>",
  ].join("");
}

/**
 * Le libellé figé d'abord (une remise de promotion, lot M5) ; sinon celui de
 * la clé. Une clé inconnue s'écrit telle quelle : un libellé brut vaut mieux
 * qu'un libellé deviné.
 */
function reasonOf(part: InvoiceVatPart): string {
  const { key } = part;
  if (part.label !== undefined) {
    return part.label;
  }
  if (key.startsWith(BASKET_PROMOTION_PREFIX)) {
    return BASKET_PROMOTION_FALLBACK_REASON;
  }
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
    directDebitMandate(mandateReferenceOf(state.paymentMeans)),
    "</ram:SpecifiedTradePaymentTerms>",
  ].join("");
}

function directDebitMandate(reference: string | null): string {
  return reference === null ? "" : textElement("ram:DirectDebitMandateID", reference);
}

/**
 * BG-22 — BT-106 Σ lignes, BT-108 frais, BT-107 remises, BT-109 HT, BT-110
 * TVA, BT-112 TTC, BT-113 déjà payé (facture carte, E5a), BT-115 à payer =
 * TTC − déjà payé. Aucun arrondi (BT-114).
 */
function monetarySummation(state: InvoiceState): string {
  const { vat, prepayment } = state;
  const prepaid = prepayment?.amountCents ?? 0;
  return [
    "<ram:SpecifiedTradeSettlementHeaderMonetarySummation>",
    textElement("ram:LineTotalAmount", centsAmount(vat.goodsHtCents)),
    textElement("ram:ChargeTotalAmount", centsAmount(vat.chargesCents)),
    textElement("ram:AllowanceTotalAmount", centsAmount(vat.allowancesCents)),
    textElement("ram:TaxBasisTotalAmount", centsAmount(vat.taxableBaseCents)),
    textElement("ram:TaxTotalAmount", centsAmount(vat.vatCents), ` currencyID="${CURRENCY}"`),
    textElement("ram:GrandTotalAmount", centsAmount(vat.totalCents)),
    prepayment === null ? "" : textElement("ram:TotalPrepaidAmount", centsAmount(prepaid)),
    textElement("ram:DuePayableAmount", centsAmount(vat.totalCents - prepaid)),
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
