/**
 * **Ce qu'on garde d'un e-mail** : qu'on l'a envoyé, et ce qu'il est devenu.
 *
 * Sans ce journal, le webhook Resend est muet d'avance : il annonce qu'un
 * message a rebondi en donnant son identifiant fournisseur, et rien de notre
 * côté ne sait à quel gabarit ni à quelle personne cet identifiant correspond.
 * L'émission doit donc laisser une trace **avant** que la réception serve.
 */

/** Où en est un envoi. Ordonné du plus tôt au plus grave — cf. `outranks`. */
export type MailStatus = "sent" | "delayed" | "delivered" | "complained" | "bounced";

export interface MailSendRecord {
  /** L'identifiant Resend. `null` en mode à blanc : rien n'est parti. */
  readonly providerId: string | null;
  /** Le gabarit — c'est lui qui sert de **catégorie** dans les relevés. */
  readonly template: string;
  readonly recipient: string;
  readonly at: Date;
}

export interface MailOutcome {
  readonly providerId: string;
  readonly status: MailStatus;
  readonly at: Date;
  readonly detail: string;
}

/**
 * Le rang d'un statut. Il tranche les événements **arrivés dans le désordre** :
 * les webhooks n'ont aucune garantie d'ordre, et un « envoyé » qui arriverait
 * après un « rebondi » effacerait l'information la plus importante.
 *
 * `complained` et `bounced` priment sur `delivered` **exprès** : une plainte
 * arrive toujours après la livraison, et c'est elle qui compte.
 */
const RANK: Readonly<Record<MailStatus, number>> = {
  sent: 0,
  delayed: 1,
  delivered: 2,
  complained: 3,
  bounced: 4,
};

/** Vrai si `next` doit remplacer `current`. */
export function outranks(next: MailStatus, current: MailStatus): boolean {
  return RANK[next] > RANK[current];
}

export abstract class MailJournal {
  /** Note qu'un e-mail est parti. Ne jette jamais : un journal ne bloque pas un envoi. */
  abstract recordSend(record: MailSendRecord): Promise<void>;

  /** Note ce qu'il est devenu. Sans effet si l'identifiant est inconnu. */
  abstract recordOutcome(outcome: MailOutcome): Promise<void>;

  /**
   * Retient un message de webhook, et dit s'il est **nouveau**.
   *
   * Svix réessaie : le même événement arrive plusieurs fois, et le traiter deux
   * fois compterait deux rebonds pour un seul.
   *
   * ⚠️ Ce registre n'a rien de spécifiquement postal — Stripe aurait le même
   * besoin. Il vit ici tant qu'il n'a qu'un consommateur ; on le sortira au
   * SECOND, pas avant, comme tout le reste.
   */
  abstract rememberEvent(provider: string, externalId: string): Promise<boolean>;
}
