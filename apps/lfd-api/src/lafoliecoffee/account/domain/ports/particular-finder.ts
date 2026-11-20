import type { ParticularSearchTerm } from "../value-objects/particular-search-term.js";

/**
 * Un particulier tel que le lit la recherche du comptoir — coordonnées en
 * clair : c'est l'application qui les masque avant de les servir.
 */
export interface ParticularRecord {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly connectable: boolean;
}

/**
 * Port de **lecture** : les particuliers — comptes connectables et fiches
 * invitées, rattachés à aucune société, non désactivés — dont le prénom, le
 * nom, l'adresse ou le téléphone répond à la recherche.
 *
 * Déclaré et implémenté par `account`, qui possède `users` ; distinct du port
 * d'écriture `ParticularRegistry` (ISP).
 */
export abstract class ParticularFinder {
  /** Au plus `limit` particuliers, par prénom. */
  abstract search(term: ParticularSearchTerm, limit: number): Promise<readonly ParticularRecord[]>;
}
