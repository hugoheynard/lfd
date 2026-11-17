import { PRODUCTION_TRACKING_LEVELS, type ProductionTrackingLevel } from "@lfd/contracts";

import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Un niveau que le CHECK de sa table aurait dû refuser. */
class UnknownTrackingLevelError extends TechnicalError {
  constructor(raw: string, table: string) {
    super(
      "production.tracking.unknown_level",
      `Le niveau de suivi « ${raw} » lu dans ${table} n'est pas connu du serveur : vérifiez la contrainte de la table.`,
    );
  }
}

/** Une colonne de niveau de suivi : un niveau connu, sinon une panne qui nomme la table. */
export function trackingLevelFrom(raw: string, table: string): ProductionTrackingLevel {
  const known = PRODUCTION_TRACKING_LEVELS.find((level) => level === raw);
  if (known === undefined) {
    throw new UnknownTrackingLevelError(raw, table);
  }
  return known;
}
