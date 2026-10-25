/**
 * Les textes de **« Écrire au client » après un départ incomplet** (plan
 * plan E6d (`documentation/commandes/bon-de-livraison.md`), § 1). Section par
 * clé du registre (`B2bMails`).
 *
 * Deux sortes de textes, et la distinction est le sujet :
 *
 * - le **cadre** (`kicker`, `subject`, `title`, `footer`) : le gabarit le
 *   rend tel quel, comme tout e-mail ;
 * - la **proposition** (`intro` … `closing`) : elle rédige le texte que
 *   l'équipe relit et corrige avant d'envoyer. Le gabarit ne la rend jamais :
 *   il rend le texte RELU, qui est une donnée. Réécrire ces phrases à l'écran
 *   des textes change ce qui est proposé, pas ce qui a déjà été envoyé.
 */
export interface OrderShortfallCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  readonly title: string;
  /** Proposition — l'ouverture. `{ref}`. */
  readonly intro: string;
  /** Proposition — au-dessus des articles qui partent. */
  readonly departedHeading: string;
  /** Proposition — au-dessus des articles qui manquent. */
  readonly missingHeading: string;
  /** Proposition — un article. `{quantity}`, `{product}`. */
  readonly line: string;
  /** Proposition — la suite, quand le reste est abandonné. */
  readonly remainderAbandoned: string;
  /** Proposition — la fin. */
  readonly closing: string;
  readonly footer: string;
}

/** La famille « départ incomplet », une section par clé du registre. */
export interface OrderShortfallMailsCopy {
  readonly "customer.order-shortfall": OrderShortfallCopy;
}
