/** Un taux nommé. */
export interface VatRateName {
  readonly id: string;
  readonly name: string;
}

/**
 * **Le nom de ces taux-là**, rangés du plus bas au plus haut — ce qu'un
 * lecteur cite d'un taux sans charger l'agrégat. Un identifiant inconnu est
 * omis.
 *
 * Port de LECTURE à part du dépôt (ISP) : nommer n'a besoin ni du
 * pourcentage, ni de l'archive, ni des usages.
 */
export abstract class VatRateNamesReader {
  abstract namesOf(ids: readonly string[]): Promise<readonly VatRateName[]>;
}
