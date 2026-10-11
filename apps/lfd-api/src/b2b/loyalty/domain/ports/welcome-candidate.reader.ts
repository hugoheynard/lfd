/** Une personne telle que le bonus la lit hors verrou : sa ligne `welcome` se relit sous le verrou. */
export interface WelcomeCandidateFacts {
  readonly userId: string;
  readonly becameAccountAt: Date | null;
  readonly addressProven: boolean;
  /** Le staff l'a désactivé : pas de bonus tant qu'il l'est (Hugo, 2026-10-11). */
  readonly accountDisabled: boolean;
}

/** Un lot de personnes à qui le bonus est peut-être dû, et le curseur du suivant. */
export interface WelcomeCandidatePage {
  readonly userIds: readonly string[];
  /** `null` = dernier lot. */
  readonly nextAfter: string | null;
}

/**
 * **Les personnes vues par le bonus de bienvenue** — lecture seule (ISP) : le
 * crédit d'une personne et la passe de nuit ne demandent aux comptes que ça.
 */
export abstract class WelcomeCandidateReader {
  /** `null` = aucune personne sous cet identifiant. */
  abstract candidate(userId: string): Promise<WelcomeCandidateFacts | null>;

  /**
   * Les personnes devenues un compte à ou après `since`, adresse prouvée, sans
   * ligne `welcome` — dans l'ordre des identifiants, après `after`, `limit` au plus.
   */
  abstract listPending(
    since: Date,
    after: string | null,
    limit: number,
  ): Promise<WelcomeCandidatePage>;
}
