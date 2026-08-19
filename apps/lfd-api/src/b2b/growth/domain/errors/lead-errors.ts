import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/** Donnée de lead mal formée (le modèle se protège lui-même — 400). */
export class InvalidLeadError extends DomainError {
  constructor(
    readonly field: string,
    readonly reason: string,
  ) {
    super("growth.lead.invalid", `${field} : ${reason}`);
  }
}

/**
 * Transition de pipeline refusée (409). Le lead est un **jalon qui ne recule
 * jamais** : on ne revient pas en arrière, et on ne touche plus un lead **clos**
 * (converted/lost). L'appelant a fait une demande valide dans sa forme, mais
 * impossible dans l'état courant.
 */
export class LeadTransitionError extends BusinessError {
  constructor(
    readonly from: string,
    readonly to: string,
    reason: string,
  ) {
    super("growth.lead.transition", `Transition ${from} → ${to} refusée : ${reason}`);
  }
}

/** Le lead visé n'existe pas (404). */
export class LeadNotFoundError extends ResourceNotFoundError {
  constructor(readonly leadId: string) {
    super("growth.lead.not_found", `Lead « ${leadId} » introuvable.`);
  }
}
