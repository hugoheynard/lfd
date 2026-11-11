import type { CartAdjustment, PriceGridBasketPart } from "@lfd/contracts";

import { CSV_BOM, CSV_SEPARATOR, csvEuros, csvQuoted } from "../../../platform/csv/csv-cells.js";
import type { PriceGridBasis, PriceGridRow } from "./price-grid-row.js";

/**
 * **La grille de prix en CSV** (`export-grille-de-prix.md`, § 3) — pure.
 *
 * Elle recopie des lignes déjà chiffrées : aucun montant n'est recalculé ici.
 * UTF-8 avec BOM, point-virgule, virgule décimale — les cellules de
 * `platform/csv`, les mêmes que les autres exports du back-office.
 */

/** La mention que le plan impose, mot pour mot (§ 3). */
export const PRICE_GRID_NOTICE =
  "Prix nets estimés : une remise de panier se calcule sur le panier entier, " +
  "avec un seul arrondi ; écart possible d'un centime par ligne. " +
  "Document indicatif, non contractuel.";

/** Une remise au panier nommée en tête, et ce qu'on en a fait. */
export interface PriceGridHeadingDiscount {
  readonly label: string;
  readonly part: PriceGridBasketPart;
}

/** Ce que l'en-tête du fichier dit de lui-même — un fichier rangé perd l'écran. */
export interface PriceGridHeading {
  readonly audience: string;
  /** « 31/10/2026 », et si c'est aujourd'hui. */
  readonly day: string;
  readonly fulfillment: string;
  readonly basis: PriceGridBasis;
  /** Ce que l'en-tête dit de ce public — limites d'un pro type, lentille (§ 8.6, § 8.7). */
  readonly remarks: readonly string[];
  readonly displayedPromotions: readonly string[];
  readonly basketPromotions: readonly PriceGridHeadingDiscount[];
  readonly pricePerKg: boolean;
}

const PART_WORDS: Readonly<Record<PriceGridBasketPart, string>> = {
  column: "colonne à part",
  net: "dans le prix net estimé",
  ignored: "ignorée",
};

const BASIS_WORDS: Readonly<Record<PriceGridBasis, string>> = {
  ht: "HT",
  ttc: "TTC",
};

/** Points de base dans un pour cent. */
const BP_PER_PERCENT = 100;

/** Le fichier entier, BOM compris, lignes terminées par CRLF. */
export function priceGridCsv(heading: PriceGridHeading, rows: readonly PriceGridRow[]): string {
  const lines = [
    ...headingLines(heading),
    "",
    headersOf(heading).map(csvQuoted).join(CSV_SEPARATOR),
    ...rows.map((row) => rowLine(row, heading)),
  ];
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

function headingLines(heading: PriceGridHeading): readonly string[] {
  const basis = heading.basis === "ht" ? "Prix HT" : "Prix TTC";
  const discounts = heading.basketPromotions.map(
    (entry) => `${entry.label} (${PART_WORDS[entry.part]})`,
  );
  return [
    csvQuoted(`Grille de prix — ${heading.audience}`),
    csvQuoted(`Date : ${heading.day}`),
    csvQuoted(`Acheminement : ${heading.fulfillment}`),
    csvQuoted(`${basis}, à l'unité de vente — au kilo pour un article vendu au poids.`),
    ...heading.remarks.map(csvQuoted),
    csvQuoted(`Promotions dans le prix affiché : ${listOrNone(heading.displayedPromotions)}`),
    csvQuoted(`Remises au panier retenues : ${listOrNone(discounts)}`),
    csvQuoted(PRICE_GRID_NOTICE),
  ];
}

function listOrNone(entries: readonly string[]): string {
  return entries.length === 0 ? "aucune" : entries.join(" ; ");
}

function headersOf(heading: PriceGridHeading): readonly string[] {
  const basis = BASIS_WORDS[heading.basis];
  const columns = heading.basketPromotions
    .filter((entry) => entry.part === "column")
    .map((entry) => `${entry.label} (remise au panier)`);
  const estimated = heading.basketPromotions.some((entry) => entry.part === "net");
  return [
    "Famille",
    "Produit",
    "Déclinaison",
    "SKU",
    "Unité",
    `Prix de base ${basis}`,
    `Prix affiché ${basis}`,
    ...columns,
    estimated ? `Prix net estimé ${basis}` : `Prix net ${basis}`,
    ...(heading.pricePerKg ? [`Prix au kilo saisi ${basis}`] : []),
  ];
}

function rowLine(row: PriceGridRow, heading: PriceGridHeading): string {
  const cells = [
    csvQuoted(row.familyName),
    csvQuoted(row.productName ?? ""),
    csvQuoted(row.variantName),
    csvQuoted(row.sku),
    csvQuoted(row.saleUnit === "weight" ? "kilo" : "pièce"),
    csvEuros(row.baseCents),
    csvEuros(row.displayedCents),
    ...row.columns.map((cell) => (cell === null ? "" : csvQuoted(adjustmentText(cell)))),
    csvEuros(row.netCents),
    ...(heading.pricePerKg
      ? [row.enteredPerKgCents === null ? "" : csvEuros(row.enteredPerKgCents)]
      : []),
  ];
  return cells.join(CSV_SEPARATOR);
}

/** « 20 % », « 12,5 % », « 5,00 € HT » — la remise telle qu'elle est saisie. */
export function adjustmentText(adjustment: CartAdjustment): string {
  if (adjustment.mode === "amount") {
    return `${csvEuros(adjustment.cents)} € HT`;
  }
  const whole = Math.trunc(adjustment.bp / BP_PER_PERCENT);
  const rest = adjustment.bp % BP_PER_PERCENT;
  const decimals = rest === 0 ? "" : `,${String(rest).padStart(2, "0").replace(/0$/u, "")}`;
  return `${String(whole)}${decimals} %`;
}

/** « Boulangerie Élise & fils » → `boulangerie-elise-fils`. */
function slugOf(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug === "" ? "public" : slug;
}

/** `grille-<public>-<AAAA-MM-JJ>.csv` (`export-grille-de-prix.md`). */
export function priceGridFileName(audience: string, day: string): string {
  return `grille-${slugOf(audience)}-${day}.csv`;
}
