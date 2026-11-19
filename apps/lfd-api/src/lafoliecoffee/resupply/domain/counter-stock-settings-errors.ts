import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le point ne suit pas son stock au comptoir : poser OK · Faible · Rupture
 * n'y a pas de sens. Les alertes déjà ouvertes restent lisibles.
 */
export class StockTrackingDisabledError extends BusinessError {
  constructor(readonly siteId: string) {
    super(
      "resupply.stock_tracking.disabled",
      "Le suivi du stock est désactivé pour ce point : activez-le dans Réglages › Comptoir pour déclarer un état OK, Faible ou Rupture.",
    );
  }
}
