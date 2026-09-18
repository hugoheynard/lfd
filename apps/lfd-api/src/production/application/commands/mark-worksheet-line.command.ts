/**
 * **Cocher une ligne de la fiche d'atelier** — « c'est sorti du four ».
 *
 * Le jour accompagne le SKU : un compte à produire appartient à une journée, et
 * c'est elle qui porte l'agrégat. Les initiales viennent de la charge, l'auteur
 * jamais — un fait daté sans auteur ne se conteste pas, il s'efface.
 */
export class MarkWorksheetLineCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    /** Deux lettres au crayon. Vide autorisé : on coche d'abord, on signe si on veut. */
    readonly initials: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
