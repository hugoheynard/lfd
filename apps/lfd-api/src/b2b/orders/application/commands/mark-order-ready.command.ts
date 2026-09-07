/**
 * Déclare une commande **prête** — le scan du QR de colisage.
 *
 * `staffSubject` n'est jamais dans la charge utile : il vient du `Principal`
 * résolu par le guard. Le porteur du code ne peut pas se désigner lui-même comme
 * auteur du colisage — et le code, lui, est imprimé en clair sur la feuille.
 */
export class MarkOrderReadyCommand {
  constructor(
    readonly reference: string,
    readonly staffSubject: string,
    /**
     * L'instant du COLISAGE, tel que le fournil l'a constaté.
     *
     * 🔴 Il vient du fait, plus de l'horloge d'ici. Le colisage est déclaré par
     * la production ; le commerce l'apprend par un abonné qui tourne un instant
     * plus tard, et parfois lors d'une réannonce. Prendre l'heure à la réception
     * daterait la transition du moment où on l'a apprise, pas de celui où elle a
     * eu lieu — et c'est cette heure-là qu'on cherche quand une commande arrive
     * en retard.
     */
    readonly at: Date,
  ) {}
}
