import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un taux de TVA hors des bornes du possible. */
export class InvalidTvaRateError extends DomainError {
  constructor(readonly received: number) {
    super(
      "commerce.tva_rate.invalid",
      `Taux de TVA impossible (${String(received)}) : attendu un nombre > 0 et ≤ 100, ` +
        `avec au plus deux décimales.`,
    );
  }
}

const MAX_PERCENT = 100;
const MAX_DECIMALS = 2;

/**
 * **Le taux de TVA, et le handle qui en découle.**
 *
 * Le `tag` (`tva-5-5`) est l'identité du régime côté Shopify. Il était dérivé
 * par l'appelant — `tagFor(percent)`, recopié à la création et à la mise à
 * jour — et rien ne validait le taux dans le domaine : la route HTTP exigeait
 * `positive()`, mais un seed, un import ou un futur appelant passaient à côté,
 * et `tva-NaN` serait parti chez Shopify comme un handle ordinaire.
 *
 * Ici les deux ne peuvent plus diverger : le taux se valide en naissant, et le
 * tag n'existe que dérivé de lui.
 */
export class TvaRate {
  private constructor(readonly percent: number) {}

  static create(percent: number): TvaRate {
    if (!Number.isFinite(percent) || percent <= 0 || percent > MAX_PERCENT) {
      throw new InvalidTvaRateError(percent);
    }
    if (!hasAtMostTwoDecimals(percent)) {
      throw new InvalidTvaRateError(percent);
    }
    return new TvaRate(percent);
  }

  /** Handle stable côté canal : `5.5` → `tva-5-5`. Jamais saisi, toujours dérivé. */
  get tag(): string {
    return `tva-${String(this.percent).replace(".", "-")}`;
  }

  equals(other: TvaRate): boolean {
    return this.percent === other.percent;
  }
}

/**
 * Au-delà de deux décimales le taux n'a plus de sens comptable, et le tag
 * dérivé devient une chaîne fragile (`tva-5-4999999`).
 *
 * ⚠️ Surtout PAS `Number.isInteger(percent * 100)` : la multiplication
 * flottante ment. `4.85 * 100` vaut `484.99999999999994`, et ce taux — deux
 * décimales, parfaitement légitime — se faisait refuser. On repasse par la
 * décimale, qui arrondit là où la binaire dérive.
 */
function hasAtMostTwoDecimals(percent: number): boolean {
  return Number(percent.toFixed(MAX_DECIMALS)) === percent;
}
