/**
 * **L'encours d'un compte ouvert au comptoir**, par lot : la somme des
 * commandes au compte non annulées de chaque société, en centimes TTC. Un tel
 * compte n'est jamais facturé avant sa conversion (§ 3.6) : ses commandes au
 * compte sont donc tout son dû. Une requête pour toutes les sociétés — la page
 * des comptes du comptoir la lit pour toutes ses lignes.
 *
 * Une société sans commande au compte est absente de la table (lire 0).
 */
export abstract class CounterAccountOutstandingReader {
  abstract outstandingOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, number>>;
}
