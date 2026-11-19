/**
 * **L'identifiant technique d'une entrée, par son code** — ce que les liaisons
 * d'un ingrédient écrivent : le fil et le journal parlent en codes, la base
 * joint par identifiant.
 *
 * Un port à part du catalogue (ISP) : la liaison n'a besoin que de cette
 * traduction, pas du référentiel cousu. Les entrées archivées en sont — une
 * liaison existante ne devient pas illisible parce que l'entrée est retirée.
 */
export abstract class AllergenEntryIdsReader {
  /** Code → identifiant, pour les codes connus ; un code inconnu est absent. */
  abstract idsOfCodes(codes: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
