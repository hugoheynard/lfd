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
  ) {}
}
