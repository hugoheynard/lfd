/**
 * Les textes des e-mails de **la demande de modification d'une commande**
 * (plan `documentation/commandes/plan-modifier-une-commande.md`, M4) : le
 * commerce a appliqué, ou refusé, ce que le client a demandé après l'heure
 * limite. Section par clé du registre (`B2bMails`).
 */

/** « Votre modification est faite. » */
export interface OrderChangeAppliedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  readonly title: string;
  /** `{ref}`. */
  readonly intro: string;
  /** Le libellé du nouveau total TTC, lu sur la révision appliquée. */
  readonly totalLabel: string;
  /** Le total a monté. `{amount}` = l'écart, `{previous}` = l'ancien total. */
  readonly moreToPay: string;
  /** Le total a baissé. `{amount}`, `{previous}`. */
  readonly lessToPay: string;
  /** Le total n'a pas bougé. */
  readonly sameTotal: string;
  /** Où relire la commande à jour. */
  readonly where: string;
  readonly footer: string;
}

/** « Nous n'avons pas pu faire votre modification. » */
export interface OrderChangeRefusedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** Objet du message. `{ref}`. */
  readonly subject: string;
  readonly title: string;
  /** `{ref}`. */
  readonly intro: string;
  /** Le libellé du mot de l'équipe, au-dessus de lui. */
  readonly reasonLabel: string;
  /** Ce que devient la commande : inchangée. */
  readonly unchanged: string;
  readonly footer: string;
}

/** La famille « demande de modification », une section par clé du registre. */
export interface OrderChangeMailsCopy {
  readonly "customer.order-change-applied": OrderChangeAppliedCopy;
  readonly "customer.order-change-refused": OrderChangeRefusedCopy;
}
