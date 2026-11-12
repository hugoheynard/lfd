import { TechnicalError } from "../shared/errors/app-error.js";

/**
 * L'objet des journées a répondu quelque chose que l'API ne comprend pas. Ne
 * sort jamais vers un client : le repli la compte `unreadable` et lit la base.
 */
export class UnreadableDayVersionsReplyError extends TechnicalError {
  constructor(detail: string) {
    super(
      "day_versions.unreadable_reply",
      `Réponse illisible de l'objet des journées (${detail}) : les numéros sont relus en base. ` +
        "Si cela dure, vérifier que le Worker et l'API ont été déployés ensemble.",
    );
  }
}
