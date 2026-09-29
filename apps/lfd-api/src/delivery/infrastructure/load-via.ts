import type { LoadVia } from "../domain/entities/stop-loading.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";

/** Une valeur de `loaded_via` que la contrainte de la table aurait dû refuser. */
class UnknownLoadViaError extends TechnicalError {
  constructor(value: string) {
    super(
      "delivery.load_via_unknown",
      `Un chargement porte un moyen inconnu (« ${value} ») : signalez-le à l'équipe technique, sans retoucher le chargement.`,
    );
  }
}

/**
 * `loaded_via` relu : `scan`, `code`, ou nul. La contrainte
 * `delivery_bag_load_via` le garantit en base ; on le revérifie plutôt que de
 * caster.
 */
export function loadViaOf(value: string | null): LoadVia | null {
  if (value === null || value === "scan" || value === "code") {
    return value;
  }
  throw new UnknownLoadViaError(value);
}
