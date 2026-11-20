import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le point ne suit pas son stock au comptoir : y déclarer un stock faible ou
 * une rupture n'a pas de sens. Les alertes déjà ouvertes restent lisibles et
 * se lèvent encore à la main.
 */
export class StockTrackingDisabledError extends BusinessError {
  constructor(readonly siteId: string) {
    super(
      "resupply.stock_tracking.disabled",
      "Le suivi du stock est désactivé pour ce point : activez-le dans Réglages › Comptoir pour déclarer un stock faible ou une rupture.",
    );
  }
}
