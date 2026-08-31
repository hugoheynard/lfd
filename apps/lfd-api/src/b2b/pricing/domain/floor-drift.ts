import { RATIO_UNIT_BP } from "./elasticity.js";
import type { PriceFloor } from "./price-rule.js";

/**
 * **Une limite est une intention, et une intention date.**
 *
 * Le beurre prend 30 %, le tarif de liste bouge, et la limite reste où elle
 * était — juste en août, plus juste en février, et l'écran l'affiche avec le
 * même aplomb. Ce module ne calcule aucune marge : il compare le tarif
 * d'aujourd'hui à celui du jour où la décision a été prise, et rappelle qu'une
 * décision existe et qu'elle a vieilli.
 *
 * **Une limite en FRACTION ne dérive pas.** « Jamais sous 50 % du tarif » suit
 * le tarif par construction : elle se met à jour toute seule. Seule une limite
 * en EUROS peut se retrouver décalée — et c'est ce qui rend ce signal petit,
 * plutôt qu'un tableau de bord de plus.
 */

/**
 * Au-delà de **5 %** d'écart, la limite mérite un regard.
 *
 * Le seuil porte sur l'écart, jamais sur l'âge seul : une limite posée il y a
 * deux ans sur un tarif qui n'a pas bougé reste exactement aussi juste
 * qu'au premier jour. Alerter sur l'ancienneté apprendrait au staff à ignorer
 * l'alerte, ce qui est pire que ne pas l'avoir.
 */
export const STALE_DRIFT_BP = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface FloorDrift {
  /** Le tarif de référence, figé au moment où la limite a été posée. */
  readonly referenceCanonicalMillicents: number;
  /** Le tarif équivalent aujourd'hui. */
  readonly currentCanonicalMillicents: number;
  /** L'écart, **signé**, en points de base (`1200` = +12 %). */
  readonly driftBp: number;
  readonly ageDays: number;
  /** L'écart justifie-t-il de rouvrir la décision ? */
  readonly stale: boolean;
}

/**
 * L'écart entre l'intention et le tarif d'aujourd'hui.
 *
 * `null` quand il n'y a rien à comparer : une limite en fraction (elle suit), ou
 * une limite posée avant que la référence ne soit enregistrée. Rendre `0 %`
 * dans ces cas ferait passer une absence de mesure pour une confirmation.
 */
export function floorDrift(
  floor: PriceFloor,
  referenceCanonicalMillicents: number | null,
  currentCanonicalMillicents: number | null,
  posedAt: Date,
  now: Date,
): FloorDrift | null {
  if (floor.mode === "percent") {
    return null;
  }
  if (
    referenceCanonicalMillicents === null ||
    currentCanonicalMillicents === null ||
    referenceCanonicalMillicents <= 0
  ) {
    return null;
  }

  const driftBp = Math.round(
    ((currentCanonicalMillicents - referenceCanonicalMillicents) / referenceCanonicalMillicents) *
      RATIO_UNIT_BP,
  );
  return {
    referenceCanonicalMillicents,
    currentCanonicalMillicents,
    driftBp,
    ageDays: Math.max(0, Math.floor((now.getTime() - posedAt.getTime()) / DAY_MS)),
    stale: Math.abs(driftBp) >= STALE_DRIFT_BP,
  };
}

/**
 * Le tarif **représentatif** d'un ensemble d'articles : la médiane.
 *
 * Médiane et non moyenne : une limite de famille ne doit pas se juger déplacée
 * parce qu'une pièce montée à 90 € y côtoie des croissants à 2 €. La médiane
 * suit ce que la famille vend vraiment ; la moyenne suit son article le plus
 * cher.
 */
export function medianMillicents(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (upper === undefined) {
    return null;
  }
  return sorted.length % 2 === 1 || lower === undefined ? upper : Math.round((lower + upper) / 2);
}
