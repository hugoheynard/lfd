/**
 * **La saisie du prix pro HT** (lot P de
 * `documentation/catalogue/plan-catalogue-synchronise-par-audience.md`) — lue et
 * réécrite en TEXTE, jamais par un flottant.
 *
 * Le serveur reste juge (`ProPriceHt` refuse une sixième décimale) ; cette
 * lecture ne sert qu'à l'AFFICHAGE de ce que la saisie produira. Elle suit la
 * même règle que lui — chiffres, une virgule ou un point, au plus cinq
 * décimales — pour ne jamais montrer un prix que le serveur refuserait.
 */
import { proPriceOf } from '@lfd/pim-contracts';

/** 10⁻⁵ € : l'unité du fil. */
export const PRO_PRICE_DECIMALS = 5;
const MILLICENTS_PER_EURO = 10 ** PRO_PRICE_DECIMALS;
const EURO_AMOUNT = /^(\d+)(?:[.,](\d+))?$/u;

/** Les millicentimes d'une saisie, ou `null` si elle est vide ou ne fait pas un prix. */
export function proPriceMillicentsOf(text: string): number | null {
  const match = EURO_AMOUNT.exec(text.trim());
  if (match === null) {
    return null;
  }
  const [, units = '', decimals = ''] = match;
  if (decimals.length > PRO_PRICE_DECIMALS) {
    return null;
  }
  const millicents =
    Number(units) * MILLICENTS_PER_EURO + Number(decimals.padEnd(PRO_PRICE_DECIMALS, '0'));
  return Number.isSafeInteger(millicents) ? millicents : null;
}

/** La saisie qu'un montant enregistré réécrit : `2730331` → `"27,30331"`, `1000000` → `"10"`. */
export function proPriceTextOf(millicents: number | null): string {
  if (millicents === null) {
    return '';
  }
  const units = Math.trunc(millicents / MILLICENTS_PER_EURO);
  const decimals = String(millicents % MILLICENTS_PER_EURO)
    .padStart(PRO_PRICE_DECIMALS, '0')
    .replace(/0+$/u, '');
  return decimals === '' ? String(units) : `${String(units)},${decimals}`;
}

/** Ce qui part au serveur : la saisie telle quelle, ou `null` pour effacer. */
export function proPricePayloadOf(text: string): string | null {
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * **L'écart constaté** entre le prix pro TTC et le prix public TTC — une
 * lecture, pas une règle : sous « Prix saisi », plus aucune remise ne produit
 * le prix pro, et afficher celle du ratio mentirait. « −10,3 % », « +2 % »,
 * « aucun écart ».
 */
export function observedGapLabel(publicTtcCents: number, proTtcCents: number): string | null {
  if (publicTtcCents <= 0) {
    return null;
  }
  const tenthsOfPercent = Math.round(((proTtcCents - publicTtcCents) * 1_000) / publicTtcCents);
  if (tenthsOfPercent === 0) {
    return 'aucun écart';
  }
  const sign = tenthsOfPercent < 0 ? '−' : '+';
  const magnitude = String(Math.abs(tenthsOfPercent) / 10).replace('.', ',');
  return `${sign}${magnitude} %`;
}

/**
 * **La suggestion de prix pro** (lot S, S3) — ce que le rapport suggéré
 * donnerait à cette déclinaison.
 *
 * - `ready` : le HT que « Reprendre » mettrait dans le champ ;
 * - `no_vat` : le rapport est posé, mais la fiche n'a pas de taux `b2b` — le
 *   hors taxe ne se déduit pas sans lui, et l'écran le dit ;
 * - `none` : pas de rapport posé ou pas de prix public — rien à suggérer, et
 *   rien à dire (sous « prix saisi », un rapport absent ne coûte que ça).
 */
export type ProPriceSuggestion =
  | { readonly kind: 'ready'; readonly htMillicents: number; readonly ratioLabel: string }
  | { readonly kind: 'no_vat' }
  | { readonly kind: 'none' };

/**
 * Calcule la suggestion **par la porte** (`proPriceOf` sous `ratio_ttc`, sans
 * saisie) — exactement l'appel du pré-remplissage (`pro-price-prefill.ts`
 * côté serveur), pour que la suggestion et le pré-remplissage ne divergent
 * jamais d'un millicentime.
 */
export function proPriceSuggestionOf(
  publicTtcCents: number | null,
  ratioBp: number | null,
  b2bPercent: number | null,
): ProPriceSuggestion {
  if (publicTtcCents === null || ratioBp === null) {
    return { kind: 'none' };
  }
  const price = proPriceOf(publicTtcCents, { method: 'ratio_ttc', ratioBp }, b2bPercent, null);
  if (price === null) {
    return { kind: 'no_vat' };
  }
  return { kind: 'ready', htMillicents: price.htMillicents, ratioLabel: ratioLabelOf(ratioBp) };
}

/** `9000` → « 90 % », `8750` → « 87,5 % » : le rapport, pas la remise. */
export function ratioLabelOf(ratioBp: number): string {
  return `${String(ratioBp / 100).replace('.', ',')} %`;
}
