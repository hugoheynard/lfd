import { PRODUCTION_TRACKING_LEVELS, type ProductionTrackingLevel } from "@lfd/contracts";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Un niveau que le CHECK de `production_workstation.tracking_level` aurait dû refuser. */
class UnknownWorkstationTrackingLevelError extends TechnicalError {
  constructor(raw: string) {
    super(
      "production.workstation.unknown_tracking_level",
      `Un poste du fournil porte le niveau de suivi « ${raw} », que le serveur ne connaît pas : vérifiez la contrainte de la table production_workstation.`,
    );
  }
}

/** La colonne `tracking_level` d'un poste : un niveau connu, ou `null` (il suit le fournil). */
export function trackingLevelOrNull(raw: string | null): ProductionTrackingLevel | null {
  if (raw === null) {
    return null;
  }
  const known = PRODUCTION_TRACKING_LEVELS.find((level) => level === raw);
  if (known === undefined) {
    throw new UnknownWorkstationTrackingLevelError(raw);
  }
  return known;
}
