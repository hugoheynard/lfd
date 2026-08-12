/**
 * Fait de domaine : **un extrait KBIS a été vérifié** par un agent.
 *
 * Ce n'est pas un détail de dossier : c'est la porte d'activation qui s'ouvre.
 * Il mérite donc une ligne de journal au même titre que l'activation elle-même —
 * quand on se demandera plus tard « sur quelle base ce compte a-t-il été
 * ouvert ? », la réponse doit être lisible dans l'historique, pas seulement dans
 * l'état courant de la fiche (qu'une décertification efface).
 */
export class KbisCertifiedEvent {
  constructor(
    readonly companyId: string,
    /** Instant de la vérification (temps métier, issu du `Clock`). */
    readonly at: Date,
  ) {}
}

/**
 * Fait de domaine : **la vérification a été retirée** — et l'accès coupé avec
 * elle si le compte était actif.
 *
 * L'état courant ne garde AUCUNE trace d'une certification retirée : la fiche
 * redevient « déposé, pas vérifié », comme si rien ne s'était passé. Sans cette
 * ligne, une suspension resterait inexplicable le lendemain.
 */
export class KbisCertificationRevokedEvent {
  constructor(
    readonly companyId: string,
    readonly at: Date,
    /** Le compte était-il actif ? Alors il vient d'être suspendu. */
    readonly suspended: boolean,
  ) {}
}
