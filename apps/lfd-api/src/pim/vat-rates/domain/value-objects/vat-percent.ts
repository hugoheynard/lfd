import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/** Un taux de TVA hors des bornes du possible. */
export class InvalidVatPercentError extends DomainError {
  constructor(readonly received: number) {
    super(
      "commerce.tva_percent.invalid",
      `Taux de TVA impossible (${String(received)}) : attendu un nombre > 0 et ≤ 100, ` +
        `avec au plus deux décimales.`,
    );
  }
}

const MAX_PERCENT = 100;
const MAX_DECIMALS = 2;

/**
 * **Le taux de TVA.**
 *
 * Il portait aussi le `tag` (`tva-5-5`), l'identité du taux côté Shopify. Ce
 * n'était pas sa place : un taux de TVA est une donnée fiscale, un handle de
 * collection est du vocabulaire de canal. Le référentiel décrivait donc un de
 * ses consommateurs, et la seule chose qui empêchait deux taux de porter le
 * même taux était la collision de leurs handles Shopify.
 *
 * La dérivation vit désormais dans l'adaptateur Shopify, qui est le seul à en
 * avoir jamais eu besoin.
 */
export class VatPercent {
  private constructor(readonly percent: number) {}

  static create(percent: number): VatPercent {
    if (!Number.isFinite(percent) || percent <= 0 || percent > MAX_PERCENT) {
      throw new InvalidVatPercentError(percent);
    }
    if (!hasAtMostTwoDecimals(percent)) {
      throw new InvalidVatPercentError(percent);
    }
    return new VatPercent(percent);
  }

  equals(other: VatPercent): boolean {
    return this.percent === other.percent;
  }
}

/**
 * Au-delà de deux décimales le taux n'a plus de sens comptable, et le handle
 * qu'un canal en dérive devient une chaîne fragile (`tva-5-4999999`).
 *
 * ⚠️ Surtout PAS `Number.isInteger(percent * 100)` : la multiplication
 * flottante ment. `4.85 * 100` vaut `484.99999999999994`, et ce taux — deux
 * décimales, parfaitement légitime — se faisait refuser. On repasse par la
 * décimale, qui arrondit là où la binaire dérive.
 */
function hasAtMostTwoDecimals(percent: number): boolean {
  return Number(percent.toFixed(MAX_DECIMALS)) === percent;
}
