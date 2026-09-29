import type { BinHalf } from "../domain/value-objects/bin-declaration.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";

/** Une valeur de `half` que la contrainte de la table aurait dû refuser. */
class UnknownBinHalfError extends TechnicalError {
  constructor(value: string) {
    super(
      "delivery.bin_half_unknown",
      `Un bac porte une moitié inconnue (« ${value} ») : signalez-le à l'équipe technique, sans retoucher le bac.`,
    );
  }
}

/**
 * `half` relu : `left`, `right`, ou nul (bac entier). La contrainte
 * `delivery_bin_half` le garantit en base ; on le revérifie plutôt que de
 * caster.
 */
export function binHalfOf(value: string | null): BinHalf | null {
  if (value === null || value === "left" || value === "right") {
    return value;
  }
  throw new UnknownBinHalfError(value);
}
