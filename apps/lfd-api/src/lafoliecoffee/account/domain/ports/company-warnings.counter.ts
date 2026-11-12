/**
 * Le **nombre d'avertissements** de tout le portefeuille, pour le compteur du
 * menu du back-office.
 *
 * Un port à part d'`AdminCompanyReader` : le menu veut un entier, et lui faire
 * lire la liste entière (identités, contacts, KBIS, pièces) pour une somme lui
 * coûtait la table. La règle reste unique — `companyWarnings` —, seule la
 * lecture est plus étroite.
 */
export abstract class CompanyWarningsCounter {
  /** La somme des avertissements de toutes les sociétés, à l'instant de la requête. */
  abstract count(): Promise<number>;
}
