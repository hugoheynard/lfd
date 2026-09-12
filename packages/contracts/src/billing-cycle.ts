/**
 * **Le cycle de prélèvement**, tel que l'écran le lit.
 *
 * Deux instants, et rien de plus. Pas de « progression », pas de « jours
 * restants » : ce sont des calculs de PRÉSENTATION, que l'écran fait avec sa
 * propre horloge. Les renvoyer figerait une valeur qui vieillit entre la réponse
 * et l'affichage, et donnerait deux définitions de « où en est-on ».
 *
 * 🔴 Ce que la vue ne porte PAS non plus, et c'est délibéré : le **montant** du
 * cycle. Un cycle n'a pas un montant — il a un montant par tentative de
 * prélèvement, reconstitué à chaque présentation (cf. §0 quater du doc). Un
 * total figé sur le cycle mentirait dès le premier rejet.
 */
export interface BillingCycleView {
  /** Inclusif : une commande passée exactement à cet instant est dans ce cycle. */
  readonly startsAt: string;
  /** **Exclusif** : une commande passée à cet instant appartient au suivant. */
  readonly closesAt: string;
}
