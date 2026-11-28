/**
 * Ce qu'un envoi du dossier a donné, tel que la trace le garde. `requested` :
 * un renvoi demandé à la boîte d'envoi du bloc `mail`, pas encore accepté.
 */
export type DossierDispatchState = "pending" | "sent" | "failed" | "requested";

/** Un envoi du dossier d'une journée à une ligne de la liste. */
export interface DossierDispatchTrace {
  readonly recipientId: string;
  readonly outcome: DossierDispatchState;
  /** Quand l'envoi a été pris : l'instant où il est parti, ou a tenté de partir. */
  readonly claimedAt: Date;
  /** La version que le papier joint imprimait ; `null` : envoi d'avant les versions. */
  readonly planVersion: number | null;
}

/**
 * **Les envois du dossier d'une journée** — port de LECTURE, distinct de la
 * trace qui les écrit (ISP) : l'écran des versions y lit, pour chaque
 * destinataire, la dernière version reçue
 * (`documentation/fournil/les-versions-du-plan.md`).
 */
export abstract class DossierDispatchesReader {
  /** Tous les envois de la journée, du plus ancien au plus récent. */
  abstract of(serviceDay: string): Promise<readonly DossierDispatchTrace[]>;
}
