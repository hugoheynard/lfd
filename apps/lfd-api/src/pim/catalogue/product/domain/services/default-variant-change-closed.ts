import { DefaultVariantChangeSuspendedError } from "../errors/variant-lifecycle-errors.js";
import { DefaultVariantChangeGate } from "../ports/default-variant-change-gate.js";

/**
 * La porte FERMÉE, reliée du L1 au L3 (`plan-defaut-sous-sa-reference.md`,
 * § 10, D-b) : tout changement de défaut est refusé. Déliée par la bascule
 * (L3, `DefaultVariantChangeOpen`) ; gardée pour qu'un retour arrière de la
 * bascule la relie en une ligne du module.
 */
export class DefaultVariantChangeClosedUntilSwitch extends DefaultVariantChangeGate {
  assertOpen(variantSku: string): void {
    throw new DefaultVariantChangeSuspendedError(variantSku);
  }
}
