/**
 * **Le rouge d'une ligne** — « combien est réellement sorti ? » (
 * `documentation/fournil/les-niveaux-de-suivi.md`).
 */
export class ReportProblemCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    /** Ce qui est réellement sorti : il devient le plafond de la ligne. */
    readonly produced: number,
    /** Brute ; vide ou absente = aucune raison. */
    readonly reason: string | null,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double appui ne refait pas le rouge. */
    readonly intentKey: string,
  ) {}
}
