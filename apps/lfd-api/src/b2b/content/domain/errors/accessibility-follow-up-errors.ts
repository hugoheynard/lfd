import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le suivi d'accessibilité embarqué porte un statut que l'API ne connaît pas —
 * **500**. Le fichier est généré et gardé par `lint:rgaa-digest` : le voir ici
 * veut dire qu'il a été écrit à la main, ou que le générateur et l'API ne
 * sortent pas du même commit.
 */
export class InvalidAccessibilityFollowUpError extends TechnicalError {
  constructor(readonly status: string) {
    super(
      "accessibility_follow_up_invalid",
      `Le suivi d'accessibilité embarqué porte un statut inconnu (« ${status} »). Régénérer le fichier par \`pnpm rgaa:digest\` depuis la grille d'audit, puis redéployer l'API.`,
    );
  }
}
