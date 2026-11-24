import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import {
  DefaultVariantOwnAudienceError,
  OwnAudienceVariantNotDefaultableError,
  RestoredVariantAudienceWithoutTilesError,
  TilesHoldVariantAudienceError,
  VariantAudienceWithoutTilesError,
} from "../errors/variant-audience-errors.js";
import type { Variant } from "./variant.js";

/**
 * **Les règles de l'audience par déclinaison**
 * (`documentation/catalogue/plan-audience-par-declinaison.md`, A2 et A3) — à
 * part de {@link VariantLineup} parce qu'elles jugent deux choses que la
 * collection ne porte pas : l'audience de chaque déclinaison et les vignettes
 * de la fiche, que celle-ci passe à chaque geste.
 *
 * Le défaut n'a jamais d'audience propre : celle de la fiche EST la sienne. Et
 * une déclinaison qui en a une demande les vignettes, sans quoi elle ne
 * paraîtrait nulle part. Chaque geste qui créerait l'un des deux cas refuse,
 * avant toute mutation.
 */

/**
 * Pose l'audience propre d'une déclinaison, ou `null` pour qu'elle suive sa fiche.
 *
 * @returns `false` quand elle le disait déjà.
 * @throws {DefaultVariantOwnAudienceError} une audience sur le défaut.
 * @throws {VariantAudienceWithoutTilesError} une audience sur une fiche sans vignettes (A3).
 */
export function changeVariantAudience(
  target: Variant,
  next: Audience | null,
  variantsAsTiles: boolean,
): boolean {
  if (next !== null && target.isDefault) {
    throw new DefaultVariantOwnAudienceError(target.sku);
  }
  if (next !== null && !variantsAsTiles) {
    throw new VariantAudienceWithoutTilesError(target.sku);
  }
  return target.changeAudience(next);
}

/** @throws {OwnAudienceVariantNotDefaultableError} la future déclinaison par défaut a sa propre audience. */
export function refuseOwnAudienceDefault(target: Variant): void {
  if (target.audience !== null) {
    throw new OwnAudienceVariantNotDefaultableError(target.sku);
  }
}

/**
 * Refuse de retirer les vignettes tant qu'une déclinaison a sa propre
 * audience — les arrêtées comptent : sinon on arrêterait la formule, on
 * décocherait les vignettes, puis on la restaurerait.
 *
 * @throws {TilesHoldVariantAudienceError}
 */
export function refuseUntiledOwnAudiences(
  variants: readonly Variant[],
  variantsAsTiles: boolean,
): void {
  if (variantsAsTiles) {
    return;
  }
  const held = variants.filter((variant) => variant.audience !== null);
  if (held.length > 0) {
    throw new TilesHoldVariantAudienceError(held.map((variant) => variant.sku));
  }
}

/** @throws {RestoredVariantAudienceWithoutTilesError} une déclinaison à audience propre restaurée sur une fiche sans vignettes. */
export function refuseUntiledRestore(target: Variant, variantsAsTiles: boolean): void {
  if (target.audience !== null && !variantsAsTiles) {
    throw new RestoredVariantAudienceWithoutTilesError(target.sku);
  }
}
