/**
 * Relire la **pièce déposée** — le mandat papier signé, scanné.
 *
 * Vise la société, pas le mandat : c'est ce que la fiche affiche, et c'est du
 * mandat COURANT qu'on veut la preuve. Un jour où il faudra produire celle d'un
 * mandat révoqué — une contestation sur un prélèvement ancien — cette requête
 * prendra un identifiant de mandat, et ce jour-là l'écran devra dire lequel.
 */
export class GetMandateProofQuery {
  constructor(readonly companyId: string) {}
}
