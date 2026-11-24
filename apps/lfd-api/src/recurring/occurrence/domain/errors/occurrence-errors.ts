import {
  BusinessError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

const STATE_WORDS: Readonly<Record<string, string>> = {
  planned: "prévue",
  skipped: "sautée",
  placed: "déjà passée en commande",
  refused: "refusée",
  missed: "manquée (heure limite passée)",
  cancelled: "annulée",
};

/**
 * Une transition que le cycle d'une échéance n'admet pas (plan
 * `plan-bloc-recurrent.md`, § 5) : on ne saute pas une échéance déjà passée,
 * on ne modifie pas une échéance annulée.
 */
export class OccurrenceTransitionRefusedError extends BusinessError {
  constructor(serviceDay: string, state: string, gesture: string) {
    super(
      "subscriptions.occurrence.transition_refused",
      `L'échéance du ${serviceDay} est ${STATE_WORDS[state] ?? state} : impossible de la ${gesture}. Rechargez la liste de vos paniers pour voir son état.`,
    );
  }
}

/**
 * L'échéance visée n'existe pas : le jour n'est pas une échéance du panier,
 * ou il n'est pas encore planifié (les échéances se créent huit semaines à
 * l'avance, et pas pour un panier sans société).
 */
export class OccurrenceNotPlannedError extends ResourceNotFoundError {
  constructor(serviceDay: string) {
    super(
      "subscriptions.occurrence.not_planned",
      `Aucune échéance prévue le ${serviceDay} pour ce panier : choisissez un jour parmi ses prochaines échéances.`,
    );
  }
}

/**
 * Le balayage a passé (ou refusé) l'échéance pendant le geste du client : sa
 * dérogation n'est pas écrite, et l'échéance garde ce que le balayage en a
 * fait.
 */
export class OccurrenceChangedMeanwhileError extends BusinessError {
  constructor(serviceDay: string) {
    super(
      "subscriptions.occurrence.changed_meanwhile",
      `L'échéance du ${serviceDay} vient d'être traitée : votre modification n'est pas enregistrée. Rechargez la liste de vos paniers pour voir sa commande.`,
    );
  }
}
