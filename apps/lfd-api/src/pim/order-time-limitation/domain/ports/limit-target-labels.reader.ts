/** Une portée telle que la table la range : le type en chaîne, la cible ou rien. */
export interface ScopeTarget {
  readonly scopeType: string;
  readonly scopeId: string | null;
}

/**
 * **Les noms des cibles visées, par identifiant** — une famille par son nom,
 * un produit ou une déclinaison par son SKU.
 *
 * Déclaré ici et implémenté par la racine : les cibles appartiennent au
 * catalogue, que les limites ne lisent pas. Partagé par la liste des règles
 * (l'écran) et par le nom qu'un fait fige au journal (`PrismaLimitScopeNamer`) :
 * les deux disent la même cible avec les mêmes mots. Une cible disparue est
 * absente.
 */
export abstract class LimitTargetLabelsReader {
  abstract labelsOf(targets: readonly ScopeTarget[]): Promise<ReadonlyMap<string, string>>;
}
