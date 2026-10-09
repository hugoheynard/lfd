import { LEGAL_PENALTY_MARGIN_BASIS_POINTS } from '@lfd/contracts';

/**
 * Les mots et les conversions de la carte « Mentions de la facture » (plan
 * `documentation/comptabilite/facturation/facture-emise.md`).
 *
 * Un taux se SAISIT en pourcents (« 14,15 ») et se RANGE en points de base
 * (1415) : la conversion se fait sur les chiffres, jamais par un flottant —
 * `14.15 * 100` vaut `1414.9999999999998`.
 */

const PERCENT = /^(\d{1,3})(?:[.,](\d{1,2}))?$/u;
const BASIS_POINTS_PER_PERCENT = 100;

/** « 14,15 » → 1415. `null` si illisible ou plus fin que le centième de point. */
export function basisPointsOf(raw: string): number | null {
  const match = PERCENT.exec(raw.trim().replace(/\s*%$/u, ''));
  if (match === null) {
    return null;
  }
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * BASIS_POINTS_PER_PERCENT + Number(fraction.padEnd(2, '0'));
}

/** 1415 → « 14,15 » ; 1000 → « 10 ». Pour le champ, sans le signe %. */
export function percentField(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / BASIS_POINTS_PER_PERCENT);
  const fraction = basisPoints % BASIS_POINTS_PER_PERCENT;
  return fraction === 0
    ? String(whole)
    : `${String(whole)},${String(fraction).padStart(2, '0').replace(/0$/u, '')}`;
}

/**
 * La SUGGESTION du taux légal (Q4, Hugo, 2026-10-08) : le taux BCE saisi, plus
 * 10 points (L441-10, cité de mémoire). Le taux BCE varie : il n'est jamais
 * écrit ici, la personne le lit et le tape. `null` tant qu'elle ne l'a pas fait.
 */
export function suggestedPenaltyRate(ecbBasisPoints: number | null): number | null {
  return ecbBasisPoints === null ? null : ecbBasisPoints + LEGAL_PENALTY_MARGIN_BASIS_POINTS;
}

/** La formule dite en clair, sous le champ de la suggestion. */
export const LEGAL_RATE_FORMULA =
  'Taux légal par défaut : le taux de refinancement de la BCE le plus récent, majoré de ' +
  '10 points (article L441-10 du Code de commerce). Ce n’est qu’une suggestion : vous ' +
  'pouvez convenir d’un autre taux, dans la limite du plancher légal.';

/** Ce qu'on propose d'écrire quand l'entreprise n'accorde pas d'escompte. */
export const NO_DISCOUNT = 'néant';
