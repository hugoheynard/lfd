/**
 * Les écritures élémentaires du XML Factur-X (CII D16B) : échappement,
 * montants, prix, quantités, taux et dates — toutes en arithmétique ENTIÈRE.
 *
 * Aucun flottant ne touche un montant : un centime s'écrit en découpant
 * l'entier, jamais en divisant par 100. Les taux de TVA (`5.5`) sont passés
 * en points de base par `Math.round(rate × 100)`, la même conversion que la
 * ventilation (`@lfd/money`, `vatOf`, vérifié le 2026-10-08).
 */

const CENTS_PER_EURO = 100;
const MILLICENTS_PER_EURO = 100_000;
const THOUSANDTHS_PER_UNIT = 1_000;
const BASIS_POINTS_PER_PERCENT = 100;
const MIN_PRICE_DECIMALS = 2;

/** Les plages de caractères que XML 1.0 admet (production `Char`). */
const XML_CHAR_RANGES: readonly (readonly [number, number])[] = [
  [0x9, 0xa],
  [0xd, 0xd],
  [0x20, 0xd7ff],
  [0xe000, 0xfffd],
  [0x10000, 0x10ffff],
];

function isXmlChar(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return XML_CHAR_RANGES.some(([low, high]) => code >= low && code <= high);
}

/**
 * Échappe un texte pour un contenu OU un attribut. Un caractère que XML 1.0
 * interdit devient une espace : il n'a aucun rendu lisible, et le garder
 * rendrait le document illisible par tout parseur — la pièce, immuable, ne
 * pourrait plus jamais être rendue.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/[\s\S]/gu, (character) => (isXmlChar(character) ? character : " "))
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

/** Un élément à contenu texte, échappé. */
export function textElement(name: string, text: string, attributes = ""): string {
  return `<${name}${attributes}>${escapeXml(text)}</${name}>`;
}

/** Des centimes entiers en euros, point décimal, deux décimales : `1234` → `12.34`. */
export function centsAmount(cents: number): string {
  return fixedDecimal(cents, CENTS_PER_EURO, 2);
}

/**
 * Un prix unitaire en millicentimes (1/100 000 d'euro) en euros, sans zéro
 * superflu au-delà de deux décimales, cinq au plus : `500000` → `5.00`,
 * `123456` → `1.23456`.
 */
export function millicentsPrice(millicents: number): string {
  return trimDecimals(fixedDecimal(millicents, MILLICENTS_PER_EURO, 5), MIN_PRICE_DECIMALS);
}

/** Une quantité en millièmes entiers : `2000` → `2`, `1250` → `1.25`. */
export function thousandthsQuantity(thousandths: number): string {
  return trimDecimals(fixedDecimal(thousandths, THOUSANDTHS_PER_UNIT, 3), 0);
}

/** Un taux de TVA en pourcentage, deux décimales : `5.5` → `5.50`. */
export function ratePercent(rate: number): string {
  return basisPointsPercent(rateBasisPoints(rate));
}

/** Des points de base entiers en pourcentage, deux décimales : `1415` → `14.15`. */
export function basisPointsPercent(basisPoints: number): string {
  return fixedDecimal(basisPoints, BASIS_POINTS_PER_PERCENT, 2);
}

/** Un taux en points de base entiers (1 % = 100). */
export function rateBasisPoints(rate: number): number {
  return Math.round(rate * BASIS_POINTS_PER_PERCENT);
}

/** `AAAA-MM-JJ` → `AAAAMMJJ`, le format `102` d'UNTDID 2379. */
export function date102(isoDate: string): string {
  return isoDate.replace(/-/gu, "");
}

/** Une date au format 102, dans le type de données qu'on lui donne (`udt`/`qdt`). */
export function dateElement(name: string, isoDate: string, dataType: "udt" | "qdt"): string {
  return `<${name}><${dataType}:DateTimeString format="102">${date102(isoDate)}</${dataType}:DateTimeString></${name}>`;
}

function fixedDecimal(value: number, scale: number, decimals: number): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const whole = Math.trunc(absolute / scale);
  const fraction = String(absolute - whole * scale).padStart(decimals, "0");
  return `${sign}${String(whole)}.${fraction}`;
}

function trimDecimals(fixed: string, keep: number): string {
  const [whole, fraction = ""] = fixed.split(".");
  let end = fraction.length;
  while (end > keep && fraction[end - 1] === "0") {
    end -= 1;
  }
  return end === 0 ? (whole ?? "0") : `${whole ?? "0"}.${fraction.slice(0, end)}`;
}
