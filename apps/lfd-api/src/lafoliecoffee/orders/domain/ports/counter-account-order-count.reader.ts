/**
 * **Le nombre de commandes au compte d'un compte ouvert au comptoir**, par
 * lot (`plan-comptes-du-comptoir.md`, § 4) : les mêmes commandes que
 * l'encours (`CounterAccountOutstandingReader`) — au compte, non
 * annulées —, comptées. Une requête pour toute la page.
 *
 * Une société sans commande au compte est absente de la table (lire 0).
 */
export abstract class CounterAccountOrderCountReader {
  abstract countOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
