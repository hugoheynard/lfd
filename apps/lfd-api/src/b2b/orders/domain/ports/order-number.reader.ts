/**
 * Le numéro d'une commande à partir de son identifiant — ce que la fidélité
 * montre au client sur une ligne de gain (« Commande CMD-… », plan des points,
 * E1.1). Le livre ne garde qu'un identifiant opaque : c'est la commande qui dit
 * son nom, la fidélité ne lit pas ses tables.
 */
export abstract class OrderNumberReader {
  /** Pour chaque commande citée, son numéro — absente de la table si elle n'existe pas. */
  abstract numbersOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
