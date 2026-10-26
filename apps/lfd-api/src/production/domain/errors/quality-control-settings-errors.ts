import { BusinessError } from "../../../platform/shared/errors/app-error.js";

/**
 * Le contrôle qualité est désactivé à ce niveau dans Réglages › Commandes
 * (décision de Hugo, 2026-10-26). L'écran ne propose plus « Contrôler » : ce
 * refus ne se lit que sur une Supervision restée ouverte pendant qu'on
 * désactivait le réglage, ou par un appel direct.
 */
export class QualityControlDisabledError extends BusinessError {
  constructor(levelLabel: string) {
    super(
      "production.quality.disabled",
      `Le contrôle qualité ${levelLabel} est désactivé dans Réglages › Commandes : ce verdict n'est pas enregistré. ` +
        "Rechargez la Supervision, ou demandez à qui règle les commandes de le réactiver.",
    );
  }
}
