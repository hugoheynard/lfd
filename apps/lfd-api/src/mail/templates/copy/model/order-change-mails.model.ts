/**
 * Les textes des e-mails de **la demande de modification d'une commande**
 * (voir `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)) : le
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
  /** Le seul recours dit : le service commercial (Hugo, 2026-10-28). */
  readonly contactSales: string;
}

/**
 * « Votre commande est modifiée. » — toute révision appliquée hors d'une
 * demande (doc `modifier-une-commande.md`, § 2.8) : M1 du client ou de
 * l'équipe, ou la hausse payée par carte. La phrase sur l'argent dépend du
 * règlement ; à total égal, aucune.
 */
export interface OrderRevisedCopy {
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly title: string;
  /** `{ref}`. */
  readonly intro: string;
  /**
   * Le total a changé. `{previous}` = l'ancien total, `{total}` = le nouveau,
   * chacun écrit seul (particulier), par {@link pretaxAmount} (pro au compte)
   * ou par {@link bothAmounts} (pro qui paie par carte).
   */
  readonly totalShift: string;
  /** Le total n'a pas bougé. `{total}`, écrit comme dans {@link totalShift}. */
  readonly sameTotal: string;
  /** Un total d'un pro au compte, hors taxe (F5). `{pretax}`. */
  readonly pretaxAmount: string;
  /** Un total d'un pro qui paie par carte : le TTC payé d'abord, puis le HT. `{withTax}`, `{pretax}`. */
  readonly bothAmounts: string;
  /** Au compte, ou à total nul : la facture portera le nouveau total. */
  readonly invoice: string;
  /** Carte, total en hausse : la différence est déjà payée. `{amount}` = l'écart. */
  readonly cardCharged: string;
  /** Carte, total en baisse : la différence sera rendue. `{amount}` = l'écart. */
  readonly cardRefunded: string;
  /** Le bouton vers CETTE commande. */
  readonly cta: string;
  readonly footer: string;
}

/** La famille « demande de modification », une section par clé du registre. */
export interface OrderChangeMailsCopy {
  readonly "customer.order-revised": OrderRevisedCopy;
  readonly "customer.order-change-applied": OrderChangeAppliedCopy;
  readonly "customer.order-change-refused": OrderChangeRefusedCopy;
}
