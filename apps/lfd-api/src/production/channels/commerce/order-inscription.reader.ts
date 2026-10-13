/**
 * **« Le fournil a-t-il inscrit cette commande, et à quel jour ? »** — port de
 * LECTURE que le fournil déclare et implémente, pour le commerce (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C3.3 et C3.8).
 *
 * Il sert l'AFFICHAGE : le détail staff d'une commande dit d'avance si elle
 * s'annule. Il ne décide de rien — sans verrou, sa réponse peut vieillir d'un
 * instant ; la décision se reprend sous verrou par {@link OrderWithdrawalDesk}.
 *
 * Distinct du guichet (ISP) : qui affiche n'a rien à verrouiller ni à écrire.
 */
export abstract class OrderInscriptionReader {
  /** Le jour de service `AAAA-MM-JJ` où la commande est inscrite, ou `null`. */
  abstract inscribedDayOf(orderId: string): Promise<string | null>;
}
