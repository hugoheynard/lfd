import type { MailSubjectType } from "../requests/mail-subject.js";

/**
 * L'état d'une DEMANDE, notre côté, en code anglais — les mêmes valeurs que
 * le suivi des envois (`le-suivi-des-e-mails.md`, décision 12) : `accepted`
 * est le `sent` de la base, Resend a pris l'e-mail, rien de plus.
 */
export type SubjectMailState = "requested" | "sending" | "accepted" | "failed" | "refused";

/**
 * Le retour du FOURNISSEUR. `dry_run` : acceptée à blanc, rien n'est parti
 * et rien ne reviendra — jamais confondu avec « rien reçu » (`null`).
 */
export type SubjectMailDelivery = "dry_run" | "delayed" | "delivered" | "complained" | "bounced";

/**
 * **Un e-mail demandé pour un sujet**, tel que son suivi le dit — JAMAIS
 * l'adresse, ni la raison d'un échec (elle peut la citer) : la fiche d'une
 * commande lit un état, pas un destinataire.
 */
export interface SubjectMail {
  /** L'identifiant de la fiche de suivi (`/emails/envois`). */
  readonly requestId: string;
  /** La clé du registre (`customer.order-ready`). */
  readonly template: string;
  readonly requestedAt: Date;
  readonly state: SubjectMailState;
  /** `null` : rien reçu du fournisseur. */
  readonly delivery: SubjectMailDelivery | null;
  /** L'instant du retour ; `null` sans retour (et pour `dry_run`). */
  readonly deliveryAt: Date | null;
}

/**
 * **Les e-mails de ces sujets** (plan `plan-sujet-des-e-mails.md`, règle 6) —
 * déclaré ET implémenté par le bloc `mail`, lu par les blocs métier : la
 * figure d'`OrderHandoverHistoryReader`. Le bloc ne sait pas ce qu'est une
 * commande ; il rend les fiches qui portent ce couple `(type, id)`.
 *
 * Par lot : une liste de commandes en lirait une par ligne, ce serait un N+1.
 * Le lecteur ne prouve pas que l'objet existe — c'est à l'appelant de le
 * faire d'abord (règle 7) : un identifiant arbitraire ne doit rien lire.
 */
export abstract class MailSubjectDeliveries {
  /**
   * Pour chaque id, ses e-mails, les plus récents d'abord ; un id sans
   * e-mail est absent de la carte.
   */
  abstract forSubjects(
    type: MailSubjectType,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, readonly SubjectMail[]>>;
}
