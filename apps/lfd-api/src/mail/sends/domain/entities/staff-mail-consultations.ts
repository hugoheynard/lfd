import { MailConsultationLimitReachedError } from "../errors/mail-sends.errors.js";

/**
 * **Le plafond horaire** des consultations (`le-suivi-des-e-mails.md`,
 * décisions 7 et 8) : adresses révélées et recherches par adresse, partagé.
 */
export const MAIL_CONSULTATIONS_PER_HOUR = 30;

/** La fenêtre du plafond. */
export const MAIL_CONSULTATION_WINDOW_MS = 60 * 60 * 1000;

/** Combien de temps une révélation ouvre l'adresse, à son auteur, pour cet envoi. */
export const MAIL_REVEAL_VALIDITY_MS = 5 * 60 * 1000;

/** Le début de la fenêtre du plafond, à `now`. */
export function consultationWindowStart(now: Date): Date {
  return new Date(now.getTime() - MAIL_CONSULTATION_WINDOW_MS);
}

/** Jusqu'à quand une révélation faite à `revealedAt` ouvre l'adresse. */
export function revealedUntil(revealedAt: Date): Date {
  return new Date(revealedAt.getTime() + MAIL_REVEAL_VALIDITY_MS);
}

/** La révélation vaut-elle encore à `now` ? Strictement moins de 5 minutes. */
export function isRevealCurrent(revealedAt: Date, now: Date): boolean {
  return now.getTime() < revealedUntil(revealedAt).getTime();
}

/** Une adresse révélée, à ranger : qui, quel envoi, quand — jamais l'adresse. */
export interface MailRecipientReveal {
  readonly id: string;
  readonly sendId: string;
  readonly staffId: string;
  readonly at: Date;
}

/** Une recherche par adresse, à ranger : l'empreinte et les envois trouvés — jamais l'adresse. */
export interface MailRecipientSearchRecord {
  readonly id: string;
  readonly staffId: string;
  readonly fingerprint: string;
  readonly sendIds: readonly string[];
  readonly at: Date;
}

/**
 * **Les consultations d'une personne dans l'heure** — l'agrégat qui porte le
 * plafond (décision 7 : « règle de l'agrégat, lue sur la table »).
 *
 * Chargé avec le COMPTE des consultations de la dernière heure (révélations
 * et recherches, partagé) ; une révélation de plus est refusée au-delà de
 * {@link MAIL_CONSULTATIONS_PER_HOUR}. L'adaptateur le charge sous un verrou
 * par personne : deux révélations simultanées ne passent pas toutes les deux
 * à la trentième.
 */
export class StaffMailConsultations {
  private readonly pending: MailRecipientReveal[] = [];
  private readonly pendingSearches: MailRecipientSearchRecord[] = [];

  private constructor(
    readonly staffId: string,
    private readonly recentCount: number,
    private readonly oldestRecentAt: Date | null,
  ) {}

  /** Rehydraté par l'adaptateur : le compte de l'heure, et l'instant de la plus ancienne. */
  static of(staffId: string, recentCount: number, oldestRecentAt: Date | null) {
    return new StaffMailConsultations(staffId, recentCount, oldestRecentAt);
  }

  /**
   * Révèle l'adresse d'un envoi.
   *
   * @throws {MailConsultationLimitReachedError} 30 consultations dans l'heure.
   */
  reveal(id: string, sendId: string, at: Date): MailRecipientReveal {
    this.assertBelowLimit(at);
    const reveal = { id, sendId, staffId: this.staffId, at };
    this.pending.push(reveal);
    return reveal;
  }

  /**
   * Range une recherche par adresse : son empreinte et les envois trouvés à
   * cet instant. Même plafond, partagé (décision 8).
   *
   * @throws {MailConsultationLimitReachedError} 30 consultations dans l'heure.
   */
  search(
    id: string,
    fingerprint: string,
    sendIds: readonly string[],
    at: Date,
  ): MailRecipientSearchRecord {
    this.assertBelowLimit(at);
    const search = { id, staffId: this.staffId, fingerprint, sendIds: [...sendIds], at };
    this.pendingSearches.push(search);
    return search;
  }

  /** Les recherches à ranger au `save`. */
  newSearches(): readonly MailRecipientSearchRecord[] {
    return [...this.pendingSearches];
  }

  private assertBelowLimit(at: Date): void {
    const used = this.recentCount + this.pending.length + this.pendingSearches.length;
    if (used >= MAIL_CONSULTATIONS_PER_HOUR) {
      const from = this.oldestRecentAt ?? at;
      throw new MailConsultationLimitReachedError(
        MAIL_CONSULTATIONS_PER_HOUR,
        new Date(from.getTime() + MAIL_CONSULTATION_WINDOW_MS),
      );
    }
  }

  /** Les révélations à ranger au `save`. */
  newReveals(): readonly MailRecipientReveal[] {
    return [...this.pending];
  }
}
