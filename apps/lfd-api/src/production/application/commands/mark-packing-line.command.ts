/**
 * **Mettre une ligne dans le bac** — « celle-là y est ».
 *
 * Le jour accompagne la référence et le SKU : un bon appartient à une journée,
 * et c'est elle qui porte l'agrégat. Les initiales viennent de la charge,
 * l'auteur jamais — un fait daté sans auteur ne se conteste pas, il s'efface.
 */
export class MarkPackingLineCommand {
  constructor(
    readonly serviceDay: string,
    readonly reference: string,
    readonly sku: string,
    /** Deux lettres au crayon. Vide autorisé : on coche d'abord, on signe si on veut. */
    readonly initials: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffSubject: string,
  ) {}
}
