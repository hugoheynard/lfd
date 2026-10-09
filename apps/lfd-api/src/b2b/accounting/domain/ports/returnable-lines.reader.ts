import type { ReturnableLine } from "../entities/collection-return.js";

/**
 * Les lignes de lot qu'un retour peut viser, telles que le lot les a figées
 * (plan `retours-bancaires.md`). Jamais d'IBAN : un retour n'en a
 * pas besoin, et ce qui ne sort pas ne fuit pas.
 */
export abstract class ReturnableLinesReader {
  /** Par le lot et le rang — la saisie depuis l'écran du lot. */
  abstract lineOf(batchId: string, rank: number): Promise<ReturnableLine | null>;

  /** Par `EndToEndId` — l'appariement d'un fichier de la banque (R5b). Les inconnus sont absents. */
  abstract byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, ReturnableLine>>;

  /** Parmi ces `EndToEndId`, ceux qui ont déjà un retour. */
  abstract alreadyReturned(endToEndIds: readonly string[]): Promise<ReadonlySet<string>>;
}
