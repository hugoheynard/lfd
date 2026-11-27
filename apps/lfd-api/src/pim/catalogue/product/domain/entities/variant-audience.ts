import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import {
  DefaultVariantOwnAudienceError,
  OwnAudienceVariantNotDefaultableError,
} from "../errors/variant-audience-errors.js";
import type { Variant } from "./variant.js";

/**
 * **Les règles de l'audience par déclinaison**
 * (`documentation/catalogue/plan-audience-par-declinaison.md`, A2) — à part de
 * {@link VariantLineup} parce qu'elles jugent l'audience de chaque
 * déclinaison, que la collection ne porte pas.
 *
 * Le défaut n'a jamais d'audience propre : celle de la fiche EST la sienne.
 * Chaque geste qui créerait ce cas refuse, avant toute mutation.
 */

/**
 * Pose l'audience propre d'une déclinaison, ou `null` pour qu'elle suive sa fiche.
 *
 * @returns `false` quand elle le disait déjà.
 * @throws {DefaultVariantOwnAudienceError} une audience sur le défaut.
 */
export function changeVariantAudience(target: Variant, next: Audience | null): boolean {
  if (next !== null && target.isDefault) {
    throw new DefaultVariantOwnAudienceError(target.sku);
  }
  return target.changeAudience(next);
}

/** @throws {OwnAudienceVariantNotDefaultableError} la future déclinaison par défaut a sa propre audience. */
export function refuseOwnAudienceDefault(target: Variant): void {
  if (target.audience !== null) {
    throw new OwnAudienceVariantNotDefaultableError(target.sku);
  }
}
