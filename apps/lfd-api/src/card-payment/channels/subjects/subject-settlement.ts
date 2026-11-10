import type { SubjectRefundOutcome } from "./refund-outcome.js";

/**
 * **Le canal retour** : ce que `card-payment` demande au bloc qui possède un
 * type de sujet (plan M2, §3.3). DÉCLARÉ ici, IMPLÉMENTÉ par le bloc métier
 * (`b2b/orders` pour `order`, lot P0.c2), relié par `appBootstrap/` — la
 * figure de `production/channels/commerce/`. `card-payment` ne sait pas ce
 * qu'est une commande : il sait qu'un implémenteur en répond.
 */

/** Un sujet, tel que le canal le passe : opaque. */
export interface CardSubject {
  /** `order` aujourd'hui. */
  readonly type: string;
  readonly id: string;
}

/**
 * Ce que le sujet a fait d'un encaissement :
 * - `applied` — il a franchi (la commande passe `paid`, et publie son fait) ;
 * - `refused` — il n'en veut pas : annulé, il demandera le remboursement ;
 * - `already_applied` — il était déjà réglé (un webhook traité par l'image
 *   d'avant le bloc, ou rejoué) : rien n'a franchi.
 */
export type SubjectPaidOutcome = "applied" | "refused" | "already_applied";

/** Le rôle d'un paiement pour son sujet : le premier, ou un complément (S2). */
export type SubjectPaymentRole = "first" | "complement";

/**
 * Le règlement **tel que le sujet le voit** (pour une commande, son
 * `payment_status`, et `closed` si elle est annulée sans avoir été payée) —
 * rien de plus (§4.3, §5.2).
 */
export type SubjectSettledState = "paid" | "pending" | "failed" | "closed";

/** « Ce paiement est-il à toi, et où en es-tu ? » (§4.6) — la réponse. */
export interface SubjectClaim {
  readonly subject: CardSubject;
  readonly amountCents: number;
  readonly role: SubjectPaymentRole;
  readonly settled: SubjectSettledState;
}

/** Une référence prestataire que le sujet porte, pour le rattrapage (§4.3). */
export interface SubjectReference extends SubjectClaim {
  readonly providerRef: string;
}

/** Comment l'équipe désigne le sujet : un libellé et l'écran qui l'ouvre. */
export interface SubjectDescription {
  readonly label: string;
  readonly link: string;
}

/**
 * Un implémenteur par `subject_type`. Chaque méthode qui écrit s'exécute dans
 * la transaction de `card-payment` (§3.6) : le sujet y prend son propre
 * verrou, et n'en ouvre pas d'autre.
 */
export abstract class SubjectSettlement {
  /** Le type de sujet servi — un seul implémenteur par type. */
  abstract readonly subjectType: string;

  /**
   * **Le paiement est encaissé.** Appelé AVANT que `card-payment` écrive sa
   * ligne, dans la même transaction (§3.6) ; le sujet pose sa vue et publie
   * ses faits au franchissement.
   *
   * `role` (plan S2, §2.5) : le rôle que la ligne porte — le sujet route sur
   * lui, jamais sur l'absence d'une autre trace (un complément ne passe pas
   * pour le premier).
   */
  abstract onPaid(
    subject: CardSubject,
    paymentId: string,
    amountCents: number,
    role: SubjectPaymentRole,
  ): Promise<SubjectPaidOutcome>;

  /** **Le paiement est refusé par la banque.** Même transaction, même ordre, même rôle. */
  abstract onPaymentFailed(
    subject: CardSubject,
    paymentId: string,
    role: SubjectPaymentRole,
  ): Promise<void>;

  /**
   * **Le verrou du sujet** (§3.3, §3.6, v9) — le sujet prend SON `FOR UPDATE`
   * dans la transaction ambiante (pour `order`, la ligne `orders`, le même que
   * la facture carte). Toute écriture de `card-payment` sur l'argent d'un
   * sujet l'appelle EN PREMIER, avant ses propres lignes : c'est l'ordre de
   * l'annulation, partout. Idempotent dans une même transaction.
   */
  abstract lockSubject(subject: CardSubject): Promise<void>;

  /**
   * **Ce qu'un remboursement a fait** (§3.3, §3.6, v11) — appelé APRÈS que
   * `card-payment` a écrit ses lignes et ses faits, dans la même transaction,
   * avec la position recalculée. Le sujet pose sa vue (pour `order` :
   * `refunded` quand Σ réussi = encaissé et qu'elle était `paid`, ou la rend),
   * puis publie SES faits et SON journal.
   */
  abstract onRefundOutcome(subject: CardSubject, outcome: SubjectRefundOutcome): Promise<void>;

  /** Le sujet est-il annulé ? Lu dans la transaction de l'appelant. */
  abstract isCancelled(subject: CardSubject): Promise<boolean>;

  /** Le libellé et le lien des cloches de `card-payment`. */
  abstract describe(subject: CardSubject): Promise<SubjectDescription>;

  /**
   * « Cette intention est-elle à toi ? » — pour une référence que la ligne ne
   * connaît pas (une intention de l'image d'avant le bloc, §4.6). `null` :
   * elle n'est pas à ce type de sujet. Lecture seule.
   */
  abstract claim(account: string, providerRef: string): Promise<SubjectClaim | null>;

  /**
   * Les références des sujets du type **créés depuis `since`** — une borne
   * connue, jamais un balayage de tout l'existant (§4.3). Lecture seule.
   */
  abstract referencesSince(since: Date): Promise<readonly SubjectReference[]>;
}
