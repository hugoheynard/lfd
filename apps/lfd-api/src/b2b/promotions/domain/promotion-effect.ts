import {
  PromotionInvalidEffectError,
  PromotionInvalidOwnFloorError,
} from "./errors/promotion-errors.js";
import type { PromotionApplicationPoint } from "./promotion-fulfillment.js";

/**
 * **L'effet d'une promotion**, une unité par variante — jamais un nombre nu
 * dont l'unité dépendrait d'un autre champ (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.3) :
 *
 * - `percent_off` : points de base, 1 à 10 000 — ligne ou panier ;
 * - `unit_amount_off` : millicentimes retirés à l'unité — ligne ;
 * - `fixed_unit_price` : prix unitaire posé, millicentimes — ligne (la règle
 *   `replace` d'aujourd'hui) ;
 * - `basket_amount_off` : centimes retirés de l'assiette — panier (la remise
 *   de retrait en montant fixe).
 */
export type PromotionEffect =
  | { readonly kind: "percent_off"; readonly basisPoints: number }
  | { readonly kind: "unit_amount_off"; readonly millicents: number }
  | { readonly kind: "fixed_unit_price"; readonly millicents: number }
  | { readonly kind: "basket_amount_off"; readonly cents: number };

export type PromotionEffectKind = PromotionEffect["kind"];

const FULL_PERCENT_BP = 10_000;

/** Les effets admis à chaque point d'application. */
export const EFFECTS_AT: Readonly<
  Record<PromotionApplicationPoint, readonly PromotionEffectKind[]>
> = {
  line: ["percent_off", "unit_amount_off", "fixed_unit_price"],
  basket: ["percent_off", "basket_amount_off"],
};

/** La valeur de la colonne `effect_value`, dans l'unité de la variante. */
export function effectValueOf(effect: PromotionEffect): number {
  switch (effect.kind) {
    case "percent_off":
      return effect.basisPoints;
    case "unit_amount_off":
    case "fixed_unit_price":
      return effect.millicents;
    case "basket_amount_off":
      return effect.cents;
  }
}

/** L'effet relu de ses deux colonnes — `null` pour une sorte inconnue. */
export function effectOf(kind: string, value: number): PromotionEffect | null {
  switch (kind) {
    case "percent_off":
      return { kind, basisPoints: value };
    case "unit_amount_off":
    case "fixed_unit_price":
      return { kind, millicents: value };
    case "basket_amount_off":
      return { kind, cents: value };
    default:
      return null;
  }
}

/**
 * @throws {PromotionInvalidEffectError} une valeur hors de ce que l'effet admet.
 */
export function assertEffectValue(effect: PromotionEffect): void {
  const value = effectValueOf(effect);
  if (!Number.isInteger(value)) {
    throw new PromotionInvalidEffectError(effect.kind, value, "un nombre entier");
  }
  switch (effect.kind) {
    case "percent_off":
      if (value < 1 || value > FULL_PERCENT_BP) {
        throw new PromotionInvalidEffectError(effect.kind, value, "entre 0,01 % et 100 %");
      }
      return;
    case "fixed_unit_price":
      if (value < 0) {
        throw new PromotionInvalidEffectError(effect.kind, value, "un prix positif ou nul");
      }
      return;
    case "unit_amount_off":
    case "basket_amount_off":
      if (value <= 0) {
        throw new PromotionInvalidEffectError(effect.kind, value, "un montant strictement positif");
      }
      return;
  }
}

/**
 * **Le plancher propre** d'une promotion de ligne : `percent` en points de
 * base du prix canonique, `amount` en millicentimes. Absent = celui de la
 * plateforme. Aucune reprise ne le pose (§ 13.2 : `floor_mode` n'agit pas
 * aujourd'hui).
 */
export interface PromotionOwnFloor {
  readonly mode: "percent" | "amount";
  readonly value: number;
}

/** @throws {PromotionInvalidOwnFloorError} un plancher mal formé. */
export function assertOwnFloor(floor: PromotionOwnFloor): void {
  const tooHigh = floor.mode === "percent" && floor.value > FULL_PERCENT_BP;
  if (!Number.isInteger(floor.value) || floor.value < 0 || tooHigh) {
    throw new PromotionInvalidOwnFloorError(floor.value);
  }
}
