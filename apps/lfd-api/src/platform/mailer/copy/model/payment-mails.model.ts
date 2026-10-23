/**
 * Les textes des e-mails **de l'argent d'une commande** : le paiement refusé,
 * le paiement arrivé trop tard, le lien de règlement, l'annulation.
 */

/**
 * Ce que dit le courriel d'un **paiement refusé**.
 *
 * 🔴 Le seul courriel du parcours qui annonce une **mauvaise** nouvelle, et il
 * doit donc faire trois choses qu'aucun autre ne fait : dire sans détour que le
 * paiement n'est pas passé, dire ce que devient la commande, et donner le geste
 * de sortie. Une formule feutrée ferait relire deux fois pour comprendre qu'il
 * faut agir.
 */
export interface PaymentFailedCopy {
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  /** Sur-titre de l'en-tête, en capitales. */
  readonly kicker: string;
  readonly title: string;
  /** Ce qui s'est passé, en une phrase. */
  readonly intro: string;
  /**
   * 🔴 Ce que devient la commande. La phrase la plus importante du message :
   * sans elle, le client ne sait pas s'il doit repasser commande, attendre, ou
   * se présenter au comptoir.
   */
  readonly consequence: string;
  /** Le libellé de la ligne de montant. */
  readonly amountLabel: string;
  /** Le geste de sortie — reprendre le règlement. */
  readonly cta: string;
  /** Le recours, quand le bouton ne mène nulle part. */
  readonly footer: string;
}

/**
 * Ce que dit le courriel d'un **paiement arrivé trop tard** : la clôture de la
 * journée a annulé la commande. Mêmes trois devoirs que le refus — ce qui
 * s'est passé, ce que devient la commande, et « rien n'a été débité » — mais
 * sans geste de reprise : il n'y a plus rien à régler.
 */
export interface PaymentExpiredCopy {
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  readonly kicker: string;
  readonly title: string;
  readonly intro: string;
  /** 🔴 La commande est annulée, et rien n'a été débité. */
  readonly consequence: string;
  readonly amountLabel: string;
  readonly footer: string;
}

/**
 * **« Votre commande a été annulée par notre équipe »** (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.5). Ni QR, ni
 * motif : le motif est interne. Distinct de l'abandon et de l'expiration —
 * ici, c'est l'équipe qui a agi.
 */
export interface OrderCancelledCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  readonly title: string;
  /** `{ref}`, `{day}` — le jour de retrait ou de livraison, en lettres. */
  readonly intro: string;
  /** Sans jour de service connu. `{ref}`. */
  readonly introWithoutDay: string;
  /** Lot C6 : le client a annulé lui-même. `{ref}`, `{day}`. */
  readonly introBySelf: string;
  /** Le même, sans jour. `{ref}`. */
  readonly introBySelfWithoutDay: string;
  /** Lot C6 : un autre membre de la société a annulé. `{name}`, `{company}`, `{ref}`, `{day}`. */
  readonly introByMember: string;
  /** Le même, sans jour. `{name}`, `{company}`, `{ref}`. */
  readonly introByMemberWithoutDay: string;
  /**
   * Lot C1 des sous-comptes (§7.9) : un membre du compte PRINCIPAL a annulé la
   * commande du site. `{name}`, `{principal}` (son enseigne), `{ref}`, `{day}`.
   */
  readonly introByPrincipal: string;
  /** Le même, sans jour. `{name}`, `{principal}`, `{ref}`. */
  readonly introByPrincipalWithoutDay: string;
  /** Total nul : rien à facturer. */
  readonly nothingBilled: string;
  /** Carte non payée, fermée chez Stripe : rien n'a été prélevé. */
  readonly nothingCharged: string;
  /** Au compte, ni facturée ni prélevée (lot C5). */
  readonly nothingInvoiced: string;
  /** Lot C4 : `{amount}` le reste payé par carte, rendu sur la même carte. */
  readonly refundToCard: string;
  /** Lot C4 : le paiement a déjà été rendu en entier — rien ne part. */
  readonly alreadyRefunded: string;
  /** Le bon de fidélité utilisé est rendu (lot C3b). `{value}`, `{day}` — sa date limite. */
  readonly voucherReturned: string;
  /**
   * Le bon retrouve sa valeur, son reliquat refondu dedans (lot C3b).
   * `{value}`, `{day}`, `{remainder}`. Un bon échu n'a pas de phrase : le
   * courriel se tait sur lui (Q2).
   */
  readonly voucherMerged: string;
  readonly footer: string;
}

/**
 * **« Votre commande reste à régler »** — le lien renvoyé par la
 * comptabilité. Une question : combien, et où payer.
 */
export interface OrderPaymentLinkCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** `{ref}`. */
  readonly subject: string;
  readonly title: string;
  /** `{ref}`. */
  readonly intro: string;
  /** Le geste : la régler par carte, depuis l'espace. */
  readonly howToPay: string;
  readonly amountLabel: string;
  readonly cta: string;
  readonly footer: string;
}

/** La famille « paiement et annulation », une section par clé du registre. */
export interface PaymentMailsCopy {
  readonly "customer.payment-failed": PaymentFailedCopy;
  readonly "customer.payment-expired": PaymentExpiredCopy;
  readonly "customer.order-payment-link": OrderPaymentLinkCopy;
  readonly "customer.order-cancelled": OrderCancelledCopy;
}
