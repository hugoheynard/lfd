import { BusinessError, TechnicalError } from "../shared/errors/app-error.js";

/** Une clé d'intention déjà servie pour un autre geste ou un autre sujet. */
export class IntentKeyReusedError extends BusinessError {
  constructor() {
    super(
      "intent.key_reused",
      "Cette demande porte la clé d'un autre geste : fermer la fenêtre, la rouvrir, puis recommencer.",
    );
  }
}

/** Le même geste est déjà en cours, lancé par un clic précédent. */
export class GestureInFlightError extends BusinessError {
  constructor() {
    super(
      "intent.in_flight",
      "Ce geste est déjà en cours depuis un premier clic : attendre sa réponse, puis recharger la page pour voir son issue.",
    );
  }
}

/** Le résultat gardé d'un geste ne se relit plus : forme inattendue en base. */
export class IntentRecordUnreadableError extends TechnicalError {
  constructor(gesture: string, field: string) {
    super(
      "intent.record_unreadable",
      `Le résultat gardé du geste « ${gesture} » est illisible (champ « ${field} ») : le geste a abouti, recharger la page pour voir son état.`,
    );
  }
}
