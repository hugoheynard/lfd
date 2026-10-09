import type { InvoiceBuyer, InvoiceSeller } from "../entities/invoice.types.js";
import { centsAmount, textElement } from "./facturx-format.js";

/**
 * Les parties du XML Factur-X : vendeur (BG-4), acheteur (BG-7) et lieu de
 * livraison (BG-15), dans l'ordre de `TradePartyType` du schéma CII D16B.
 *
 * Les adresses figées sont des LIGNES prêtes à imprimer, pas une adresse
 * structurée : l'entité écrit `[ligne 1, ligne 2, « CP ville », pays]`
 * (`LegalAddress.lines`), l'acheteur la même forme avec un pays en clair
 * (`prisma-statement-buyer.reader.ts`, vérifié le 2026-10-08). On en relit le
 * code postal, la ville et le pays quand la ligne les porte sans ambiguïté ;
 * sinon le champ est omis, jamais deviné.
 */

/** Le SIREN comme identifiant légal : ISO 6523, code 0002 (INSEE). */
const SIREN_SCHEME = "0002";
/** Numéro de TVA intracommunautaire (BT-31 / BT-48). */
const VAT_SCHEME = "VA";
const POSTCODE_CITY = /^(\d{5})\s+(.+)$/u;
const COUNTRY_CODE = /^[A-Z]{2}$/u;
/** Les seuls pays en clair qu'on relit — tout autre libellé n'est pas traduit. */
const COUNTRY_NAMES: Readonly<Record<string, string>> = { france: "FR" };
const ADDRESS_LINE_NAMES = ["ram:LineOne", "ram:LineTwo", "ram:LineThree"] as const;
const MAX_ADDRESS_LINES = ADDRESS_LINE_NAMES.length;

/** Le vendeur : nom, mentions légales (BT-33), SIREN, adresse, TVA. */
export function sellerParty(seller: InvoiceSeller): string {
  return [
    "<ram:SellerTradeParty>",
    textElement("ram:Name", seller.name),
    textElement("ram:Description", sellerLegalMention(seller)),
    legalOrganization(seller.siren),
    postalAddress(seller.addressLines),
    taxRegistration(seller.vatNumber),
    "</ram:SellerTradeParty>",
  ].join("");
}

/** L'acheteur — le payeur légal figé. */
export function buyerParty(buyer: InvoiceBuyer): string {
  return [
    "<ram:BuyerTradeParty>",
    textElement("ram:Name", buyer.name),
    legalOrganization(buyer.siren),
    postalAddress(buyer.billingAddressLines),
    taxRegistration(buyer.vatNumber),
    "</ram:BuyerTradeParty>",
  ].join("");
}

/** Le lieu de livraison, seulement quand il diffère de l'adresse de facturation. */
export function shipToParty(buyerName: string, lines: readonly string[] | null): string {
  if (lines === null) {
    return "";
  }
  return [
    "<ram:ShipToTradeParty>",
    textElement("ram:Name", buyerName),
    postalAddress(lines),
    "</ram:ShipToTradeParty>",
  ].join("");
}

/**
 * BT-33 — forme, capital et RCS : les mentions du Code de commerce qu'une
 * facture porte (de mémoire, cf. plan § 1).
 */
export function sellerLegalMention(seller: InvoiceSeller): string {
  const parts = [
    seller.legalForm.trim(),
    `au capital de ${centsAmount(seller.shareCapitalCents)} EUR`,
    seller.rcs.trim() === "" ? "" : `RCS ${seller.rcs.trim()} ${seller.siren}`,
  ];
  return parts.filter((part) => part !== "").join(", ");
}

function legalOrganization(siren: string): string {
  if (siren.trim() === "") {
    return "";
  }
  return `<ram:SpecifiedLegalOrganization>${textElement("ram:ID", siren.trim(), ` schemeID="${SIREN_SCHEME}"`)}</ram:SpecifiedLegalOrganization>`;
}

function taxRegistration(vatNumber: string): string {
  if (vatNumber.trim() === "") {
    return "";
  }
  return `<ram:SpecifiedTaxRegistration>${textElement("ram:ID", vatNumber.trim(), ` schemeID="${VAT_SCHEME}"`)}</ram:SpecifiedTaxRegistration>`;
}

interface ParsedAddress {
  readonly postcode: string | null;
  readonly city: string | null;
  readonly country: string | null;
  readonly lines: readonly string[];
}

/** `PostalTradeAddress`, dans l'ordre du schéma : CP, lignes, ville, pays. */
function postalAddress(lines: readonly string[]): string {
  const parsed = parseAddress(lines);
  const streetLines = foldLines(parsed.lines);
  return [
    "<ram:PostalTradeAddress>",
    parsed.postcode === null ? "" : textElement("ram:PostcodeCode", parsed.postcode),
    ...streetLines.map((line, i) => textElement(ADDRESS_LINE_NAMES[i] ?? "ram:LineThree", line)),
    parsed.city === null ? "" : textElement("ram:CityName", parsed.city),
    parsed.country === null ? "" : textElement("ram:CountryID", parsed.country),
    "</ram:PostalTradeAddress>",
  ].join("");
}

/** Relit pays et « CP ville » en fin d'adresse ; le reste reste des lignes. */
export function parseAddress(raw: readonly string[]): ParsedAddress {
  const lines = raw.map((line) => line.trim()).filter((line) => line !== "");
  const last = lines.at(-1) ?? "";
  const country = countryOf(last);
  const rest = country === null ? lines : lines.slice(0, -1);
  const match = POSTCODE_CITY.exec(rest.at(-1) ?? "");
  if (match === null) {
    return { postcode: null, city: null, country, lines: rest };
  }
  return {
    postcode: match[1] ?? null,
    city: match[2] ?? null,
    country,
    lines: rest.slice(0, -1),
  };
}

/**
 * Le code pays (BT-40 / BT-55) que le XML imprimera pour ces lignes, ou
 * `null` s'il ne s'en relit aucun. C'est LA lecture du pays : le blocage
 * `buyer_country_unknown` l'appelle, pour qu'un pays accepté à l'écran soit
 * exactement un pays émis (A43, BR-11).
 */
export function addressCountryCode(raw: readonly string[]): string | null {
  return parseAddress(raw).country;
}

function countryOf(line: string): string | null {
  if (COUNTRY_CODE.test(line)) {
    return line;
  }
  return COUNTRY_NAMES[line.toLowerCase()] ?? null;
}

/** Trois lignes au plus : les suivantes rejoignent la troisième, rien ne se perd. */
function foldLines(lines: readonly string[]): readonly string[] {
  if (lines.length <= MAX_ADDRESS_LINES) {
    return lines;
  }
  return [...lines.slice(0, MAX_ADDRESS_LINES - 1), lines.slice(MAX_ADDRESS_LINES - 1).join(", ")];
}
