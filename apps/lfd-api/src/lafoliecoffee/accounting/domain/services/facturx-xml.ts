import type { Invoice } from "../entities/invoice.js";
import type { InvoiceLineInput, InvoiceState } from "../entities/invoice.types.js";
import {
  centsAmount,
  dateElement,
  millicentsPrice,
  textElement,
  thousandthsQuantity,
} from "./facturx-format.js";
import { documentNotes } from "./facturx-mentions.js";
import { buyerParty, sellerParty, shipToParty } from "./facturx-parties.js";
import { headerSettlement, lineTradeTax } from "./facturx-settlement.js";
import { priceDiscountNote } from "./invoice-price-discount.js";

/**
 * **Le XML Factur-X d'une facture émise** — CII D16B, profil EN 16931 (plan
 * `documentation/comptabilite/facturation/facture-emise.md`).
 *
 * Dans `domain/services/` et pas dans `infrastructure/`, comme le `pain.008`
 * (`pain008-document.ts`) : c'est une fonction PURE de la pièce, sans
 * horloge ni entrée-sortie, et le document qu'elle écrit est ce que la
 * norme appelle la facture — la donnée structurée fait foi (§ 1). Le PDF/A-3
 * qui l'embarque, le dépôt et le seau sont, eux, des adaptateurs (E3b).
 *
 * Écrit à la main, sans bibliothèque : l'ordre des éléments est celui des
 * séquences du schéma CII D16B ; tout texte passe par `escapeXml` ; tout
 * montant par l'arithmétique entière de `facturx-format.ts`.
 *
 * Le Schematron EN 16931 officiel (CII, `validation-1.3.16`) passe sur
 * chaque forme de pièce émise sans règle enfreinte
 * (`__tests__/facturx-schematron.spec.ts`, 2026-10-09). Depuis le
 * 2026-10-22, le XSD Factur-X 1.09.2 EN 16931 aussi — l'ordre des éléments
 * n'est plus de mémoire — ainsi que le Schematron Factur-X et le Schematron
 * BR-FR Flux 2 v1.4.0.04 (CIUS-FR), aux manques de donnée près que
 * `__tests__/facturx-fr-conformance.spec.ts` énumère. Les règles
 * arithmétiques sont aussi rejouées à l'émission par
 * `facturXArithmeticViolations`.
 */
export function renderFacturXml(invoice: Invoice): string {
  const state = invoice.toState();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rsm:CrossIndustryInvoice ${NAMESPACES}>`,
    exchangedDocumentContext(state),
    exchangedDocument(state),
    "<rsm:SupplyChainTradeTransaction>",
    ...state.lines.map(lineItem),
    headerAgreement(state),
    headerDelivery(state),
    headerSettlement(state),
    "</rsm:SupplyChainTradeTransaction>",
    "</rsm:CrossIndustryInvoice>",
  ].join("\n");
}

const NAMESPACES = [
  'xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"',
  'xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100"',
  'xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"',
  'xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"',
].join(" ");

/**
 * BT-24 — l'identifiant du profil EN 16931 (« COMFORT ») de Factur-X. C'est
 * la SEULE valeur que la liste de codes du Schematron Factur-X 1.09.2
 * EN16931 admet (`FACTUR-X_EN16931_codedb.xml`, liste 1 — vérifié le
 * 2026-10-22) : la CIUS-FR ne s'y annonce pas, elle s'exprime par BT-23.
 */
export const FACTURX_EN16931_PROFILE = "urn:cen.eu:en16931:2017";

const BILLING_FRAMEWORK_NATURE: Readonly<
  Record<InvoiceState["mentions"]["operationCategory"], string>
> = { goods: "B" };
const BILLING_FRAMEWORK_DEPOSIT = "1";
const BILLING_FRAMEWORK_ALREADY_PAID = "2";

/**
 * BT-23 — le cadre de facturation de la réforme (XP Z12-012 v1.4, Annexe A ;
 * règle BR-FR-08, obligatoire). Lettre : la nature de l'opération (`B` bien —
 * la livraison facturée est accessoire au bien, pas une prestation `M`).
 * Chiffre : `2` facture déjà payée — la facture carte acquittée EN ENTIER
 * (E5a) : le cadre impose BT-113 = BT-112 et un net à payer nul ; sinon `1`,
 * le dépôt d'une facture, déjà-payé partiel compris.
 */
export function billingFramework(state: InvoiceState): string {
  const fullyPaid = state.prepayment?.amountCents === state.vat.totalCents;
  const deposit = fullyPaid ? BILLING_FRAMEWORK_ALREADY_PAID : BILLING_FRAMEWORK_DEPOSIT;
  return `${BILLING_FRAMEWORK_NATURE[state.mentions.operationCategory]}${deposit}`;
}

/** BT-23 puis BT-24, dans l'ordre de `ExchangedDocumentContextType`. */
function exchangedDocumentContext(state: InvoiceState): string {
  return [
    "<rsm:ExchangedDocumentContext>",
    "<ram:BusinessProcessSpecifiedDocumentContextParameter>",
    textElement("ram:ID", billingFramework(state)),
    "</ram:BusinessProcessSpecifiedDocumentContextParameter>",
    "<ram:GuidelineSpecifiedDocumentContextParameter>",
    textElement("ram:ID", FACTURX_EN16931_PROFILE),
    "</ram:GuidelineSpecifiedDocumentContextParameter>",
    "</rsm:ExchangedDocumentContext>",
  ].join("");
}

/** BT-1 numéro, BT-3 type, BT-2 date, BG-1 notes. */
function exchangedDocument(state: InvoiceState): string {
  return [
    "<rsm:ExchangedDocument>",
    textElement("ram:ID", state.number),
    textElement("ram:TypeCode", state.type),
    dateElement("ram:IssueDateTime", state.issuedOn, "udt"),
    documentNotes(state),
    "</rsm:ExchangedDocument>",
  ].join("");
}

/**
 * BG-25 — BT-126 n°, BT-155 référence, BT-153 nom, BT-146 prix net, BT-129
 * quantité et BT-130 unité, BG-30 TVA, BT-131 montant net repris du bon (F6).
 */
function lineItem(line: InvoiceLineInput, index: number): string {
  return [
    "<ram:IncludedSupplyChainTradeLineItem>",
    `<ram:AssociatedDocumentLineDocument>${textElement("ram:LineID", String(index + 1))}${lineNote(line)}</ram:AssociatedDocumentLineDocument>`,
    "<ram:SpecifiedTradeProduct>",
    textElement("ram:SellerAssignedID", line.sku),
    textElement("ram:Name", line.label),
    "</ram:SpecifiedTradeProduct>",
    "<ram:SpecifiedLineTradeAgreement>",
    grossPrice(line),
    "<ram:NetPriceProductTradePrice>",
    textElement("ram:ChargeAmount", millicentsPrice(line.unitPriceMillicents)),
    "</ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>",
    "<ram:SpecifiedLineTradeDelivery>",
    textElement(
      "ram:BilledQuantity",
      thousandthsQuantity(line.quantityThousandths),
      ` unitCode="${line.unitCode}"`,
    ),
    "</ram:SpecifiedLineTradeDelivery>",
    "<ram:SpecifiedLineTradeSettlement>",
    lineTradeTax(line.vatRate),
    "<ram:SpecifiedTradeSettlementLineMonetarySummation>",
    textElement("ram:LineTotalAmount", centsAmount(line.amountCents)),
    "</ram:SpecifiedTradeSettlementLineMonetarySummation>",
    "</ram:SpecifiedLineTradeSettlement>",
    "</ram:IncludedSupplyChainTradeLineItem>",
  ].join("");
}

/**
 * **La remise d'une promotion « dans le prix affiché »** (plan
 * `plan-remise-par-ligne.md`, § 18.6, point 2) : BT-148 prix brut et BT-147
 * rabais unitaire (`GrossPriceProductTradePrice` / `AppliedTradeAllowanceCharge`),
 * et non une remise de ligne BG-27.
 *
 * Pourquoi : avec BT-147, BT-146 reste le prix net EXACT et BT-131 le montant
 * repris des bons — ni la somme des BT-131 (= BT-106), ni les bases par taux,
 * ni la règle R120 ne bougent ; brut − rabais = net au millicentime, sans
 * arrondi. Une BG-27 aurait obligé BT-146 à devenir le prix brut et BT-131 à
 * absorber un montant de remise arrondi au centime (BR-DEC-24), recalculé
 * ligne par ligne — la recomposition des bons (F6) se serait perdue, et
 * BR-41/42 l'imposent chiffrée et motivée. Le profil EN 16931 n'admet sous
 * BT-147 ni pourcentage ni motif (réservés au profil EXTENDED) : le nom de la
 * promotion et son taux vont dans la note de ligne (BT-127).
 */
function grossPrice(line: InvoiceLineInput): string {
  const discount = line.priceDiscount;
  if (discount === undefined) {
    return "";
  }
  return [
    "<ram:GrossPriceProductTradePrice>",
    textElement("ram:ChargeAmount", millicentsPrice(discount.grossUnitPriceMillicents)),
    "<ram:AppliedTradeAllowanceCharge>",
    "<ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator>",
    textElement(
      "ram:ActualAmount",
      millicentsPrice(discount.grossUnitPriceMillicents - line.unitPriceMillicents),
    ),
    "</ram:AppliedTradeAllowanceCharge>",
    "</ram:GrossPriceProductTradePrice>",
  ].join("");
}

/** BT-127 — « Remise 12 % : Promo printemps », quand la ligne porte une remise de promotion. */
function lineNote(line: InvoiceLineInput): string {
  const discount = line.priceDiscount;
  if (discount === undefined) {
    return "";
  }
  return `<ram:IncludedNote>${textElement("ram:Content", priceDiscountNote(line.unitPriceMillicents, discount))}</ram:IncludedNote>`;
}

function headerAgreement(state: InvoiceState): string {
  return [
    "<ram:ApplicableHeaderTradeAgreement>",
    sellerParty(state.seller),
    buyerParty(state.buyer),
    "</ram:ApplicableHeaderTradeAgreement>",
  ].join("");
}

/**
 * BG-13 — le lieu de livraison s'il diffère ; l'élément reste exigé par le
 * schéma. BT-72, la date de livraison réelle, quand la pièce ne couvre
 * qu'UN bon livré (la facture carte, E5a) : plusieurs bons ont plusieurs
 * dates, qui restent en note.
 */
function headerDelivery(state: InvoiceState): string {
  const [single, ...others] = state.orders;
  const receivedOn = others.length === 0 ? (single?.receivedOn ?? null) : null;
  return [
    "<ram:ApplicableHeaderTradeDelivery>",
    shipToParty(state.buyer.name, state.deliveryAddressLines),
    receivedOn === null
      ? ""
      : `<ram:ActualDeliverySupplyChainEvent>${dateElement("ram:OccurrenceDateTime", receivedOn, "udt")}</ram:ActualDeliverySupplyChainEvent>`,
    "</ram:ApplicableHeaderTradeDelivery>",
  ].join("");
}
