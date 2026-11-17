/**
 * **« Fait »** — la ligne est sortie en entier (
 * `documentation/fournil/les-niveaux-de-suivi.md`) : une fournée du
 * reste à sortir, sous le plafond s'il y en a un.
 */
export class MarkLineDoneCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double appui ne déclare qu'une fournée. */
    readonly intentKey: string,
  ) {}
}
