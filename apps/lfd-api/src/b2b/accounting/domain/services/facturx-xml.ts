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
 * ⚠️ Ni le schéma XSD ni le Schematron CEN n'ont été passés sur ce rendu
 * (2026-10-08) : ils attendent l'accord de les télécharger (E3b). Les règles
 * arithmétiques, elles, sont rejouées par `facturXArithmeticViolations`.
 */
export function renderFacturXml(invoice: Invoice): string {
  const state = invoice.toState();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<rsm:CrossIndustryInvoice ${NAMESPACES}>`,
    exchangedDocumentContext(),
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
 * BT-24 — l'identifiant du profil EN 16931 (« COMFORT ») de Factur-X : la
 * norme seule, sans extension ni CIUS. Écrit de mémoire, à vérifier contre
 * la spec Factur-X 1.07 (2026-10-08) — BASIC et EXTENDED y ajoutent un
 * suffixe `#compliant#…` / `#conformant#…`, pas ce profil.
 */
export const FACTURX_EN16931_PROFILE = "urn:cen.eu:en16931:2017";

function exchangedDocumentContext(): string {
  return [
    "<rsm:ExchangedDocumentContext>",
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
    `<ram:AssociatedDocumentLineDocument>${textElement("ram:LineID", String(index + 1))}</ram:AssociatedDocumentLineDocument>`,
    "<ram:SpecifiedTradeProduct>",
    textElement("ram:SellerAssignedID", line.sku),
    textElement("ram:Name", line.label),
    "</ram:SpecifiedTradeProduct>",
    "<ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice>",
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
  const deliveredOn = others.length === 0 ? (single?.deliveredOn ?? null) : null;
  return [
    "<ram:ApplicableHeaderTradeDelivery>",
    shipToParty(state.buyer.name, state.deliveryAddressLines),
    deliveredOn === null
      ? ""
      : `<ram:ActualDeliverySupplyChainEvent>${dateElement("ram:OccurrenceDateTime", deliveredOn, "udt")}</ram:ActualDeliverySupplyChainEvent>`,
    "</ram:ApplicableHeaderTradeDelivery>",
  ].join("");
}
