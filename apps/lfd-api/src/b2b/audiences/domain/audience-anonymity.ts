/**
 * **Le seuil d'anonymat** : une case du tableau qui compte moins de clients
 * distincts que ce nombre n'affiche aucun chiffre, seulement « trop peu de
 * clients ».
 *
 * Même seuil que les suggestions collectives
 * (`documentation/recommandation-produit/historique-du-particulier.md` §1 bis) :
 * sous lui, le panier moyen d'une case dirait celui d'une personne.
 */
export const AUDIENCE_MIN_CLIENTS = 5;

/** La case a-t-elle assez de clients distincts pour montrer ses chiffres ? */
export function hasEnoughClients(clients: number): boolean {
  return clients >= AUDIENCE_MIN_CLIENTS;
}
