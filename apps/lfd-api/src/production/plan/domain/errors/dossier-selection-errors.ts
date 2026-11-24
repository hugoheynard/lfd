import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * La fenêtre d'impression a nommé une commande ou un rayon que le dossier
 * figé ne porte pas — une commande sortie au retirage, un rayon renommé
 * depuis l'ouverture de la fenêtre. On refuse plutôt que tirer sans eux.
 */
export class DossierSelectionUnknownError extends DomainError {
  constructor(kind: string, missing: readonly string[]) {
    super(
      "production.dossier.selection_unknown",
      `Le dossier figé ne porte pas ce ${kind} : ${missing.join(", ")}. Rouvrez la fenêtre d'impression pour relire ce que le dossier contient, puis choisissez à nouveau.`,
    );
  }
}
