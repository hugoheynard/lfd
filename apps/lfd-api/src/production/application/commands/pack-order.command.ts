/**
 * **Déclarer le bac fait**, depuis le scan de la feuille d'atelier.
 *
 * Le jour accompagne la référence : une feuille appartient à une journée, et
 * c'est elle qui porte l'agrégat. La chercher sans son jour obligerait à
 * balayer les journées — et une même référence ne vit que dans une seule.
 */
export class PackOrderCommand {
  constructor(
    readonly serviceDay: string,
    readonly reference: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffSubject: string,
  ) {}
}
